import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const BARTENDER_URL = process.env.BARTENDER_URL || 'http://localhost:3001/print';

export async function POST(request) {
  try {
    const body = await request.json();

    const res = await fetch(BARTENDER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => null);
    const response = NextResponse.json(data || { success: res.ok });
    response.status = res.status;
    return response;
  } catch (err) {
    console.error('bartender proxy error:', err);
    return NextResponse.json(
      { error: err.message || 'BarTender 打印服务连接失败' },
      { status: 502 }
    );
  }
}
