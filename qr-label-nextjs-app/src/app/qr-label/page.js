"use client";

import { useEffect, useMemo, useRef, useState } from 'react';

import QRCode from 'qrcode';
import Image from 'next/image';
import Link from 'next/link';
import styles from '@/app/page.module.css';
import StepProgress from '@/components/StepProgress';
import CameraScannerModal from '@/components/CameraScannerModal';
import ExcelUpload from '@/components/ExcelUpload';
import { apiGet, apiPost } from '@/lib/api-client';

function initialResult() {
  return {
    type: '',
    title: '',
    subtitle: '',
    left: '',
    right: '',
    symbol: '=',
  };
}

export default function Home() {
  const [step, setStep] = useState(1);
  const [suppliers, setSuppliers] = useState([]);
  const [buyers, setBuyers] = useState([]);
  const [selectableBuyers, setSelectableBuyers] = useState([]);
  const [batchNos, setBatchNos] = useState([]);
  const [selectedBatchNo, setSelectedBatchNo] = useState('');
  const [erpOrders, setErpOrders] = useState([]);
  const [selectedErpOrder, setSelectedErpOrder] = useState('');
  const [longjinping, setLongjinping] = useState(null);

  const [alertOpen, setAlertOpen] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');

  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraMode, setCameraMode] = useState('supplier');
  const [gunMode, setGunMode] = useState('supplier');
  const [gunInput, setGunInput] = useState('');
  const gunInputRef = useRef(null);
  const buyerInputRef = useRef(null);
  const [buyerScannedText, setBuyerScannedText] = useState('');
  const [matchPassed, setMatchPassed] = useState('');
  const [buyerScanError, setBuyerScanError] = useState('');
  const [tableRefreshKey, setTableRefreshKey] = useState(0);
  const scanLockedRef = useRef(false);
  const alertFocusRef = useRef('gun'); // 'gun' = 聚焦第一个扫码枪, 'buyer' = 聚焦第二个扫码枪

  const [sessionId, setSessionId] = useState(null);
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [selectedBuyer, setSelectedBuyer] = useState(null);
  const [printedBuyer, setPrintedBuyer] = useState(false);
  const [scannedBuyer, setScannedBuyer] = useState(null);

  const [supplierQr, setSupplierQr] = useState('');
  const [buyerQr, setBuyerQr] = useState('');
  const [scannedRawText, setScannedRawText] = useState('');
  const [result, setResult] = useState(initialResult());
  const [errorMessage, setErrorMessage] = useState('');
  const [printerMessage, setPrinterMessage] = useState('');
  const isPrintingRef = useRef(false);

  async function loadData() {
    try {
      const [suppliersRes, buyersRes, erpRes] = await Promise.all([
        apiGet('/api/suppliers'),
        apiGet('/api/buyers'),
        apiGet('/api/erp-orders'),
      ]);
      setSuppliers(suppliersRes.data || []);
      setBuyers(buyersRes.data || []);
      setSelectableBuyers(buyersRes.data || []);
      setErpOrders(erpRes.data || []);
    } catch (error) {
      setErrorMessage(error.message || '无法加载初始数据。');
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  // Auto-hide match result overlay
  useEffect(() => {
    if (result.type) {
      const timer = setTimeout(() => {
        setResult(initialResult());
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [result.type]);

  const buyerPayload = useMemo(() => {
    if (!selectedBuyer) {
      return '';
    }
    return JSON.stringify({
      t: 'B',
      bid: selectedBuyer.bid,
      bn: selectedBuyer.bn,
      bd: selectedBuyer.bd,
      ref: selectedBuyer.ref,
      qty: selectedBuyer.qty,
    });
  }, [selectedBuyer]);

  async function generateQrDataUrl(payload) {
    return QRCode.toDataURL(payload, {
      width: 180,
      margin: 1,
      color: { dark: '#111111', light: '#ffffff' },
    });
  }

  async function handleSupplierScan(supplier) {
    setErrorMessage('');
    setStep(2);

    try {
      const scanRes = await apiPost('/api/scan/supplier', {
        sid: supplier.sid,
        session_id: sessionId,
      });

      const supplierRecord = scanRes.supplier;
      const qrDataUrl = await generateQrDataUrl(
        JSON.stringify({
          t: 'S',
          sid: supplierRecord.sid,
          sn: supplierRecord.sn,
          sd: supplierRecord.sd,
          in: supplierRecord.in_,
          lc: supplierRecord.lc,
          qty: supplierRecord.qty,
          dc: supplierRecord.dc,
          coo: supplierRecord.coo,
        })
      );

      setSessionId(scanRes.session_id);
      setSelectedSupplier(supplierRecord);
      setSupplierQr(qrDataUrl);
      setSelectableBuyers(scanRes.buyers || []);
      setSelectedBuyer(null);
      setPrintedBuyer(false);
      setScannedBuyer(null);
      setBuyerQr('');
      setResult(initialResult());
      setPrinterMessage('');
      setStep(3);

      // Attempt auto-match: if server returned exactly one candidate, or we can
      // find a flexible match between supplier description and buyer fields,
      // then auto-select and print the buyer label.
      const buyersList = scanRes.buyers || [];
      let autoMatch = null;
      if (buyersList.length === 1) {
        autoMatch = buyersList[0];
      } else if (buyersList.length > 0) {
        const supplierCandidates = getCandidates({ sid: supplierRecord.sid, sd: supplierRecord.sd, raw: supplierRecord.sd }, supplierRecord.sd);
        autoMatch = buyersList.find((b) => {
          return (
            isFlexibleMatch(b.bid, supplierCandidates) ||
            isFlexibleMatch(b.bd, supplierCandidates) ||
            isFlexibleMatch(b.ref, supplierCandidates)
          );
        });
      }

      if (autoMatch) {
        setSelectedBuyer(autoMatch);
        // Directly call printBuyerLabel with the matched buyer to avoid relying on state timing
        try {
          await printBuyerLabel(autoMatch, supplierRecord);
        } catch (e) {
          console.error('handleSupplierScan: auto print failed', e);
        }
      }
    } catch (error) {
      setErrorMessage(error.message || '供应商扫描失败。');
    }
  }

  async function printBuyerLabel(buyerArg = null, supplierArg = null, longjinpingOverride = null, scannedTextOverride = '') {
    // 自动检测模式：无 buyerArg（手动按钮点击）且有扫描数据 → BarTender 后端打印
    // 有 buyerArg（自动匹配调用）→ 原有 IPP/CUPS
    const rawText = scannedTextOverride || scannedRawText;
    const useBarTender = !buyerArg && rawText && selectedBatchNo;

    // ── BarTender 模式（后端 API 中转） ──────────────────────────
    if (useBarTender) {
      if (isPrintingRef.current) {
        console.debug('printBuyerLabel: already printing, skipping duplicate request');
        return null;
      }
      isPrintingRef.current = true;
      setErrorMessage('');
      setStep(4);

      try {
        // 1. 检查 longjinping 数据（优先使用传入参数，避免闭包读取旧值）
        const lp = longjinpingOverride || longjinping;
        if (!lp) {
          throw new Error('未找到打印数据，请先扫描');
        }

        const { material_code, material_desc, batch_no, production_batch, qty, delivery_no, erp_order_no } = lp;

        // 2. 优先调用服务端 BarTender 代理（避免浏览器跨域/Private Network Access 限制）
        // 服务端无代理（502）或网络异常时，回退到浏览器直连本机 localhost:3001
        // 说明：BarTender 只能装在 Windows 机器上，代理必须与 BarTender 同机运行，
        // 服务器（Linux）上无法安装 BarTender，故服务端代理多数情况下不可用。
        let proxyRes;
        let usedFallback = false;
        try {
          console.debug('printBuyerLabel: calling server bartender proxy');
          proxyRes = await fetch('/api/print/bartender', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              material_code, material_desc, batch_no, production_batch, qty, delivery_no: erp_order_no
            }),
          });
          if (proxyRes.status === 502) {
            // 服务端没有 BarTender 代理，回退到本机直连
            throw new Error('server proxy unavailable');
          }
        } catch (serverErr) {
          console.debug('printBuyerLabel: server proxy unavailable, trying direct localhost');
          proxyRes = await fetch('http://localhost:3001/print', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              material_code, material_desc, batch_no, production_batch, qty, delivery_no: erp_order_no
            }),
          });
          usedFallback = true;
        }

        const proxyResult = await proxyRes.json();
        if (!proxyRes.ok) {
          throw new Error(proxyResult.error || 'BarTender 打印失败');
        }

        setPrinterMessage(`已发送至打印机 | 标签: ${delivery_no || ''}/${batch_no || ''}`);
        setTimeout(() => setPrinterMessage(''), 5000);
        setPrintedBuyer(true);
        setGunInput('');
        setTimeout(() => {
          buyerInputRef.current?.focus();
        }, 100);

        return proxyResult;
      } catch (error) {
        console.error('printBuyerLabel (bar_tender) error:', error);
        setErrorMessage(error.message || '无法通过 BarTender 打印买家标签。');
        return null;
      } finally {
        isPrintingRef.current = false;
      }
    }

    // ── 原有 IPP/CUPS 模式 ────────────────────────────────────
    const buyerToUse = buyerArg || selectedBuyer;
    const supplierToUse = supplierArg || selectedSupplier;
    if (!buyerToUse) {
      return null;
    }

    if (isPrintingRef.current) {
      console.debug('printBuyerLabel: already printing, skipping duplicate request');
      return null;
    }
    isPrintingRef.current = true;

    setErrorMessage('');
    setStep(4);

    try {
      const payloadObj = {
        t: 'B',
        bid: buyerToUse.bid,
        bn: buyerToUse.bn,
        bd: buyerToUse.bd,
        ref: buyerToUse.ref,
        qty: buyerToUse.qty,
      };

      setScannedBuyer(null);
      setResult(initialResult());
      setStep(5);

      console.debug('printBuyerLabel: sending print request for', buyerToUse?.bid, 'supplier_sid=', supplierToUse?.sid);
      const printerResponse = await apiPost('/api/print/label', {
        supplier_sid: supplierToUse?.sid,
        buyer_bid: buyerToUse.bid,
      });
      console.debug('printBuyerLabel: printerResponse=', printerResponse);

      const details = [
        `已发送至打印机 ${printerResponse.printer_uri}`,
        printerResponse.job_id ? `任务号#${printerResponse.job_id}` : null,
        printerResponse.accepted_format ? `格式 ${printerResponse.accepted_format}` : null,
      ].filter(Boolean).join(' | ');
      setPrinterMessage(details);

      // Mark printed only after successful print
      setPrintedBuyer(true);
      setGunInput('');
      setTimeout(() => {
        buyerInputRef.current?.focus();
      }, 100);

      return printerResponse;
    } catch (error) {
      console.error('printBuyerLabel error:', error);
      setErrorMessage(error.message || '无法打印买家标签。');
      return null;
    } finally {
      isPrintingRef.current = false;
    }
  }

  async function verifyMatch(buyerDescription) {
    if (!selectedSupplier) {
      return;
    }

    setErrorMessage('');
    setStep(6);

    try {
      const verifyRes = await apiPost('/api/scan/verify', {
        session_id: sessionId,
        supplier_description: selectedSupplier.sd,
        buyer_description: buyerDescription,
      });

      const isMatch = !!verifyRes.match;
      setResult({
        type: isMatch ? 'match' : 'noMatch',
        title: isMatch ? '匹配 - 标签已验证' : '不匹配 - 检测到差异',
        subtitle: isMatch
          ? `买家代码"${buyerDescription}"正确映射到供应商描述"${selectedSupplier.sd}"`
          : `买家代码"${buyerDescription}"未映射到供应商描述"${selectedSupplier.sd}"`,
        left: selectedSupplier.sd,
        right: buyerDescription,
        symbol: isMatch ? '=' : '!=',
      });
      setStep(7);
    } catch (error) {
      setErrorMessage(error.message || '验证扫描失败。');
    }
  }

  async function scanBuyerBySelection() {
    if (!selectedBuyer || !printedBuyer) {
      return;
    }
    setScannedBuyer(selectedBuyer);
    await verifyMatch(selectedBuyer.bd);
  }

  function parseQrPayload(text) {
    if (!text) {
      return {};
    }

    try {
      return JSON.parse(text);
    } catch {
      // Support plain-text labels where the payload is just a single code.
      return {
        raw: text,
        sid: text,
        bid: text,
        sd: text,
        bd: text,
        ref: text,
      };
    }
  }

  function normalize(value) {
    return String(value || '').trim().toUpperCase();
  }

  function normalizeAlnum(value) {
    return normalize(value).replace(/[^A-Z0-9]/g, '');
  }

  function extractLabeledValues(text, labelPattern) {
    const values = [];
    const regex = new RegExp(`(?:^|\\n)\\s*(?:${labelPattern})\\s*:\\s*([^\\n\\r]+)`, 'gi');
    let match = regex.exec(text);
    while (match) {
      values.push(match[1]);
      match = regex.exec(text);
    }
    return values;
  }

  function getCandidates(payload, text) {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const rawTokens = text
      .split(/[^A-Za-z0-9._-]+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 6);

    const labeled = [
      ...extractLabeledValues(text, 'DESCRIPTION|DESC'),
      ...extractLabeledValues(text, 'ITEM#?'),
      ...extractLabeledValues(text, 'LC#?'),
      ...extractLabeledValues(text, 'LOT'),
    ];

    const base = [
      payload.sid,
      payload.sd,
      payload.bid,
      payload.bd,
      payload.ref,
      payload.raw,
      lines[0],
      ...labeled,
      ...rawTokens,
    ];

    return [...new Set(base.map(normalize).filter(Boolean))];
  }

  function isFlexibleMatch(value, candidates) {
    const normalized = normalize(value);
    const normalizedAlnum = normalizeAlnum(value);
    if (!normalized && !normalizedAlnum) {
      return false;
    }

    return candidates.some((candidate) => {
      if (!candidate) {
        return false;
      }

      const candidateAlnum = normalizeAlnum(candidate);

      if (candidate === normalized) {
        return true;
      }

      if (candidateAlnum && normalizedAlnum && candidateAlnum === normalizedAlnum) {
        return true;
      }

      if (candidate.length >= 6 && normalized.length >= 6) {
        if (candidate.includes(normalized) || normalized.includes(candidate)) {
          return true;
        }
      }

      if (candidateAlnum.length >= 6 && normalizedAlnum.length >= 6) {
        return candidateAlnum.includes(normalizedAlnum) || normalizedAlnum.includes(candidateAlnum);
      }

      return false;
    });
  }

  async function processDecodedText(decodedText, mode) {
    const rawText = (decodedText || '').trim();
    if (!rawText) {
      throw new Error('扫描内容为空。');
    }

    try {
      const payload = parseQrPayload(rawText);
      const candidates = getCandidates(payload, rawText);

      if (mode === 'supplier') {
        const supplier = suppliers.find((item) => {
          return (
            isFlexibleMatch(item.sid, candidates) ||
            isFlexibleMatch(item.sd, candidates) ||
            isFlexibleMatch(item.in_, candidates) ||
            isFlexibleMatch(item.lc, candidates)
          );
        });
        if (!supplier) {
          throw new Error(
            `供应商二维码未在当前数据集中识别。扫描内容：${rawText.slice(0, 160)}`
          );
        }
        await handleSupplierScan(supplier);
      } else {
        if (!printedBuyer) {
          throw new Error('请先打印买家标签，再进行买家二维码扫描。');
        }
        const buyer = buyers.find((item) => {
          return (
            isFlexibleMatch(item.bid, candidates) ||
            isFlexibleMatch(item.bd, candidates) ||
            isFlexibleMatch(item.ref, candidates)
          );
        });
        if (!buyer) {
          throw new Error(`买家二维码未在当前数据集中识别。扫描内容：${rawText.slice(0, 160)}`);
        }
        setScannedBuyer(buyer);
        await verifyMatch(buyer.bd);
      }
    } catch (error) {
      throw new Error(error.message || '无效的二维码数据。');
    }
  }

  async function handleCameraDecoded(decodedText) {
    try {
      await processDecodedText(decodedText, cameraMode);
    } catch (error) {
      setErrorMessage(error.message || '无效的二维码数据。');
    } finally {
      setCameraOpen(false);
    }
  }

  async function submitGunScan() {
    setErrorMessage('');
    setMatchPassed('');
    const rawText = gunInput.trim();
    if (!rawText || scanLockedRef.current) return;

    // 立即清空输入并取消聚焦，防止二次扫描
    setGunInput('');
    gunInputRef.current?.blur();
    scanLockedRef.current = true;

    // 清除 longjinping 防止数据缓存
    setLongjinping(null);

    try {
      const materialDesc = rawText.split(/[\/\%\s]/)[0];

      // 用扫描到的内容重新生成二维码
      const qrDataUrl = await generateQrDataUrl(rawText);
      setSupplierQr(qrDataUrl);
      // 显示/,%, ,之前的内容
      setScannedRawText(materialDesc);

      // 通过 ERP订单号 + 物料描述验证
      if (selectedErpOrder) {
        const verifyRes = await apiPost('/api/verify-erp', {
          erpOrderNo: selectedErpOrder,
          materialDesc,
        });
        setLongjinping(verifyRes.data || null);
        if (!verifyRes.data) {
          alertFocusRef.current = 'gun';
          setAlertMessage('非本訂單貨品');
          setAlertOpen(true);
          return;
        }
        // 扫描成功，自动触发打印
        await printBuyerLabel(undefined, undefined, verifyRes.data, materialDesc);
      } else {
        setLongjinping(null);
      }
    } catch (error) {
      console.error('submitGunScan error:', error);
      setErrorMessage(error.message || '扫描枪输入无法识别。');
    } finally {
      scanLockedRef.current = false;
    }
  }

  function resetAll() {
    setStep(1);
    setSessionId(null);
    setSelectedSupplier(null);
    setSelectedBuyer(null);
    setPrintedBuyer(false);
    setScannedBuyer(null);
    setSupplierQr('');
    setBuyerQr('');
    setScannedRawText('');
    setSelectableBuyers(buyers);
    setErpOrders([]);
    setSelectedErpOrder('');
    setLongjinping(null);
    setBatchNos([]);
    setSelectedBatchNo('');
    setResult(initialResult());
    setErrorMessage('');
    setPrinterMessage('');
    setCameraOpen(false);
    setSupplierModalOpen(false);
  }

  function openCamera(mode) {
    setCameraMode(mode);
    setCameraOpen(true);
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>QR标签匹配系统</h1>
          <p className={styles.subtitle}>Next.js 重构版</p>
        </div>
        <div className={styles.headerActions}>
          <span className={styles.stepChip}>第 {step}/7 步</span>
          <Link href="/" className={styles.secondaryButton}>返回首页</Link>
        </div>
      </header>

      <StepProgress />

      <section className={styles.gunSection}>
        <label className={styles.selectLabel}>
          请选择ERP订单号
          <select
            className={styles.selectField}
            value={selectedErpOrder}
            onChange={(event) => {
              const erpVal = event.target.value;
              setSelectedErpOrder(erpVal);
              // 自动选中对应的批次号
              const found = erpOrders.find(e => e.erp_order_no === erpVal);
              setSelectedBatchNo(found ? found.batch_no : '');
              // 清空左右两侧二维码、扫描数据和 longjinping
              setSupplierQr('');
              setScannedRawText('');
              setBuyerQr('');
              setBuyerScannedText('');
              setLongjinping(null);
              // 选中实际订单后自动聚焦到第一个扫描枪
              if (erpVal) {
                setTimeout(() => gunInputRef.current?.focus(), 50);
              }
            }}
          >
            <option value="">- 请选择ERP订单号 -</option>
          {erpOrders.map((eo, idx) => (
            <option key={`${eo.erp_order_no}-${idx}`} value={eo.erp_order_no}>
              {eo.erp_order_no}
            </option>
          ))}
          </select>
        </label>
      </section>

      <section className={styles.gunSection}>
        <div className={styles.gunHead}>
          <h3>扫描枪输入</h3>
        </div>
        <div className={styles.gunRow}>
          <input
            ref={gunInputRef}
            type="text"
            className={styles.gunInput}
            value={gunInput}
            onChange={(event) => setGunInput(event.target.value)}
            onFocus={() => {
              setSupplierQr('');
              setScannedRawText('');
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                submitGunScan();
              }
            }}
            placeholder="在此聚焦，然后用扫描枪扫描（供货商二维码）"
          />
          <input
            ref={buyerInputRef}
            type="text"
            className={styles.gunInput}
            placeholder="在此聚焦，然后用扫描枪扫描（买家二维码）"
            onFocus={() => {
              setBuyerQr('');
              setBuyerScannedText('');
            }}
            onKeyDown={async (event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                const text = event.target.value.trim();
                if (!text) return;
                event.target.blur();
                event.target.value = '';
                // 验证 longjinping 是否存在
                if (!longjinping) {
                  alertFocusRef.current = 'gun';
                  setAlertMessage('请先扫描供应商二维码');
                  setAlertOpen(true);
                  return;
                }
                // 验证扫描内容包含足够的分隔符
                const parts = text.split('|');
                if (parts.length < 9) {
                  setBuyerScanError('你扫描的二维码不对请重新扫描');
                  // 延迟1秒自动聚焦到第二个扫描枪
                  setTimeout(() => buyerInputRef.current?.focus(), 1000);
                  return;
                }
                // 检查 ERP订单号（第3个字段）
                const erpFromScan = parts[2] || '';
                if (erpFromScan !== longjinping.erp_order_no) {
                  alertFocusRef.current = 'buyer';
                  setAlertMessage('ERP订单号不匹配');
                  setAlertOpen(true);
                  return;
                }
                // 检查批次号（第8个字段）
                const batchFromScan = parts[7] || '';
                if (batchFromScan !== longjinping.batch_no) {
                  alertFocusRef.current = 'buyer';
                  setAlertMessage('批次号不匹配');
                  setAlertOpen(true);
                  return;
                }
                // 检查物料描述（最后一个字段）
                const descFromScan = parts[parts.length - 1] || '';
                if (descFromScan !== longjinping.material_desc) {
                  alertFocusRef.current = 'buyer';
                  setAlertMessage('料号不匹配');
                  setAlertOpen(true);
                  return;
                }
                const qr = await generateQrDataUrl(text);
                setBuyerQr(qr);
                setBuyerScannedText(text);
                // 显示对比通过，同时清除扫描错误
                setMatchPassed('对比通过');
                setBuyerScanError('');
                // 更新发货数量
                try {
                  await apiPost('/api/delivery/update-qty', {
                    deliveryNo: longjinping.delivery_no,
                    erpOrderNo: longjinping.erp_order_no,
                  });
                  setTableRefreshKey(k => k + 1);
                  // 延迟两秒聚焦到第一个扫码枪，防止重复扫描
                  setTimeout(() => gunInputRef.current?.focus(), 2000);
                } catch (e) {
                  console.error('更新发货数量失败:', e);
                }
              }
            }}
          />
        </div>
      </section>

      <main className={styles.mainGrid}>
        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <h2>供应商标签</h2>
            <span>步骤 1-3</span>
          </div>

          <div className={styles.qrFrame}>
            {supplierQr ? (
              <Image src={supplierQr} alt="Supplier QR" className={styles.qrImage} width={180} height={180} unoptimized />
            ) : (
              <p>等待供应商扫描</p>
            )}
          </div>

          <div className={styles.dataBlock}>
            {selectedSupplier ? (
              <>
                <p><strong>描述：</strong> {selectedSupplier.sd}</p>
                <p><strong>供应商：</strong> {selectedSupplier.sn}</p>
                <p><strong>物料：</strong> {selectedSupplier.in_}</p>
                <p><strong>数量：</strong> {selectedSupplier.qty.toLocaleString()}</p>
                <p><strong>日期码/产地：</strong> {selectedSupplier.dc} / {selectedSupplier.coo}</p>
              </>
            ) : scannedRawText ? (
              <p><strong>扫描内容：</strong> {scannedRawText}</p>
            ) : (
              <p>暂无数据</p>
            )}
          </div>

          <button type="button" className={styles.primaryButton} disabled={true}>
            打印买家标签并发送至打印机
          </button>
          {printerMessage ? <p className={styles.scanHint}>{printerMessage}</p> : null}
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <h2>买家标签</h2>
            <span>步骤 4-6</span>
          </div>

          <div className={styles.qrFrame}>
            {buyerQr ? (
              <Image src={buyerQr} alt="Buyer QR" className={styles.qrImage} width={180} height={180} unoptimized />
            ) : (
              <p>等待买家标签扫描</p>
            )}
          </div>

          <div className={styles.dataBlock}>
            {buyerScannedText ? (
              <p><strong>扫描内容：</strong> {buyerScannedText}</p>
            ) : (
              <p>暂无数据</p>
            )}
          </div>

          {matchPassed ? <p className={styles.matchBadge}>{matchPassed}</p> : null}
          {buyerScanError ? <p className={styles.errorBadge}>{buyerScanError}</p> : null}
        </section>
      </main>

      {errorMessage ? (
        <section className={`${styles.resultBanner} ${styles.errorBanner}`}>
          <div>
            <h3>接口错误</h3>
            <p>{errorMessage}</p>
          </div>
        </section>
      ) : null}

      {result.type ? (
        <div className={`${styles.resultOverlay} ${result.type === 'match' ? styles.matchBanner : styles.errorBanner}`}>
          <h2 className={styles.overlayTitle}>{result.title}</h2>
          <p className={styles.overlaySubtitle}>{result.subtitle}</p>
          <div className={styles.overlayBadge}>{result.left} {result.symbol} {result.right}</div>
        </div>
      ) : null}

      <ExcelUpload erpOrder={selectedErpOrder} refreshKey={tableRefreshKey} />

      {supplierModalOpen ? (
        <div className={styles.modalBackdrop} onClick={() => setSupplierModalOpen(false)}>
          <div className={styles.modalBox} onClick={(event) => event.stopPropagation()}>
            <h3 className={styles.modalTitle}>模拟供应商扫描</h3>
            <p className={styles.modalSubtitle}>从数据集中选择一个供应商标签。</p>
            <div className={styles.optionList}>
              {suppliers.map((supplier) => (
                <button
                  key={supplier.sid}
                  type="button"
                  className={styles.optionButton}
                  onClick={async () => {
                    setSupplierModalOpen(false);
                    await handleSupplierScan(supplier);
                  }}
                >
                  <span>{supplier.sn}</span>
                  <span>{supplier.sd} · {supplier.in_}</span>
                </button>
              ))}
            </div>
            <button type="button" className={styles.secondaryButton} onClick={() => setSupplierModalOpen(false)}>
              关闭
            </button>
          </div>
        </div>
      ) : null}

      <CameraScannerModal
        open={cameraOpen}
        mode={cameraMode}
        onClose={() => setCameraOpen(false)}
        onDecoded={handleCameraDecoded}
        onError={(message) => setErrorMessage(message)}
      />

      {alertOpen && (
        <div className={styles.alertOverlay}>
          <div className={styles.alertBox}>
            <p className={styles.alertMessage}>{alertMessage}</p>
            <button
              className={styles.primaryButton}
              onClick={() => {
                setAlertOpen(false);
                scanLockedRef.current = false;
                if (alertFocusRef.current === 'gun') {
                  gunInputRef.current?.focus();
                } else {
                  buyerInputRef.current?.focus();
                }
              }}
            >
              确认
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
