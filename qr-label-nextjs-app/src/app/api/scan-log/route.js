import { NextResponse } from 'next/server';
import { getScanLog } from '@/lib/store';

export async function GET(request) {
  const sessionId = request.nextUrl.searchParams.get('session_id') || '';
  return NextResponse.json({ data: await getScanLog(sessionId) });
}
