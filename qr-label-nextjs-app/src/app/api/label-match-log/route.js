import { NextResponse } from 'next/server';
import { createLabelMatchLog, getLabelMatchLogs } from '@/lib/store';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const rows = await getLabelMatchLogs();
    return NextResponse.json(rows);
  } catch (err) {
    return NextResponse.json({ error: err.message || '查询失败' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const result = await createLabelMatchLog(body);
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message || '保存失败' }, { status: 500 });
  }
}
