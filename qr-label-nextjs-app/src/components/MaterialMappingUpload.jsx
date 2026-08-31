"use client";

import { useState, useRef, useEffect } from 'react';
import styles from '@/app/page.module.css';

const FIELD_LABELS = {
  supplier_material_code: '供应商料号',
  customer_material_code: '客户料号',
};

export default function MaterialMappingUpload({ refreshKey }) {
  const [mappings, setMappings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [error, setError] = useState('');
  const [selectedFileName, setSelectedFileName] = useState('');
  const fileRef = useRef(null);

  useEffect(() => { loadMappings(); }, [refreshKey]);

  async function loadMappings() {
    try {
      const res = await fetch('/api/material-mapping');
      const json = await res.json();
      setMappings(json.data || []);
    } catch (e) {
      setError('加载映射数据失败');
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
      const res = await fetch('/api/upload/material-mapping', { method: 'POST', body: fd });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || '上传失败');
      setUploadResult(result);
      await loadMappings();
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
        <h3 className={styles.sectionTitle} style={{ marginBottom: 0 }}>供应商料号-客户料号映射</h3>
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
        <button type="button" onClick={() => fileRef.current?.click()} className={styles.secondaryButton} style={{ padding: '4px 12px', fontSize: 12, cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}>
          选择 Excel
        </button>
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
              <th>供应商料号</th>
              <th>客户料号</th>
            </tr>
          </thead>
          <tbody>
            {mappings.map((m, i) => (
              <tr key={m.id ?? i}>
                <td>{m.supplier_material_code}</td>
                <td>{m.customer_material_code}</td>
              </tr>
            ))}
            {!mappings.length ? <tr><td colSpan={2} style={{ textAlign: 'center', color: '#999', padding: 30 }}>暂无数据，请导入 Excel</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
