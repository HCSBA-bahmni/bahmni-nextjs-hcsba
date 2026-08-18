import { describe, expect, it } from "vitest";
import { resolveAdminExtensionUrl, resolveAdminIcon } from "./dashboard";

describe("dashboard de Administración", () => {
  it("mantiene los estados Angular no migrados en el alias legacy", () => {
    expect(resolveAdminExtensionUrl("#/csv")).toEqual({ href: "/bahmni/admin-legacy/#/csv", kind: "legacy" });
    expect(resolveAdminExtensionUrl("#/ordersetdashboard")).toEqual({ href: "/bahmni/admin-legacy/#/ordersetdashboard", kind: "legacy" });
  });

  it("resuelve Audit Log y Beds en Next", () => {
    expect(resolveAdminExtensionUrl("#/auditLog")).toEqual({ href: "/bahmni/admin/audit-log", kind: "next" });
    expect(resolveAdminExtensionUrl("/bahmni/admin/audit-log")).toEqual({ href: "/bahmni/admin/audit-log", kind: "next" });
    expect(resolveAdminExtensionUrl("/openmrs/owa/bedmanagement/admissionLocations.html")).toEqual({ href: "/openmrs/owa/bedmanagement/admissionLocations.html", kind: "service" });
    expect(resolveAdminExtensionUrl("/bahmni/admin/beds")).toEqual({ href: "/bahmni/admin/beds", kind: "next" });
  });

  it("usa equivalentes PrimeIcons de los iconos legacy", () => {
    expect(resolveAdminIcon("fa fa-upload")).toBe("pi pi-upload");
    expect(resolveAdminIcon("fa-eye")).toBe("pi pi-eye");
    expect(resolveAdminIcon("icon-bahmni-inpatient")).toBe("pi pi-building");
  });
});
