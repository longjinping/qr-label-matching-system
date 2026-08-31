import { NextResponse } from 'next/server';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildEscPosTicketBuffer, buildLabelPdfBuffer, getDefaultPrinterUri } from '@/lib/label-printer';
import { findSupplierBySid, findBuyerByBid } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function getIpp() {
  const { default: ipp } = await import('ipp');
  return ipp;
}

function executeIpp(printer, operation, payload) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('IPP请求超时，等待打印机响应'));
    }, 12000);

    printer.execute(operation, payload, (error, response) => {
      clearTimeout(timeout);
      if (error) {
        reject(error);
        return;
      }
      resolve(response);
    });
  });
}

async function getSupportedFormats(printer) {
  try {
    const response = await executeIpp(printer, 'Get-Printer-Attributes', {
      'operation-attributes-tag': {
        'requesting-user-name': 'qr-label-nextjs-app',
        'requested-attributes': ['document-format-supported'],
      },
    });

    const formats = response?.['printer-attributes-tag']?.['document-format-supported'];
    if (Array.isArray(formats)) {
      return formats;
    }
    if (typeof formats === 'string') {
      return [formats];
    }
    return [];
  } catch {
    return [];
  }
}

async function printViaCupsRaw({ queueName, dataBuffer, jobName }) {
  const tempFile = path.join(os.tmpdir(), `qr-label-${Date.now()}-${Math.random().toString(16).slice(2)}.bin`);
  await fs.writeFile(tempFile, dataBuffer);

  return new Promise((resolve, reject) => {
    const lp = spawn('lpr', ['-P', queueName, '-l', '-J', jobName, tempFile], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    lp.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    lp.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    lp.on('close', (code) => {
      fs.unlink(tempFile).catch(() => {});

      if (code !== 0) {
        reject(new Error(stderr || stdout || `lp 退出，返回码 ${code}`));
        return;
      }

      const match = stdout.match(/request id is\s+([^\s]+)/i);
      resolve({
        queue: queueName,
        jobRef: match ? match[1] : null,
        rawOutput: (stdout || stderr || 'lpr 已接受作业').trim(),
        payloadBytes: dataBuffer.length,
      });
    });

    lp.on('error', (error) => {
      fs.unlink(tempFile).catch(() => {});
      reject(error);
    });
  });
}

export async function POST(request) {
  const body = await request.json();
  const supplier = await findSupplierBySid(body?.supplier_sid);
  const buyer = await findBuyerByBid(body?.buyer_bid);
  console.debug('print/label POST called', { supplier_sid: body?.supplier_sid, buyer_bid: body?.buyer_bid, printer_mode: body?.printer_mode });

  if (!supplier || !buyer) {
    return NextResponse.json({ error: '未找到供应商或买家' }, { status: 404 });
  }

  const printerMode = body?.printer_mode || process.env.PRINTER_MODE || 'ipp';
  if (printerMode === 'cups_raw') {
    const queueName = body?.queue_name || process.env.CUPS_QUEUE_NAME;
    if (!queueName) {
      return NextResponse.json(
        {
          ok: false,
          error: 'cups_raw 模式需要提供 CUPS 队列名称。请设置 CUPS_QUEUE_NAME 或传入 queue_name。',
        },
        { status: 400 }
      );
    }

    try {
      const escPosBuffer = buildEscPosTicketBuffer({ supplier, buyer });
      const result = await printViaCupsRaw({
        queueName,
        dataBuffer: escPosBuffer,
        jobName: `Label-${buyer.bid}`,
      });

      return NextResponse.json({
        ok: true,
        printer_mode: 'cups_raw',
        queue_name: result.queue,
        job_id: result.jobRef,
        job_output: result.rawOutput,
        payload_bytes: result.payloadBytes,
        status_code: 'successful-ok',
      });
    } catch (error) {
      return NextResponse.json(
        {
          ok: false,
          printer_mode: 'cups_raw',
          queue_name: queueName,
          error: error.message || '发送原始打印作业到 CUPS 队列失败',
        },
        { status: 502 }
      );
    }
  }

  const printerUri = body?.printer_uri || getDefaultPrinterUri();
  const pdfBuffer = await buildLabelPdfBuffer({ supplier, buyer });

  try {
    const ipp = await getIpp();
    const printer = ipp.Printer(printerUri);
    const formatsToTry = ['application/pdf', 'application/octet-stream'];
    const attempted = [];
    let ippResponse = null;
    let acceptedFormat = null;

    for (const docFormat of formatsToTry) {
      const response = await executeIpp(printer, 'Print-Job', {
        'operation-attributes-tag': {
          'requesting-user-name': 'qr-label-nextjs-app',
          'job-name': `Label-${buyer.bid}`,
          'document-format': docFormat,
        },
        data: pdfBuffer,
      });

      const statusCode = response?.statusCode || 'unknown-status';
      attempted.push({ format: docFormat, status_code: statusCode });

      if (String(statusCode).startsWith('successful')) {
        ippResponse = response;
        acceptedFormat = docFormat;
        break;
      }

      if (statusCode !== 'client-error-document-format-not-supported') {
        const statusMessage = response?.['status-message'] || '打印机拒绝了打印作业';
        return NextResponse.json(
          {
            ok: false,
            printer_uri: printerUri,
            status_code: statusCode,
            attempted,
            error: statusMessage,
          },
          { status: 502 }
        );
      }
    }

    if (!ippResponse) {
      const supportedFormats = await getSupportedFormats(printer);
      return NextResponse.json(
        {
          ok: false,
          printer_uri: printerUri,
          status_code: 'client-error-document-format-not-supported',
          attempted,
          supported_formats: supportedFormats,
          error: '打印机不支持此队列的 PDF 打印作业。',
        },
        { status: 502 }
      );
    }

    const statusCode = ippResponse?.statusCode || 'unknown-status';

    const jobId = ippResponse?.['job-attributes-tag']?.['job-id'] ?? null;

    return NextResponse.json({
      ok: true,
      printer_uri: printerUri,
      accepted_format: acceptedFormat,
      status_code: statusCode,
      job_id: jobId,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        printer_uri: printerUri,
        error: error.message || '发送打印作业失败',
      },
      { status: 502 }
    );
  }
}
