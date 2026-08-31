import { findDeliveryByErpAndMaterial } from '@/lib/store';

export async function POST(request) {
  try {
    const { erpOrderNo, materialDesc } = await request.json();
    if (!erpOrderNo || !materialDesc) {
      return Response.json({ error: 'ERP订单号和物料描述不能为空' }, { status: 400 });
    }

    const data = await findDeliveryByErpAndMaterial(erpOrderNo, materialDesc);
    return Response.json({ data });
  } catch (error) {
    return Response.json({ error: error.message || '验证失败' }, { status: 500 });
  }
}
