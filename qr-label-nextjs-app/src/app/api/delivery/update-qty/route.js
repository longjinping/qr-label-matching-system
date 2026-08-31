import { updateDeliveryAfterScan } from '@/lib/store';

export async function POST(request) {
  try {
    const { deliveryNo, erpOrderNo } = await request.json();
    if (!deliveryNo || !erpOrderNo) {
      return Response.json({ error: '参数不完整' }, { status: 400 });
    }
    const result = await updateDeliveryAfterScan(deliveryNo, erpOrderNo);
    return Response.json({ data: result });
  } catch (error) {
    return Response.json({ error: error.message || '更新失败' }, { status: 500 });
  }
}
