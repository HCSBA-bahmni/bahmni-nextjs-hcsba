import { describe, expect, it } from "vitest";
import { resolveAdminExtensionUrl, resolveAdminIcon, resolveAdminLabel } from "./dashboard";

describe("dashboard de Administración", () => {
  it("presenta en español las herramientas configuradas con etiquetas inglesas", () => {
    expect(resolveAdminLabel("bahmni.admin.csv", "CSV Upload")).toBe("Cargar CSV");
    expect(resolveAdminLabel("bahmni.admin.csvExport", "CSV Export")).toBe("Exportar CSV");
    expect(resolveAdminLabel("bahmni.admin.auditLog", "Audit Log")).toBe("Registro de auditoría");
    expect(resolveAdminLabel("bahmni.admin.orderSet", "Order Set")).toBe("Conjuntos de órdenes");
    expect(resolveAdminLabel("bahmni.admin.adt", "Beds")).toBe("Camas");
    expect(resolveAdminLabel("personalizada", "Configuración local")).toBe("Configuración local");
  });

  it("mantiene los estados Angular no migrados en el alias legacy", () => {
    expect(resolveAdminExtensionUrl("#/csv")).toEqual({ href: "/bahmni/admin-legacy/#/csv", kind: "legacy" });
    expect(resolveAdminExtensionUrl("#/ordersetdashboard")).toEqual({ href: "/bahmni/admin-legacy/#/ordersetdashboard", kind: "legacy" });
  });

  it("resuelve Audit Log y la configuración explícita de Beds en Next", () => {
    expect(resolveAdminExtensionUrl("#/auditLog")).toEqual({ href: "/bahmni/admin/audit-log", kind: "next" });
    expect(resolveAdminExtensionUrl("/bahmni/admin/audit-log")).toEqual({ href: "/bahmni/admin/audit-log", kind: "next" });
    expect(resolveAdminExtensionUrl("/bahmni/admin/beds")).toEqual({ href: "/bahmni/admin/beds", kind: "next" });
  });

  it("conserva literalmente la URL OWA para el rollback independiente de Beds", () => {
    expect(resolveAdminExtensionUrl("/openmrs/owa/bedmanagement/admissionLocations.html")).toEqual({
      href: "/openmrs/owa/bedmanagement/admissionLocations.html",
      kind: "service",
    });
    expect(resolveAdminExtensionUrl("/openmrs/owa/bedmanagement/admissionLocations.html?locale=es#/locations")).toEqual({
      href: "/openmrs/owa/bedmanagement/admissionLocations.html?locale=es#/locations",
      kind: "service",
    });
  });

  it("usa equivalentes PrimeIcons de los iconos legacy", () => {
    expect(resolveAdminIcon("fa fa-upload")).toBe("pi pi-upload");
    expect(resolveAdminIcon("fa-eye")).toBe("pi pi-eye");
    expect(resolveAdminIcon("icon-bahmni-inpatient")).toBe("pi pi-building");
  });
});
