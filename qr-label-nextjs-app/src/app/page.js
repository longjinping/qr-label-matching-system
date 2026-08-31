import Link from 'next/link';
import styles from './menu.module.css';

export const metadata = {
  title: 'QR 标签管理系统',
};

export default function HomeMenu() {
  return (
    <div className={styles.page}>
      <div className={styles.decorCircle} />
      <div className={styles.decorCircleSecondary} />

      <div className={styles.card}>
        <div className={styles.brand}>
          <div className={styles.logo}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="2" />
              <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="2" />
              <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="2" />
              <path d="M17.5 14H20.5C21.0523 14 21.5 14.4477 21.5 15V17.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <path d="M21.5 20.5V21C21.5 21.5523 21.0523 22 20.5 22H17.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <path d="M14 22H15C15.5523 22 16 21.5523 16 21V18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <h1 className={styles.title}>QR 标签管理系统</h1>
          <p className={styles.subtitle}>请选择要进入的功能模块</p>
        </div>

        <nav className={styles.menuList}>
          <Link href="/qr-label" className={styles.menuItem}>
            <div className={styles.menuItemMain}>
              <div className={styles.icon}>QR</div>
              <div className={styles.menuItemText}>
                <strong>QR标签匹配系统</strong>
                <span>供应商/买家标签扫描、打印与匹配</span>
              </div>
            </div>
            <span className={styles.enterButton}>
              点击进入
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </span>
          </Link>

          <Link href="/label-check" className={styles.menuItem}>
            <div className={styles.menuItemMain}>
              <div className={`${styles.icon} ${styles.iconCheck}`}>验</div>
              <div className={styles.menuItemText}>
                <strong>联创标签校验</strong>
                <span>供应商料号与客户料号二维码校验</span>
              </div>
            </div>
            <span className={styles.enterButton}>
              点击进入
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </span>
          </Link>
        </nav>
      </div>

      <p className={styles.footer}>QR Label Matching System · Next.js</p>
    </div>
  );
}
