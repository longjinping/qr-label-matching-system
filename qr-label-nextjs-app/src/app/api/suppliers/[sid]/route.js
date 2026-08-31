import { NextResponse } from 'next/server';
import { updateSupplier, deleteSupplier } from '@/lib/store';

export async function PUT(request, { params }) {
  const { sid } = await params;
  const body = await request.json();
  const result = await updateSupplier(sid, body);
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }
  return NextResponse.json({ data: result.data });
}

export async function DELETE(request, { params }) {
  const { sid } = await params;
  const result = await deleteSupplier(sid);
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
