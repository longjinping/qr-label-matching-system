import { getDistinctDeliveryNos } from '@/lib/store';

export async function GET() {
  try {
    const deliveryNos = await getDistinctDeliveryNos();
    return Response.json({ data: deliveryNos });
  } catch (error) {
    return Response.json({ error: error.message || '获取发货单号失败' }, { status: 500 });
  }
}
