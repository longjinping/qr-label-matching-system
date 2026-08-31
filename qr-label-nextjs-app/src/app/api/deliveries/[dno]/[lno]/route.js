import { NextResponse } from 'next/server';
import { findDelivery, updateDelivery, deleteDelivery } from '@/lib/store';

export async function GET(request, { params }) {
  const { dno, lno } = await params;
  const data = await findDelivery(dno, lno);
  if (!data) return NextResponse.json({ error: '出库记录不存在' }, { status: 404 });
  return NextResponse.json({ data });
}

export async function PUT(request, { params }) {
  const { dno, lno } = await params;
  const body = await request.json();
  const result = await updateDelivery(dno, lno, body);
  if (result.error) return NextResponse.json({ error: result.error }, { status: 404 });
  return NextResponse.json({ data: result.data });
}

export async function DELETE(request, { params }) {
  const { dno, lno } = await params;
  const result = await deleteDelivery(dno, lno);
  if (result.error) return NextResponse.json({ error: result.error }, { status: 404 });
  return NextResponse.json({ ok: true });
}
