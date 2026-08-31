import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import QRCode from 'qrcode';

const DEFAULT_PRINTER_URI = 'http://192.168.16.142:631/ipp/print';

function buildLine(doc, label, value, y) {
  doc.drawText(label, { x: 18, y, size: 10, font: doc.fonts.regular, color: rgb(0.42, 0.45, 0.5) });
  doc.drawText(value, { x: 110, y: y - 1, size: 13, font: doc.fonts.bold, color: rgb(0.07, 0.09, 0.16) });
}

export async function buildLabelPdfBuffer({ supplier, buyer }) {
  const qrBuffer = await QRCode.toBuffer(
    JSON.stringify({
      t: 'B',
      bid: buyer.bid,
      bn: buyer.bn,
      bd: buyer.bd,
      ref: buyer.ref,
      qty: buyer.qty,
    }),
    {
      type: 'png',
      width: 240,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#111111', light: '#ffffff' },
    }
  );

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([288, 432]);
  const { width, height } = page.getSize();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  page.fonts = { regular, bold };

  const qrImage = await pdf.embedPng(qrBuffer);

  page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(1, 1, 1) });
  page.drawText('Buyer Label', { x: 18, y: height - 34, size: 16, font: bold, color: rgb(0.07, 0.09, 0.16) });
  page.drawText('QR Label Matching System', { x: 18, y: height - 52, size: 9, font: regular, color: rgb(0.42, 0.45, 0.5) });

  page.drawImage(qrImage, { x: 72, y: height - 196, width: 144, height: 144 });

  page.drawRectangle({ x: 18, y: 20, width: 252, height: 176, borderColor: rgb(0.82, 0.84, 0.86), borderWidth: 1 });

  buildLine(page, 'Supplier', supplier.sn, 138);
  buildLine(page, 'Supplier Code', supplier.sd, 114);
  buildLine(page, 'Buyer', buyer.bn, 90);
  buildLine(page, 'Buyer Code', buyer.bd, 66);
  buildLine(page, 'Item', buyer.ref, 42);
  buildLine(page, 'Qty', String(buyer.qty), 18);

  page.drawText(`Printed at: ${new Date().toLocaleString()}`, {
    x: 18,
    y: 8,
    size: 8.5,
    font: regular,
    color: rgb(0.42, 0.45, 0.5),
  });

  return Buffer.from(await pdf.save());
}

function writeText(lines) {
  return Buffer.from(`${lines.join('\r\n')}\r\n`, 'ascii');
}

function sanitizeAscii(value) {
  return String(value || '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .trim();
}

function escPosQrCommand(fn, payload = Buffer.alloc(0)) {
  const pL = (payload.length + 3) & 0xff;
  const pH = ((payload.length + 3) >> 8) & 0xff;
  return Buffer.concat([Buffer.from([0x1d, 0x28, 0x6b, pL, pH, 0x31, fn, 0x30]), payload]);
}

// 58mm thermal printers often use simple ESC/POS command sequences.
export function buildEscPosTicketBuffer({ supplier, buyer }) {
  const chunks = [];
  const qrPayload = sanitizeAscii(`${buyer.bd}|${supplier.sd}|${buyer.bid}`);

  chunks.push(Buffer.from([0x1b, 0x40])); // Initialize printer.
  chunks.push(Buffer.from([0x1b, 0x74, 0x00])); // Select code page CP437.
  chunks.push(Buffer.from([0x1b, 0x33, 24])); // Set line spacing.
  chunks.push(Buffer.from([0x1b, 0x61, 0x01])); // Center align.
  chunks.push(Buffer.from([0x1b, 0x45, 0x01])); // Bold on.
  chunks.push(writeText(['QR LABEL MATCH']));
  chunks.push(Buffer.from([0x1b, 0x45, 0x00])); // Bold off.
  chunks.push(writeText(['------------------------------']));

  // Native ESC/POS QR generation (Model 2).
  chunks.push(escPosQrCommand(0x43, Buffer.from([0x06]))); // Module size.
  chunks.push(escPosQrCommand(0x45, Buffer.from([0x31]))); // Error correction level M.
  chunks.push(escPosQrCommand(0x50, Buffer.concat([Buffer.from([0x30]), Buffer.from(qrPayload, 'ascii')]))); // Store data.
  chunks.push(escPosQrCommand(0x51, Buffer.from([0x30]))); // Print symbol.
  chunks.push(writeText(['']));

  chunks.push(Buffer.from([0x1b, 0x61, 0x00])); // Left align.
  chunks.push(
    writeText([
      `SUPPLIER: ${sanitizeAscii(supplier.sn)}`,
      `SUP CODE: ${sanitizeAscii(supplier.sd)}`,
      `BUYER   : ${sanitizeAscii(buyer.bn)}`,
      `BUY CODE: ${sanitizeAscii(buyer.bd)}`,
      `ITEM    : ${sanitizeAscii(supplier.in_)}`,
      `QTY     : ${sanitizeAscii(String(buyer.qty))}`,
      `DC/COO  : ${sanitizeAscii(`${supplier.dc}/${supplier.coo}`)}`,
      '------------------------------',
      `TIME: ${new Date().toISOString().replace('T', ' ').slice(0, 19)}`,
    ])
  );

  chunks.push(Buffer.from([0x1b, 0x64, 0x06])); // Feed 6 lines.
  chunks.push(Buffer.from([0x1d, 0x56, 0x00])); // Full cut.

  return Buffer.concat(chunks);
}

export function getDefaultPrinterUri() {
  return process.env.PRINTER_URI || DEFAULT_PRINTER_URI;
}
