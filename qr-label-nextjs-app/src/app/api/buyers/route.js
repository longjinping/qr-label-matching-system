import { NextResponse } from 'next/server';
import { getBuyers, createBuyer } from '@/lib/store';

export async function GET(request) {
  const supplierDesc = request.nextUrl.searchParams.get('supplier_desc') || '';
  const data = await getBuyers(supplierDesc);
  return NextResponse.json({ data });
}

export async function POST(request) {
  const body = await request.json();
  const result = await createBuyer(body);
  if (result.error) {
    const status = result.error.includes('already exists') ? 409 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ data: result.data }, { status: 201 });
}
