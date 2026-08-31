import { getDistinctBatchNos } from '@/lib/store';

export async function GET() {
  try {
    const batchNos = await getDistinctBatchNos();
    return Response.json({ data: batchNos });
  } catch (error) {
    return Response.json({ error: error.message || '获取批次号失败' }, { status: 500 });
  }
}
