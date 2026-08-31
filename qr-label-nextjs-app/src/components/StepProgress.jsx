import styles from '@/app/page.module.css';

const steps = [
  '选择ERP订单号',
  '扫描供应商',
  '解码',
  '打印买家标签',
  '扫描买家',
  '比对',
  '结果',
];

export default function StepProgress() {
  return (
    <div className={styles.stepsWrap}>
      <div className={styles.stepsBar}>
        {steps.map((label, index) => {
          const stepNumber = index + 1;

          return (
            <div className={styles.stepNode} key={label}>
              <div className={`${styles.stepCircle} ${styles.done}`}>{stepNumber}</div>
              <div className={`${styles.stepLabel} ${styles.done}`}>{label}</div>
              {stepNumber < steps.length ? (
                <div className={`${styles.stepLine} ${styles.doneLine}`} />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
