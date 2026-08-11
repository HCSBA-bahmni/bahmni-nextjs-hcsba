import type { ClinicalDashboardSection } from "@/config-compat/clinicalConfig";

export interface OrderedDashboardSection {
  section: ClinicalDashboardSection;
  layoutOrder: number;
}

export type DashboardLayoutBlock =
  | { kind: "columns"; left: OrderedDashboardSection[]; right: OrderedDashboardSection[] }
  | { kind: "full"; item: OrderedDashboardSection };

/**
 * Conserva el orden ya resuelto desde dashboard.json sin usar CSS dense.
 * Los controles de media página se alternan en dos columnas independientes;
 * un control Full-Page corta el bloque, ocupa todo el ancho y reinicia el flujo.
 */
export function createDashboardLayout(sections: ClinicalDashboardSection[]): DashboardLayoutBlock[] {
  const blocks: DashboardLayoutBlock[] = [];
  let left: OrderedDashboardSection[] = [];
  let right: OrderedDashboardSection[] = [];
  let nextColumn: "left" | "right" = "left";

  const flushColumns = () => {
    if (left.length === 0 && right.length === 0) return;
    blocks.push({ kind: "columns", left, right });
    left = [];
    right = [];
  };

  sections.forEach((section, layoutOrder) => {
    const item = { section, layoutOrder };
    if (section.displayType === "Full-Page") {
      flushColumns();
      blocks.push({ kind: "full", item });
      nextColumn = "left";
      return;
    }

    if (nextColumn === "left") left.push(item);
    else right.push(item);
    nextColumn = nextColumn === "left" ? "right" : "left";
  });

  flushColumns();
  return blocks;
}
