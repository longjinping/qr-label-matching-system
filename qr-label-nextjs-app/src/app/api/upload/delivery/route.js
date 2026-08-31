import { NextResponse } from 'next/server';
import { createDelivery } from '@/lib/store';

export const runtime = 'nodejs';

// xlsx mapping: Excel column header → delivery table column
const COLUMN_MAP = {
  '发货单号': 'delivery_no',
  '发货单行号': 'delivery_line_no',
  '订单号': 'order_no',
  '订单行号': 'order_line_no',
  '行状态': 'line_status',
  '工厂': 'factory',
  'ERP订单号': 'erp_order_no',
  '物料编码': 'material_code',
  '物料描述': 'material_desc',
  '批次号': 'batch_no',
  '生产批次': 'production_batch',
  '发货数量': 'delivery_qty',
  '最小包装数量': 'min_pack_qty',
  '每箱数量': 'qty_per_box',
  '每托数量': 'qty_per_pallet',
  '收货数量': 'received_qty',
  '物流公司': 'logistics_company',
  '物流单号': 'logistics_no',
  '车牌号': 'plate_no',
  '车型': 'vehicle_type',
  '生产日期': 'production_date',
  '来源类型': 'source_type',
  '交货计划单号': 'delivery_plan_no',
  '交货计划单行号': 'delivery_plan_line_no',
  'WMS质检结果': 'wms_qc_result',
  '供方备注': 'supplier_remark',
  '需方备注': 'buyer_remark',
  '实际收货工厂': 'actual_receive_factory',
  '实际收货仓库': 'actual_receive_warehouse',
  '是否已打印': 'is_printed',
};

// Excel serial number → ISO date string (e.g., 46943 → "2026-05-01")
function excelDateToISO(serial) {
  if (!serial && serial !== 0) return '';
  const num = Number(serial);
  if (Number.isNaN(num) || num < 1) return String(serial);
  // Excel epoch: 1899-12-30 (corrected for leap year bug)
  const utcDays = Math.floor(num);
  const date = new Date(Date.UTC(1899, 11, 30 + utcDays));
  return date.toISOString().slice(0, 10);
}

function normalizeValue(val, colName) {
  if (val === undefined || val === null) return '';
  // Handle Excel date serial numbers for date columns
  if (colName === 'production_date' && typeof val === 'number') {
    return excelDateToISO(val);
  }
  // Handle boolean
  if (typeof val === 'boolean') return val;
  // Handle numbers - keep as-is but convert to string for non-numeric
  if (typeof val === 'number') {
    // Check if it looks like a date serial (>= 30000 days since 1900 ~= year 1982+)
    if (colName === 'production_date' || (val > 30000 && val < 200000)) return excelDateToISO(val);
    return String(val);
  }
  return String(val);
}

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
    const rawData = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    if (!rawData.length) {
      return NextResponse.json({ error: 'Excel 文件中没有数据' }, { status: 400 });
    }

    // Build reverse map from Excel headers
    const reverseMap = {};
    for (const [cn, en] of Object.entries(COLUMN_MAP)) {
      reverseMap[cn] = en;
    }

    const results = { success: 0, skipped: 0, errors: [] };
    for (let i = 0; i < rawData.length; i++) {
      const row = rawData[i];
      const mapped = {};

      for (const key of Object.keys(row)) {
        const col = reverseMap[key] || key;
        mapped[col] = normalizeValue(row[key], col);
      }

      const data = {};
      for (const col of Object.values(COLUMN_MAP)) {
        if (col === 'is_printed') {
          const v = String(mapped[col] || '').trim().toLowerCase();
          data[col] = v === 'true' || v === 'yes' || v === '是' || v === '1';
        } else if (col === 'production_date') {
          data[col] = mapped[col] || null;
        } else {
          data[col] = mapped[col] ?? '';
        }
      }

      if (!data.delivery_no || !data.delivery_line_no) {
        results.skipped++;
        results.errors.push(`第${i + 2}行: 缺少发货单号或发货单行号`);
        continue;
      }

      const result = await createDelivery(data);
      if (result.error) {
        results.skipped++;
        results.errors.push(`第${i + 2}行: ${result.error}`);
      } else {
        results.success++;
      }
    }

    return NextResponse.json(results);
  } catch (err) {
    return NextResponse.json({ error: err.message || '导入失败' }, { status: 500 });
  }
}
