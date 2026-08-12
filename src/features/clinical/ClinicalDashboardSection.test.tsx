import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ClinicalDashboardSection } from "@/config-compat/clinicalConfig";
import type { ClinicalDashboardContext } from "./dashboardContext";
import { ClinicalDashboardSectionCard } from "./ClinicalDashboardSection";

vi.mock("next/router", () => ({
  useRouter: () => ({ pathname: "/clinical/patient/[patientUuid]/dashboard", query: {}, push: vi.fn() }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_key: string, options: { defaultValue: string }) => options.defaultValue }),
}));

vi.mock("./DashboardControlRegistry", () => ({
  getDashboardControlAdapter: () => ({
    type: "test",
    Component: () => <p>Contenido clinico</p>,
    supportsExpanded: false,
    capabilities: ["read"],
  }),
}));

afterEach(cleanup);

describe("clinical dashboard section", () => {
  it("collapses to its title and restores its content accessibly", () => {
    const section = {
      id: "diagnosis",
      type: "diagnosis",
      sourceIndex: 0,
      title: "Diagnostico",
      displayType: "Half-Page",
      dashboardConfig: {},
      expandedViewConfig: {},
      config: {},
      formGroup: [],
      raw: {},
    } as ClinicalDashboardSection;

    render(<ClinicalDashboardSectionCard section={section} context={{} as ClinicalDashboardContext} />);

    expect(screen.getByText("Contenido clinico")).toBeVisible();
    const collapse = screen.getByRole("button", { name: "Colapsar Diagnostico" });
    expect(collapse).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(collapse);

    expect(screen.queryByText("Contenido clinico")).not.toBeInTheDocument();
    const restore = screen.getByRole("button", { name: "Mostrar Diagnostico" });
    expect(restore).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(restore);
    expect(screen.getByText("Contenido clinico")).toBeVisible();
  });

  it("renders visit patient information inside the modern collapsible card", () => {
    const section = {
      id: "Patient Information",
      type: "patientInformation",
      sourceIndex: 0,
      displayType: "Half-Page",
      dashboardConfig: {},
      expandedViewConfig: {},
      config: {},
      formGroup: [],
      raw: {},
    } as ClinicalDashboardSection;

    render(<ClinicalDashboardSectionCard section={section} context={{ surface: "visit" } as ClinicalDashboardContext} />);

    expect(screen.getByText("Contenido clinico")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Patient Information" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Colapsar Patient Information" })).toBeVisible();
  });

  it("does not render types absent from the legacy visitSummary ng-switch", () => {
    const section = {
      id: "Disposition",
      type: "disposition",
      sourceIndex: 0,
      displayType: "Half-Page",
      dashboardConfig: {},
      expandedViewConfig: {},
      config: {},
      formGroup: [],
      raw: { legacyType: "disposition" },
    } as ClinicalDashboardSection;

    const { container } = render(<ClinicalDashboardSectionCard section={section} context={{ surface: "visit" } as ClinicalDashboardContext} />);
    expect(container).toBeEmptyDOMElement();
  });
});
