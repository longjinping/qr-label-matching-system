"use client";

import { useState, useRef, useEffect, useMemo } from 'react';
import styles from '@/app/page.module.css';

const VISIBLE_COLS = [
  'delivery_no', 'erp_order_no', 'material_desc', 'material_code', 'order_no',
  'batch_no', 'delivery_qty', 'production_date',
];

const FIELD_LABELS = {
  delivery_no: '发货单号', erp_order_no: 'ERP订单号', order_no: '订单号',
  material_code: '物料编码', material_desc: '物料描述', batch_no: '批次号',
  delivery_qty: '发货数量', production_date: '生产日期',
};

export default function ExcelUpload({ onDataChange, erpOrder, refreshKey }) {
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [error, setError] = useState('');
  const [selectedFileName, setSelectedFileName] = useState('');
  const fileRef = useRef(null);

  // 根据 erpOrder 筛选数据
  const filteredDeliveries = useMemo(() => {
    if (!erpOrder) return deliveries;
    return deliveries.filter(d => d.erp_order_no === erpOrder);
  }, [deliveries, erpOrder]);

  useEffect(() => { loadDeliveries(); }, [refreshKey]);

  async function loadDeliveries() {
    try {
      const res = await fetch('/api/deliveries');
      const json = await res.json();
      setDeliveries(json.data || []);
    } catch (e) {
      setError('加载出库数据失败');
    }
  }

  async function handleUpload() {
    const file = fileRef.current?.files[0];
    if (!file) { setError('请选择文件'); return; }

    setLoading(true);
    setError('');
    setUploadResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/upload/delivery', { method: 'POST', body: fd });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || '上传失败');
      setUploadResult(result);
      await loadDeliveries();
      if (onDataChange) onDataChange();
      if (fileRef.current) fileRef.current.value = '';
      setSelectedFileName('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className={styles.dbSection}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
        <h3 className={styles.sectionTitle} style={{ marginBottom: 0 }}>出库发货单</h3>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            setSelectedFileName(file ? file.name : '');
            setUploadResult(null);
            setError('');
          }}
        />
        <label onClick={() => fileRef.current?.click()} className={styles.secondaryButton} style={{ padding: '4px 12px', fontSize: 12, cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}>
          选择 Excel
        </label>
        <button type="button" className={styles.primaryButton} style={{ padding: '4px 16px', fontSize: 12 }} onClick={handleUpload} disabled={loading || !selectedFileName}>
          {loading ? '导入中...' : '导入 Excel'}
        </button>
        {selectedFileName ? (
          <span style={{ fontSize: 12, color: '#555', marginLeft: 4 }}>已选择：{selectedFileName}</span>
        ) : null}
      </div>

      {uploadResult ? (
        <div style={{ padding: '8px 12px', borderRadius: 8, marginBottom: 8, fontSize: 12, background: uploadResult.errors?.length ? '#e0ced7' : '#d4dfcc', border: `1px solid ${uploadResult.errors?.length ? '#a12c7b' : '#437a22'}` }}>
          ✅ 成功 {uploadResult.success} 条，跳过 {uploadResult.skipped} 条
          {uploadResult.errors?.length > 0 ? (
            <details style={{ marginTop: 4 }}>
              <summary style={{ cursor: 'pointer', color: '#a12c7b' }}>查看详情</summary>
              {uploadResult.errors.map((e, i) => <div key={i} style={{ color: '#a12c7b' }}>{e}</div>)}
            </details>
          ) : null}
        </div>
      ) : null}
      {error ? <div style={{ color: '#a12c7b', fontSize: 12, marginBottom: 8 }}>{error}</div> : null}

      <div style={{ overflowX: 'auto' }}>
        <table className={styles.table}>
          <thead>
            <tr>
              {VISIBLE_COLS.map(k => <th key={k}>{FIELD_LABELS[k]}</th>)}
            </tr>
          </thead>
          <tbody>
            {filteredDeliveries.map((d, i) => (
              <tr key={`${d.delivery_no}-${d.delivery_line_no}-${i}`}>
                {VISIBLE_COLS.map(k => (
                  <td key={k}>{String(d[k] ?? '')}</td>
                ))}
              </tr>
            ))}
            {!filteredDeliveries.length ? <tr><td colSpan={VISIBLE_COLS.length} style={{ textAlign: 'center', color: '#999', padding: 30 }}>暂无数据，请导入 Excel</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
