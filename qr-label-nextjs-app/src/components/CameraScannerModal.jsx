"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import styles from '@/app/page.module.css';

export default function CameraScannerModal({ open, mode, onClose, onDecoded, onError }) {
  const scannerRef = useRef(null);
  const [bootMessage, setBootMessage] = useState('');
  const elementId = useMemo(() => `qr-reader-${mode}`, [mode]);

  useEffect(() => {
    let cancelled = false;

    async function startScanner() {
      if (!open) {
        return;
      }

      try {
        setBootMessage('正在启动摄像头...');
        const { Html5Qrcode } = await import('html5-qrcode');
        if (cancelled) {
          return;
        }

        const scanner = new Html5Qrcode(elementId);
        scannerRef.current = scanner;
        const config = { fps: 10, qrbox: { width: 240, height: 240 } };

        const handleSuccess = async (decodedText) => {
          await stopScanner();
          onDecoded(decodedText);
        };

        try {
          await scanner.start({ facingMode: 'environment' }, config, handleSuccess, () => {});
        } catch {
          const cameras = await Html5Qrcode.getCameras();
          if (!cameras.length) {
            throw new Error('未在此设备上检测到摄像头。');
          }
          await scanner.start(cameras[0].id, config, handleSuccess, () => {});
        }

        if (!cancelled) {
          setBootMessage('');
        }
      } catch (error) {
        if (!cancelled) {
          const reason = error?.message || '';
          const secureHint = typeof window !== 'undefined' && !window.isSecureContext
            ? '请使用HTTPS打开网站，并先在手机上信任开发证书。'
            : '';
          onError(`无法启动摄像头扫描器。${reason} ${secureHint}`.trim());
          setBootMessage('');
        }
      }
    }

    startScanner();

    return () => {
      cancelled = true;
      stopScanner();
    };
  }, [open, elementId, onDecoded, onError]);

  async function stopScanner() {
    const scanner = scannerRef.current;
    if (!scanner) {
      return;
    }

    try {
      if (scanner.isScanning) {
        await scanner.stop();
      }
    } catch {
      // ignore scanner stop failures
    }

    try {
      await scanner.clear();
    } catch {
      // ignore scanner clear failures
    }

    scannerRef.current = null;
  }

  if (!open) {
    return null;
  }

  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div className={styles.modalBox} onClick={(event) => event.stopPropagation()}>
        <h3 className={styles.modalTitle}>{mode === 'supplier' ? '摄像头扫描：供应商二维码' : '摄像头扫描：买家二维码'}</h3>
        <p className={styles.modalSubtitle}>请授权摄像头权限，然后将二维码对准取景框保持不动。</p>
        <div id={elementId} className={styles.cameraReader} />
        {bootMessage ? <p className={styles.cameraHint}>{bootMessage}</p> : null}
        <button
          className={styles.secondaryButton}
          onClick={async () => {
            await stopScanner();
            onClose();
          }}
          type="button"
        >
          关闭摄像头
        </button>
      </div>
    </div>
  );
}
