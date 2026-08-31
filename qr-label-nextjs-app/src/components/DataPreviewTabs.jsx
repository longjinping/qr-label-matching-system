"use client";

import { useMemo, useState, useRef } from 'react';
import styles from '@/app/page.module.css';

const SUPPLIER_FIELDS = [
  { key: 'sid', label: '供应商ID', required: true },
  { key: 'sn', label: '供应商名称', required: false },
  { key: 'sd', label: '供应商描述', required: true },
  { key: 'in_', label: '物料编号', required: false },
  { key: 'lc', label: 'LC', required: false },
  { key: 'qty', label: '数量', type: 'number', required: false },
  { key: 'dc', label: '日期码', required: false },
  { key: 'coo', label: '产地', required: false },
];

const BUYER_FIELDS = [
  { key: 'bid', label: '买家ID', required: true },
  { key: 'bn', label: '买家名称', required: false },
  { key: 'bd', label: '买家代码', required: true },
  { key: 'ref', label: '供应商引用', required: true },
  { key: 'qty', label: '数量', type: 'number', required: false },
];

export default function DataPreviewTabs({ suppliers, buyers, onDataChange }) {
  const [activeTab, setActiveTab] = useState('supplier');
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState('supplier'); // 'supplier' | 'buyer'
  const [formAction, setFormAction] = useState('create'); // 'create' | 'edit'
  const [editData, setEditData] = useState(null);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef(null);

  const mapping = useMemo(
    () =>
      buyers.map((buyer) => {
        const supplier = suppliers.find((item) => item.sd === buyer.ref);
        return {
          ...buyer,
          supplierName: supplier ? supplier.sn : '-',
        };
      }),
    [buyers, suppliers]
  );

  function openCreate(mode) {
    setFormMode(mode);
    setFormAction('create');
    setEditData(null);
    setFormError('');
    setFormOpen(true);
  }

  function openEdit(mode, data) {
    setFormMode(mode);
    setFormAction('edit');
    setEditData(data);
    setFormError('');
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditData(null);
    setFormError('');
  }

  async function handleDelete(mode, id) {
    const label = mode === 'supplier' ? `供应商 "${id}"` : `买家 "${id}"`;
    if (!window.confirm(`确认删除 ${label}？`)) return;

    try {
      const base = mode === 'supplier' ? '/api/suppliers' : '/api/buyers';
      const res = await fetch(`${base}/${encodeURIComponent(id)}`, { method: 'DELETE' });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || '删除失败');
      if (onDataChange) onDataChange();
    } catch (err) {
      alert(err.message || '删除失败');
    }
  }

  async function submitForm(e) {
    e.preventDefault();
    setSubmitting(true);
    setFormError('');

    try {
      const fields = formMode === 'supplier' ? SUPPLIER_FIELDS : BUYER_FIELDS;
      const data = {};
      for (const f of fields) {
        const el = formRef.current.querySelector(`[name="${f.key}"]`);
        if (el) {
          data[f.key] = f.type === 'number' ? (parseInt(el.value, 10) || 0) : el.value.trim();
        }
      }

      if (formAction === 'edit' && editData) {
        // Only send changed fields for update
        const changed = {};
        const idKey = formMode === 'supplier' ? 'sid' : 'bid';
        for (const [key, val] of Object.entries(data)) {
          if (String(editData[key]) !== String(val)) changed[key] = val;
        }
        if (Object.keys(changed).length === 0) { closeForm(); setSubmitting(false); return; }

        const base = formMode === 'supplier' ? '/api/suppliers' : '/api/buyers';
        const res = await fetch(`${base}/${encodeURIComponent(editData[idKey])}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(changed),
        });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error || '更新失败');
      } else {
        const base = formMode === 'supplier' ? '/api/suppliers' : '/api/buyers';
        const res = await fetch(base, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error || '创建失败');
      }

      if (onDataChange) onDataChange();
      closeForm();
    } catch (err) {
      setFormError(err.message || '操作失败');
    } finally {
      setSubmitting(false);
    }
  }

  const fields = formMode === 'supplier' ? SUPPLIER_FIELDS : BUYER_FIELDS;
  const labelMap = formMode === 'supplier' ? { add: '添加供应商', edit: '编辑供应商' } : { add: '添加买家', edit: '编辑买家' };

  return (
    <section className={styles.dbSection}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <h3 className={styles.sectionTitle} style={{ marginBottom: 0 }}>数据库预览</h3>
        <button type="button" className={styles.secondaryButton} style={{ padding: '4px 12px', fontSize: 12 }} onClick={() => openCreate('supplier')}>
          + 添加供应商
        </button>
        <button type="button" className={styles.secondaryButton} style={{ padding: '4px 12px', fontSize: 12 }} onClick={() => openCreate('buyer')}>
          + 添加买家
        </button>
      </div>
      <div className={styles.tabHeader}>
        <button type="button" className={`${styles.tabButton} ${activeTab === 'supplier' ? styles.activeTab : ''}`} onClick={() => setActiveTab('supplier')}>
          供应商表
        </button>
        <button type="button" className={`${styles.tabButton} ${activeTab === 'buyer' ? styles.activeTab : ''}`} onClick={() => setActiveTab('buyer')}>
          买家表
        </button>
        <button type="button" className={`${styles.tabButton} ${activeTab === 'mapping' ? styles.activeTab : ''}`} onClick={() => setActiveTab('mapping')}>
          映射视图
        </button>
      </div>

      {activeTab === 'supplier' ? (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>供应商ID</th>
              <th>供应商名称</th>
              <th>供应商描述</th>
              <th>物料编号</th>
              <th>LC</th>
              <th>数量</th>
              <th>日期码</th>
              <th>产地</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {suppliers.map((supplier) => (
              <tr key={supplier.sid}>
                <td>{supplier.sid}</td>
                <td>{supplier.sn}</td>
                <td>{supplier.sd}</td>
                <td>{supplier.in_}</td>
                <td>{supplier.lc}</td>
                <td>{supplier.qty.toLocaleString()}</td>
                <td>{supplier.dc}</td>
                <td>{supplier.coo}</td>
                <td>
                  <button type="button" className={styles.secondaryButton} style={{ padding: '2px 8px', fontSize: 11, marginRight: 4 }} onClick={() => openEdit('supplier', supplier)}>编辑</button>
                  <button type="button" className={styles.secondaryButton} style={{ padding: '2px 8px', fontSize: 11, color: '#a12c7b' }} onClick={() => handleDelete('supplier', supplier.sid)}>删除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {activeTab === 'buyer' ? (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>买家ID</th>
              <th>买家名称</th>
              <th>买家描述</th>
              <th>供应商描述引用</th>
              <th>数量</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {buyers.map((buyer) => (
              <tr key={buyer.bid}>
                <td>{buyer.bid}</td>
                <td>{buyer.bn}</td>
                <td>{buyer.bd}</td>
                <td>{buyer.ref}</td>
                <td>{buyer.qty.toLocaleString()}</td>
                <td>
                  <button type="button" className={styles.secondaryButton} style={{ padding: '2px 8px', fontSize: 11, marginRight: 4 }} onClick={() => openEdit('buyer', buyer)}>编辑</button>
                  <button type="button" className={styles.secondaryButton} style={{ padding: '2px 8px', fontSize: 11, color: '#a12c7b' }} onClick={() => handleDelete('buyer', buyer.bid)}>删除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {activeTab === 'mapping' ? (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>买家ID</th>
              <th>买家名称</th>
              <th>买家代码</th>
              <th>供应商代码</th>
              <th>供应商名称</th>
              <th>数量</th>
            </tr>
          </thead>
          <tbody>
            {mapping.map((row) => (
              <tr key={`${row.bid}-${row.bd}`}>
                <td>{row.bid}</td>
                <td>{row.bn}</td>
                <td>{row.bd}</td>
                <td>{row.ref}</td>
                <td>{row.supplierName}</td>
                <td>{row.qty.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {/* Form Modal */}
      {formOpen ? (
        <div className={styles.modalBackdrop} onClick={closeForm}>
          <div className={styles.modalBox} style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>{formAction === 'create' ? labelMap.add : labelMap.edit}</h3>
            <p className={styles.modalSubtitle}>
              {formAction === 'create'
                ? `请填写${formMode === 'supplier' ? '供应商' : '买家'}信息`
                : `正在编辑 ${formMode === 'supplier' ? editData?.sid : editData?.bid}`}
            </p>
            <form ref={formRef} onSubmit={submitForm}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {fields.map((f) => {
                  const val = formAction === 'edit' && editData ? String(editData[f.key] ?? '') : '';
                  return (
                    <div key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <label style={{ fontSize: 11, fontWeight: 600 }}>{f.label}{f.required ? ' *' : ''}</label>
                      <input
                        type={f.type || 'text'}
                        name={f.key}
                        defaultValue={val}
                        required={f.required}
                        placeholder={f.label}
                        style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #d4d1ca', fontSize: 13 }}
                      />
                    </div>
                  );
                })}
              </div>
              {formError ? <p style={{ color: '#a12c7b', fontSize: 12, marginTop: 8 }}>{formError}</p> : null}
              <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
                <button type="button" className={styles.secondaryButton} onClick={closeForm}>取消</button>
                <button type="submit" className={styles.primaryButton} disabled={submitting}>{submitting ? '提交中...' : (formAction === 'create' ? '创建' : '更新')}</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}
