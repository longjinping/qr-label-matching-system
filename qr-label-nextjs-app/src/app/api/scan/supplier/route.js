import { NextResponse } from 'next/server';
import { createSupplierScan } from '@/lib/store';

export async function POST(request) {
  const body = await request.json();
  const result = await createSupplierScan({
    sid: body?.sid,
    supplierDescription: body?.supplier_description,
    sessionId: body?.session_id,
  });

  if (!result) {
    return NextResponse.json({ error: '未找到供应商' }, { status: 404 });
  }

  return NextResponse.json({
    session_id: result.sessionId,
    supplier: result.supplier,
    buyers: result.buyers,
  });
}
