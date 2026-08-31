import { NextResponse } from 'next/server';
import { verifyScan } from '@/lib/store';

export async function POST(request) {
  const body = await request.json();

  if (!body?.supplier_description || !body?.buyer_description) {
    return NextResponse.json(
      { error: '必须提供 supplier_description 和 buyer_description' },
      { status: 400 }
    );
  }

  const result = await verifyScan({
    supplierDescription: body.supplier_description,
    buyerDescription: body.buyer_description,
    sessionId: body.session_id,
  });

  return NextResponse.json({
    session_id: result.sessionId,
    match: result.match,
    supplier_description: result.supplierDescription,
    buyer_description: result.buyerDescription,
  });
}
