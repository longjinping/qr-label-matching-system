import { getAllErpOrders } from '@/lib/store';

export async function GET() {
  try {
    const orders = await getAllErpOrders();
    return Response.json({ data: orders });
  } catch (error) {
    return Response.json({ error: error.message || '获取失败' }, { status: 500 });
  }
}
