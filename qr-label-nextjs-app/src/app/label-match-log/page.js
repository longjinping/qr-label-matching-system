"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import * as XLSX from 'xlsx-js-style';
import styles from './page.module.css';

function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export default function LabelMatchLogPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/label-match-log')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setRows(data);
        } else {
          setError(data.error || '查询失败');
        }
      })
      .catch((err) => setError(err.message || '请求失败'))
      .finally(() => setLoading(false));
  }, []);

  const handleExport = () => {
    if (rows.length === 0) return;
    const headers = [
      'logID',
      '买家物料编码',
      '买家LOT',
      '买家数量',
      '买家生产日期',
      '供应商物料编码',
      '供应商LOT',
      '供应商数量',
      '供应商生产日期',
      '创建时间',
    ];
    const exportRows = rows.map((row) => ({
      logID: row.log_id,
      买家物料编码: row.buyer_material_code,
      买家LOT: row.buyer_lot,
      买家数量: row.buyer_qty,
      买家生产日期: row.buyer_production_date,
      供应商物料编码: row.supplier_material_code,
      供应商LOT: row.supplier_lot,
      供应商数量: row.supplier_qty,
      供应商生产日期: row.supplier_production_date,
      创建时间: row.created_at,
    }));
    const ws = XLSX.utils.json_to_sheet(exportRows, { header: headers });

    const range = XLSX.utils.decode_range(ws['!ref']);
    const lastRow = range.e.r;
    const lastCol = range.e.c;

    const thinBlack = { style: 'thin', color: { rgb: '000000' } };
    const mediumBlack = { style: 'medium', color: { rgb: '000000' } };

    const headerBase = {
      font: { name: 'Microsoft YaHei', bold: true, color: { rgb: '000000' }, sz: 12 },
      fill: { fgColor: { rgb: 'F2F2F2' }, bgColor: { rgb: 'F2F2F2' }, patternType: 'solid' },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    };

    const oddRowBase = {
      font: { name: 'Microsoft YaHei', sz: 11, color: { rgb: '333333' } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    };

    const evenRowBase = {
      ...oddRowBase,
      fill: { fgColor: { rgb: 'FFF8F0' }, bgColor: { rgb: 'FFF8F0' }, patternType: 'solid' },
    };

    for (let R = range.s.r; R <= lastRow; R += 1) {
      const isHeader = R === 0;
      const isLastRow = R === lastRow;
      const base = isHeader ? headerBase : (R % 2 === 0 ? evenRowBase : oddRowBase);

      for (let C = range.s.c; C <= lastCol; C += 1) {
        const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
        const cell = ws[cellRef];
        if (!cell) continue;

        const isFirstCol = C === 0;
        const isLastCol = C === lastCol;

        cell.s = {
          ...base,
          border: {
            top: isHeader ? mediumBlack : thinBlack,
            bottom: isHeader || isLastRow ? mediumBlack : thinBlack,
            left: isHeader || isFirstCol ? mediumBlack : thinBlack,
            right: isHeader || isLastCol ? mediumBlack : thinBlack,
          },
        };
      }
    }

    ws['!cols'] = [
      { wch: 22 },
      { wch: 20 },
      { wch: 16 },
      { wch: 12 },
      { wch: 16 },
      { wch: 32 },
      { wch: 18 },
      { wch: 12 },
      { wch: 16 },
      { wch: 22 },
    ];
    ws['!rows'] = Array.from({ length: range.e.r + 1 }, (_, i) => ({ hpx: i === 0 ? 28 : 24 }));
    ws['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft' };
    ws['!autofilter'] = { ref: ws['!ref'] };

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '校验记录');
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const fileName = `校验记录_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>校验记录列表</h1>
        </div>
        <div className={styles.headerActions}>
          <button type="button" className={styles.exportButton} onClick={handleExport} disabled={rows.length === 0}>
            导出 Excel
          </button>
          <Link href="/label-check" className={styles.secondaryButton}>返回校验</Link>
          <Link href="/" className={styles.secondaryButton}>返回首页</Link>
        </div>
      </header>

      <main className={styles.container}>
        {loading && <p className={styles.empty}>加载中...</p>}
        {error && <p className={styles.empty}>❌ {error}</p>}
        {!loading && !error && rows.length === 0 && (
          <p className={styles.empty}>暂无校验记录</p>
        )}
        {!loading && !error && rows.length > 0 && (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>logID</th>
                  <th>买家物料编码</th>
                  <th>买家LOT</th>
                  <th>买家数量</th>
                  <th>买家生产日期</th>
                  <th>供应商物料编码</th>
                  <th>供应商LOT</th>
                  <th>供应商数量</th>
                  <th>供应商生产日期</th>
                  <th>创建时间</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.log_id}>
                    <td>{row.log_id}</td>
                    <td>{row.buyer_material_code}</td>
                    <td>{row.buyer_lot}</td>
                    <td>{row.buyer_qty}</td>
                    <td>{row.buyer_production_date}</td>
                    <td>{row.supplier_material_code}</td>
                    <td>{row.supplier_lot}</td>
                    <td>{row.supplier_qty}</td>
                    <td>{row.supplier_production_date}</td>
                    <td>{formatDateTime(row.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
