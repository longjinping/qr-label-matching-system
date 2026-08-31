import { NextResponse } from 'next/server';
import { getMaterialMappings } from '@/lib/store';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const data = await getMaterialMappings();
    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json({ error: err.message || '查询失败' }, { status: 500 });
  }
}
