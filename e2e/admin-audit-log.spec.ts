import { expect, test, type Page, type Route } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function mockAuthenticatedAdmin(page: Page) {
  await page.route("**/openmrs/ws/rest/v1/session**", (route) => json(route, { authenticated: true, user: { uuid: "user-1", display: "Super Man" }, sessionLocation: { uuid: "emergency", display: "Emergency" } }));
  await page.route("**/openmrs/ws/rest/v1/user**", (route) => json(route, { results: [{ uuid: "user-1", username: "superman", display: "Super Man", privileges: [{ name: "app:admin" }], roles: [], userProperties: { defaultLocale: "es" } }] }));
  await page.route("**/openmrs/ws/rest/v1/provider**", (route) => json(route, { results: [{ uuid: "provider-1", display: "Super Man", attributes: [] }] }));
  await page.route("**/openmrs/ws/rest/v1/location**", (route) => json(route, { results: [{ uuid: "emergency", display: "Emergency" }] }));
  await page.route("**/bahmni/i18n/admin/locale_es.json", (route) => json(route, {}));
  await page.route("**/bahmni_config/openmrs/i18n/admin/locale_es.json", (route) => json(route, {
    VIEWED_PATIENT_MESSAGE: "El usuario {{userId}} vio al paciente {{patientId}}",
    NO_EVENTS_FOUND: "No se encontraron eventos",
    MATCHING_EVENTS_NOT_FOUND: "No se encontraron eventos coincidentes",
    NO_MORE_EVENTS_FOUND: "No se encontraron más eventos",
  }));
  await page.route("**/implementation_config/openmrs/i18n/admin/locale_es.json", (route) => json(route, {}, 404));
  await page.route("**/bahmni_config/openmrs/apps/admin/extension.json", (route) => json(route, {
    csvUpload: { id: "bahmni.admin.csv", extensionPointId: "org.bahmni.admin.dashboard", type: "link", label: "CSV Upload", url: "#/csv", icon: "fa-upload", order: 1, requiredPrivilege: "app:admin" },
    csvExport: { id: "bahmni.admin.csvExport", extensionPointId: "org.bahmni.admin.dashboard", type: "link", label: "CSV Export", url: "#/csvExport", icon: "fa-download", order: 1, requiredPrivilege: "app:admin" },
    auditLog: { id: "bahmni.admin.auditLog", extensionPointId: "org.bahmni.admin.dashboard", type: "link", label: "Audit Log", url: "/bahmni/admin/audit-log", icon: "fa-eye", order: 1, requiredPrivilege: "app:admin" },
    orderSet: { id: "bahmni.admin.orderSet", extensionPointId: "org.bahmni.admin.dashboard", type: "link", label: "Order Set", url: "#/ordersetdashboard", icon: "fa-upload", order: 1, requiredPrivilege: "app:admin" },
    beds: { id: "bahmni.admin.adt", extensionPointId: "org.bahmni.admin.dashboard", type: "link", label: "Beds", url: "/bahmni/admin/beds", icon: "icon-bahmni-inpatient", order: 1, requiredPrivilege: "app:admin" },
  }));
  await page.route("**/implementation_config/openmrs/apps/admin/extension.json", (route) => json(route, {}, 404));
}

test("dashboard de Administración usa el shell Next sin alterar destinos existentes", async ({ page }) => {
  await mockAuthenticatedAdmin(page);
  await page.goto("/bahmni/admin/#/dashboard");

  await expect(page.getByRole("heading", { name: "Administración", level: 1 })).toBeVisible();
  const tools = page.getByRole("navigation", { name: "Herramientas de Administración" });
  await expect(tools.getByRole("link")).toHaveCount(5);
  await expect(tools.getByRole("link", { name: /Registro de auditoría/ })).toHaveAttribute("href", "/bahmni/admin/audit-log");
  await expect(tools.getByRole("link", { name: /Cargar CSV/ })).toHaveAttribute("href", "/bahmni/admin-legacy/#/csv");
  await expect(tools.getByRole("link", { name: /Exportar CSV/ })).toHaveAttribute("href", "/bahmni/admin-legacy/#/csvExport");
  await expect(tools.getByRole("link", { name: /Conjuntos de órdenes/ })).toHaveAttribute("href", "/bahmni/admin-legacy/#/ordersetdashboard");
  await expect(tools.getByRole("link", { name: /Camas/ })).toHaveAttribute("href", "/bahmni/admin/beds");

  const accessibility = await new AxeBuilder({ page }).include("main").analyze();
  expect(accessibility.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? ""))).toEqual([]);
});

test("reproduce filtros, orden y paginación del Audit Log legacy", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-08-18T14:00:00.000Z"));
  await mockAuthenticatedAdmin(page);
  const requests: URLSearchParams[] = [];
  await page.route(/\/openmrs\/ws\/rest\/v1\/auditlog(?:\?.*)?$/, (route) => {
    const params = new URL(route.request().url()).searchParams;
    requests.push(params);
    if (params.get("defaultView") === "true") return json(route, [
      { auditLogId: 12, userId: "superman", patientId: "10001", eventType: "VIEWED_PATIENT", message: "VIEWED_PATIENT_MESSAGE", dateCreated: "2026-08-18T12:00:00Z", uuid: "audit-12", module: "clinical" },
      { auditLogId: 11, userId: "superman", patientId: "10001", eventType: "VIEWED_PATIENT", message: "VIEWED_PATIENT_MESSAGE", dateCreated: "2026-08-18T11:00:00Z", uuid: "audit-11", module: "clinical" },
    ]);
    if (params.get("lastAuditLogId") === "9") return json(route, []);
    return json(route, [{ auditLogId: 9, userId: "superman", patientId: "20002", eventType: "VIEWED_PATIENT", message: "VIEWED_PATIENT_MESSAGE", dateCreated: "2026-08-18T10:00:00Z", uuid: "audit-9", module: "clinical" }]);
  });

  await page.goto("/bahmni/admin/audit-log");
  await expect(page.getByRole("heading", { name: "Registro de auditoría" }).first()).toBeVisible();
  await expect(page.locator("tbody tr").nth(0)).toContainText("#11");
  await expect(page.locator("tbody tr").nth(1)).toContainText("#12");
  expect(requests[0]?.get("defaultView")).toBe("true");

  await page.getByPlaceholder("Nombre de usuario").fill("superman");
  await page.getByPlaceholder("ID del paciente").fill("20002");
  await page.getByRole("button", { name: "Filtrar" }).click();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody tr")).toContainText("#9");
  expect(requests[1]?.get("username")).toBe("superman");
  expect(requests[1]?.get("patientId")).toBe("20002");
  expect(requests[1]?.has("defaultView")).toBe(false);

  await page.getByRole("button", { name: "Eventos siguientes" }).click();
  await expect(page.getByText("No se encontraron más eventos")).toBeVisible();
  await expect(page.locator("tbody tr")).toContainText("#9");
  expect(requests[2]?.get("lastAuditLogId")).toBe("9");

  const accessibility = await new AxeBuilder({ page }).include("main").analyze();
  expect(accessibility.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? ""))).toEqual([]);
});
