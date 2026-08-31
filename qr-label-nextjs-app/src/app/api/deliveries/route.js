import { NextResponse } from 'next/server';
import { getDeliveries, createDelivery } from '@/lib/store';

export async function GET(request) {
  const url = new URL(request.url);
  const where = {};
  if (url.searchParams.get('delivery_no')) where.delivery_no = url.searchParams.get('delivery_no');
  if (url.searchParams.get('order_no')) where.order_no = url.searchParams.get('order_no');
  if (url.searchParams.get('material_code')) where.material_code = url.searchParams.get('material_code');
  const data = await getDeliveries(Object.keys(where).length ? where : undefined);
  return NextResponse.json({ data });
}

export async function POST(request) {
  const body = await request.json();
  const result = await createDelivery(body);
  if (result.error) {
    const status = result.error.includes('已存在') ? 409 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ data: result.data }, { status: 201 });
}
