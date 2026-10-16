import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ClinicalDashboardSection } from "@/config-compat/clinicalConfig";
import type { ClinicalDashboardContext } from "./dashboardContext";
import { ClinicalDashboardSections } from "./ClinicalDashboardSections";

vi.mock("./ClinicalDashboardSection", () => ({
  ClinicalDashboardSectionCard: ({ section }: { section: ClinicalDashboardSection }) => (
    <section className="clinical-card">{section.id}</section>
  ),
}));

const section = (id: string, displayType = "Half-Page") => ({
  id, displayType,
} as ClinicalDashboardSection);

describe("ClinicalDashboardSections", () => {
  it("places successive cards in independent columns, not shared rows", () => {
    const { container } = render(<ClinicalDashboardSections context={{} as ClinicalDashboardContext}
      sections={[section("vitals"), section("disposition"), section("diagnosis"), section("patient"), section("admission")]} />);
    const columns = container.querySelectorAll(".clinical-dashboard-column");
    expect(columns).toHaveLength(2);
    expect(columns[0]?.textContent).toBe("vitalsdiagnosisadmission");
    expect(columns[1]?.textContent).toBe("dispositionpatient");
    expect(screen.getByText("admission").closest(".clinical-dashboard-item"))
      .toHaveStyle({ "--dashboard-layout-order": "4" });
  });

  it("preserves explicit full-width cards and mobile ordering", () => {
    const { container } = render(<ClinicalDashboardSections context={{} as ClinicalDashboardContext}
      sections={[section("first"), section("full", "Full-Page"), section("last")]} />);
    expect(container.querySelector(".clinical-dashboard-item-full")?.textContent).toBe("full");
    expect(container.querySelectorAll(".clinical-dashboard-columns")).toHaveLength(2);
    expect(screen.getByText("last").closest(".clinical-dashboard-item"))
      .toHaveStyle({ "--dashboard-layout-order": "2" });
  });
});
