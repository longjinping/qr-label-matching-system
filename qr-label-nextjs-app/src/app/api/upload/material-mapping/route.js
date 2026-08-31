import { NextResponse } from 'next/server';
import { createMaterialMapping } from '@/lib/store';

export const runtime = 'nodejs';

// Excel header → DB column
const COLUMN_MAP = {
  '供应商料号': 'supplier_material_code',
  '客户料号': 'customer_material_code',
};

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: '请选择要上传的 Excel 文件' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const XLSX = await import('xlsx-js-style');
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    // 使用 header: 1 按二维数组解析，兼容表头作为第一行数据的情况
    const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    if (!rawRows.length) {
      return NextResponse.json({ error: 'Excel 文件中没有数据' }, { status: 400 });
    }

    const headers = rawRows[0].map(h => String(h).trim());
    const supplierIdx = headers.findIndex(h => h === '供应商料号');
    const customerIdx = headers.findIndex(h => h === '客户料号');
    if (supplierIdx === -1 || customerIdx === -1) {
      return NextResponse.json({ error: 'Excel 中未找到表头"供应商料号"或"客户料号"' }, { status: 400 });
    }

    const results = { success: 0, skipped: 0, errors: [] };
    for (let i = 1; i < rawRows.length; i++) {
      const row = rawRows[i];
      const supplier = String(row[supplierIdx] ?? '').trim().replace(/\n/g, '');
      const customer = String(row[customerIdx] ?? '').trim().replace(/\n/g, '');

      if (!supplier || !customer) {
        results.skipped++;
        results.errors.push(`第${i + 1}行: 缺少供应商料号或客户料号`);
        continue;
      }

      const result = await createMaterialMapping({ supplier_material_code: supplier, customer_material_code: customer });
      if (result.error) {
        results.skipped++;
        results.errors.push(`第${i + 1}行: ${result.error}`);
      } else if (result.skipped) {
        results.skipped++;
      } else {
        results.success++;
      }
    }

    return NextResponse.json(results);
  } catch (err) {
    return NextResponse.json({ error: err.message || '导入失败' }, { status: 500 });
  }
}
