import styles from "./AuthCard.module.css";

type Props = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  wrapClassName?: string;
  cardClassName?: string;
  bodyClassName?: string;
};

export default function AuthCard({
  title,
  subtitle,
  children,
  wrapClassName,
  cardClassName,
  bodyClassName,
}: Props) {
  return (
    <div className={[styles.wrap, wrapClassName].filter(Boolean).join(" ")}>
      <div className={[styles.card, cardClassName].filter(Boolean).join(" ")}>
        <h1 className={styles.title}>{title}</h1>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        <div className={[styles.body, bodyClassName].filter(Boolean).join(" ")}>{children}</div>
      </div>
    </div>
  );
}
