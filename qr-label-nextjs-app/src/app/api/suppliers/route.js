import { NextResponse } from 'next/server';
import { getSuppliers, createSupplier } from '@/lib/store';

export async function GET() {
  const data = await getSuppliers();
  return NextResponse.json({ data });
}

export async function POST(request) {
  const body = await request.json();
  const result = await createSupplier(body);
  if (result.error) {
    const status = result.error.includes('already exists') ? 409 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ data: result.data }, { status: 201 });
}
