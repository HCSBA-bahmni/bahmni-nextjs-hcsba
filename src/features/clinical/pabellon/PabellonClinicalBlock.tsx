import { Card } from "primereact/card";
import type { ReactNode } from "react";
import styles from "./PabellonProtocols.module.css";
export function ClinicalBlock({ title, icon, children }: { title: string; icon: string; children: ReactNode }) {
  return <section className={`clinical-card ${styles.block}`} aria-label={title}><Card className="clinical-dashboard-card" header={<header className="clinical-card-header"><h2><i className={`pi ${icon}`} aria-hidden="true" /> {title}</h2></header>}><div className="clinical-card-content">{children}</div></Card></section>;
}
export function ClinicalField({ title, children }: { title: string; children: ReactNode }) {
  return <div className={styles.field}><dt>{title}</dt><dd>{children || "—"}</dd></div>;
}
