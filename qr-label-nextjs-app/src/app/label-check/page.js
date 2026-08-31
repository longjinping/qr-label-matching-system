"use client";

import { useRef, useState, useEffect } from 'react';
import QRCode from 'qrcode';
import Image from 'next/image';
import Link from 'next/link';
import styles from './page.module.css';
import MaterialMappingUpload from '@/components/MaterialMappingUpload';

export default function LabelCheckPage() {
  const buyerInputRef = useRef(null);     // 第一个扫描框：买家二维码
  const supplierInputRef = useRef(null);  // 第二个扫描框：供应商二维码
  const lastKeyTimeRef = useRef(0);       // 用于检测扫描枪快速输入 vs 手动慢速输入
  const [buyerQr, setBuyerQr] = useState('');
  const [supplierQr, setSupplierQr] = useState('');
  const [buyerText, setBuyerText] = useState('');
  const [supplierText, setSupplierText] = useState('');
  const [buyerInput, setBuyerInput] = useState('');
  const [supplierInput, setSupplierInput] = useState('');
  const [checkResult, setCheckResult] = useState(null); // 'pass' | 'fail' | null
  const [mismatchFields, setMismatchFields] = useState([]);
  const [buyerParsed, setBuyerParsed] = useState(null);
  const [supplierParsed, setSupplierParsed] = useState(null);

  // 进入页面自动聚焦到第一个扫描框
  useEffect(() => {
    buyerInputRef.current?.focus();
  }, []);

  // 解析供应商二维码（/ 分隔格式）
  function parseSupplierQr(text) {
    const parts = text.split('/');
    if (parts.length < 4) return null;
    return {
      material_code: parts[0] || '',
      qty: parts[1] || '',
      production_date: parts[3] || '',
      lot: parts[2] || '',
    };
  }

  // 解析买家二维码（; 分隔格式）
  function parseBuyerQr(text) {
    const parts = text.split(';');
    if (parts.length < 6) return null;
    return {
      material_code: parts[1] || '',
      qty: parts[5] || '',
      production_date: parts[2] || '',
      lot: parts[3] || '',
    };
  }

  // 第一个扫描框事件：扫描买家二维码
  async function handleBuyerScan(event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      const text = event.target.value.trim();
      if (!text) return;

      const qr = await QRCode.toDataURL(text, { width: 180, margin: 1 });
      setBuyerQr(qr);
      setBuyerText(text);
      const bp = parseBuyerQr(text);
      setBuyerParsed(bp);
      event.target.blur();
      if (!bp) {
        setCheckResult('fail');
        setMismatchFields(['扫描的二维码信息不对请重新扫描']);
        setTimeout(() => {
          setBuyerInput('');
          buyerInputRef.current?.focus();
        }, 1000);
      } else {
        setCheckResult(null);
        setMismatchFields([]);
        setTimeout(() => supplierInputRef.current?.focus(), 1000);
      }
    }
  }

  // 第二个扫描框事件：扫描供应商二维码并校验
  async function handleSupplierScan(event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      const text = event.target.value.trim();
      if (!text) return;

      const qr = await QRCode.toDataURL(text, { width: 180, margin: 1 });
      setSupplierQr(qr);
      setSupplierText(text);
      const sp = parseSupplierQr(text);
      setSupplierParsed(sp);
      event.target.blur();

      if (!sp) {
        setCheckResult('fail');
        setMismatchFields(['扫描的二维码信息不对请重新扫描']);
        setTimeout(() => {
          setSupplierInput('');
          supplierInputRef.current?.focus();
        }, 1000);
        return;
      }

      // 校验
      if (!buyerText) {
        setCheckResult('fail');
        setMismatchFields(['请先扫描买家二维码']);
        setTimeout(() => buyerInputRef.current?.focus(), 800);
        return;
      }

      // 解析买家二维码
      const bp = parseBuyerQr(buyerText);
      if (!bp) {
        setCheckResult('fail');
        setMismatchFields(['扫描的二维码信息不对请重新扫描']);
        setTimeout(() => {
          setBuyerInput('');
          buyerInputRef.current?.focus();
        }, 1000);
        return;
      }

      // 统一日期格式（去掉非数字字符）
      const normalizeDate = (d) => d ? d.replace(/[^0-9]/g, '') : '';
      const spDate = normalizeDate(sp.production_date);
      const bpDate = normalizeDate(bp.production_date);

      const failed = [];
      const matched = [];

      // 买家有 LOT 时才对比
      if (bp.lot != null) {
        if (sp.lot !== bp.lot) failed.push('LOT');
        else matched.push('LOT');
      }

      // 买家有数量和生产日期时才对比
      if (bp.qty != null) {
        if (sp.qty !== bp.qty) failed.push('数量');
        else matched.push('数量');
      }
      if (bp.production_date != null) {
        if (spDate !== bpDate) failed.push('生产日期');
        else matched.push('生产日期');
      }

      if (failed.length === 0) {
        // 三个字段校验通过后，查询供应商料号-客户料号映射表
        try {
          const res = await fetch('/api/material-mapping');
          const json = await res.json();
          const mappings = json.data || [];
          const exists = mappings.some(
            (m) => m.supplier_material_code === sp.material_code && m.customer_material_code === bp.material_code
          );

          if (exists) {
            setCheckResult('pass');
            setMismatchFields(['物料编码', 'LOT', '数量', '生产日期']);

            // 校验通过：把买卖双方数据写入 label_match_log
            // log_id 取供应商原始数据按 '/' 分割后的第 5 段（索引 4）
            const supplierParts = (supplierText || text || '').split('/');
            const logId = supplierParts[4] || '';
            if (logId) {
              fetch('/api/label-match-log', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  log_id: logId,
                  buyer_material_code: bp.material_code || '',
                  buyer_lot: bp.lot || '',
                  buyer_qty: bp.qty || '',
                  buyer_production_date: bp.production_date || null,
                  supplier_material_code: sp.material_code || '',
                  supplier_lot: sp.lot || '',
                  supplier_qty: sp.qty || '',
                  supplier_production_date: sp.production_date || null,
                }),
              }).catch((err) => console.error('保存匹配记录失败', err));
            }

            setTimeout(() => buyerInputRef.current?.focus(), 3000);
          } else {
            setCheckResult('fail');
            setMismatchFields(['物料编码']);
          }
        } catch (err) {
          setCheckResult('fail');
          setMismatchFields(['物料编码']);
        }
      } else {
        setCheckResult('fail');
        setMismatchFields(failed);
      }
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>标签校验系统</h1>
        </div>
        <div className={styles.headerActions}>
          <Link href="/label-match-log" className={styles.secondaryButton}>校验记录列表</Link>
          <Link href="/" className={styles.secondaryButton}>返回首页</Link>
        </div>
      </header>

      <section className={styles.gunSection}>
        <div className={styles.gunHead}>
          <h3>扫描枪输入</h3>
        </div>
        <div className={styles.gunRow}>
          <input
            ref={buyerInputRef}
            type="text"
            className={styles.gunInput}
            placeholder="在此聚焦，然后用扫描枪扫描（买家二维码）"
            value={buyerInput}
            onChange={(e) => setBuyerInput(e.target.value)}
            onFocus={() => {
              lastKeyTimeRef.current = 0;
              setBuyerInput('');
              setBuyerQr('');
              setBuyerText('');
              setBuyerParsed(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { handleBuyerScan(e); return; }
              // 非 Enter 键：通过按键间隔判断是扫描枪还是手动输入
              const now = Date.now();
              // 如果上一个按键在 80ms 以上，说明是手动输入，阻止
              if (lastKeyTimeRef.current > 0 && now - lastKeyTimeRef.current > 80) {
                e.preventDefault();
                return;
              }
              lastKeyTimeRef.current = now;
            }}
          />
          <input
            ref={supplierInputRef}
            type="text"
            className={styles.gunInput}
            placeholder="在此聚焦，然后用扫描枪扫描（供应商二维码）"
            value={supplierInput}
            onChange={(e) => setSupplierInput(e.target.value)}
            onFocus={() => {
              lastKeyTimeRef.current = 0;
              setSupplierInput('');
              setSupplierQr('');
              setSupplierText('');
              setSupplierParsed(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { handleSupplierScan(e); return; }
              // 非 Enter 键：通过按键间隔判断是扫描枪还是手动输入
              const now = Date.now();
              if (lastKeyTimeRef.current > 0 && now - lastKeyTimeRef.current > 80) {
                e.preventDefault();
                return;
              }
              lastKeyTimeRef.current = now;
            }}
          />
        </div>
      </section>

      {checkResult && (
        <section className={checkResult === 'pass' ? styles.resultPass : styles.resultFail}>
          {checkResult === 'pass' ? (
            <p>✅ 校验通过 - {mismatchFields.join('、')} 匹配</p>
          ) : mismatchFields.includes('扫描的二维码信息不对请重新扫描') ? (
            <p>❌ 校验失败 - 扫描的二维码信息不对请重新扫描</p>
          ) : (
            <p>❌ 校验失败 - {mismatchFields.join('、')} 不匹配</p>
          )}
        </section>
      )}

      <section className={styles.rawSection}>
        <div className={styles.rawHead}>
          <h3>扫描内容</h3>
        </div>
        <div className={styles.rawRow}>
          <div className={styles.rawBox}>
            <span className={styles.rawLabel}>买家原始内容</span>
            <p className={styles.rawText}>{buyerText || '暂无'}</p>
          </div>
          <div className={styles.rawBox}>
            <span className={styles.rawLabel}>供应商原始内容</span>
            <p className={styles.rawText}>{supplierText || '暂无'}</p>
          </div>
        </div>
      </section>

      <main className={styles.mainGrid}>
        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <h2>买家二维码</h2>
          </div>

          <div className={styles.qrFrame}>
            {buyerQr ? (
              <Image src={buyerQr} alt="Buyer QR" className={styles.qrImage} width={180} height={180} unoptimized />
            ) : (
              <p>等待买家标签扫描</p>
            )}
          </div>

          <div className={styles.dataBlock}>
            {buyerParsed ? (
              <>
                <p><span className={checkResult && checkResult === 'fail' ? styles.fieldMismatch : styles.fieldMatch}>物料编码：</span> {buyerParsed.material_code}</p>
                {buyerParsed.lot != null && <p><span className={checkResult && checkResult === 'fail' ? styles.fieldMismatch : styles.fieldMatch}>LOT：</span> {buyerParsed.lot}</p>}
                {buyerParsed.qty != null && <p><span className={checkResult && checkResult === 'fail' ? styles.fieldMismatch : styles.fieldMatch}>数量：</span> {buyerParsed.qty}</p>}
                {buyerParsed.production_date != null && <p><span className={checkResult && checkResult === 'fail' ? styles.fieldMismatch : styles.fieldMatch}>生产日期：</span> {buyerParsed.production_date}</p>}
              </>
            ) : (
              <p>暂无数据</p>
            )}
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <h2>供应商二维码</h2>
          </div>

          <div className={styles.qrFrame}>
            {supplierQr ? (
              <Image src={supplierQr} alt="Supplier QR" className={styles.qrImage} width={180} height={180} unoptimized />
            ) : (
              <p>等待供应商标签扫描</p>
            )}
          </div>

          <div className={styles.dataBlock}>
            {supplierParsed ? (
              <>
                <p><span className={checkResult && checkResult === 'fail' ? styles.fieldMismatch : styles.fieldMatch}>物料编码：</span> {supplierParsed.material_code}</p>
                {supplierParsed.lot != null && <p><span className={checkResult && checkResult === 'fail' ? styles.fieldMismatch : styles.fieldMatch}>LOT：</span> {supplierParsed.lot}</p>}
                <p><span className={checkResult && checkResult === 'fail' ? styles.fieldMismatch : styles.fieldMatch}>数量：</span> {supplierParsed.qty}</p>
                <p><span className={checkResult && checkResult === 'fail' ? styles.fieldMismatch : styles.fieldMatch}>生产日期：</span> {supplierParsed.production_date}</p>
              </>
            ) : (
              <p>暂无数据</p>
            )}
          </div>
        </section>
      </main>

      <MaterialMappingUpload />
    </div>
  );
}
