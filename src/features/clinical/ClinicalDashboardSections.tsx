import type { ClinicalDashboardSection } from "@/config-compat/clinicalConfig";
import type { ClinicalDashboardContext } from "./dashboardContext";
import { createDashboardLayout, type OrderedDashboardSection } from "./dashboardLayout";
import { ClinicalDashboardMasonryItem } from "./ClinicalDashboardMasonryItem";
import { ClinicalDashboardSectionCard } from "./ClinicalDashboardSection";

export function ClinicalDashboardSections({ sections, context }: {
  sections: ClinicalDashboardSection[];
  context: ClinicalDashboardContext;
}) {
  const renderItem = ({ section, layoutOrder }: OrderedDashboardSection) => (
    <ClinicalDashboardMasonryItem key={section.id} section={section} layoutOrder={layoutOrder}>
      <ClinicalDashboardSectionCard section={section} context={context} />
    </ClinicalDashboardMasonryItem>
  );

  return <div className="clinical-dashboard-layout">
    {createDashboardLayout(sections).map((block, index) => block.kind === "full"
      ? renderItem(block.item)
      : <div className="clinical-dashboard-columns" key={`columns-${index}`}>
        <div className="clinical-dashboard-column">{block.left.map(renderItem)}</div>
        <div className="clinical-dashboard-column">{block.right.map(renderItem)}</div>
      </div>)}
  </div>;
}
