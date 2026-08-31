import { NextResponse } from 'next/server';
import { updateBuyer, deleteBuyer } from '@/lib/store';

export async function PUT(request, { params }) {
  const { bid } = await params;
  const body = await request.json();
  const result = await updateBuyer(bid, body);
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }
  return NextResponse.json({ data: result.data });
}

export async function DELETE(request, { params }) {
  const { bid } = await params;
  const result = await deleteBuyer(bid);
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
