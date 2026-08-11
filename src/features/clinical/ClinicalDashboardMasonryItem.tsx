import type { CSSProperties, ReactNode } from "react";
import type { ClinicalDashboardSection } from "@/config-compat/clinicalConfig";

export function ClinicalDashboardMasonryItem({
  section,
  children,
  layoutOrder,
}: {
  section: ClinicalDashboardSection;
  children: ReactNode;
  layoutOrder: number;
}) {
  return <div
    className={`clinical-dashboard-item ${section.displayType === "Full-Page" ? "clinical-dashboard-item-full" : "clinical-dashboard-item-half"}`}
    style={{ "--dashboard-layout-order": layoutOrder } as CSSProperties}
  ><div>{children}</div></div>;
}
