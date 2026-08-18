import { expect, test, type Page, type Route } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

function json(route: Route, body: unknown, status = 200) { return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) }); }

async function mockAdmin(page: Page) {
  await page.route("**/openmrs/ws/rest/v1/session**", (route) => json(route, { authenticated: true, user: { uuid: "user" }, sessionLocation: { uuid: "emergency", display: "Emergency" } }));
  await page.route("**/openmrs/ws/rest/v1/user**", (route) => json(route, { results: [{ uuid: "user", username: "superman", privileges: [{ name: "app:admin" }], roles: [], userProperties: { defaultLocale: "es" } }] }));
  await page.route("**/openmrs/ws/rest/v1/provider**", (route) => json(route, { results: [{ uuid: "provider", display: "Administrador", attributes: [] }] }));
  await page.route(/\/openmrs\/ws\/rest\/v1\/location(?:\?.*)?$/, (route) => {
    const tag = new URL(route.request().url()).searchParams.get("tag");
    if (tag === "Visit Location") return json(route, { results: [{ uuid: "hospital", name: "Hospital HCSBA" }] });
    if (tag === "Admission Location") return json(route, { results: [
      { uuid: "emergency", name: "Urgencia", description: "Atención de urgencia", parentLocation: { uuid: "hospital" } },
      { uuid: "ward", name: "Sala de Urgencia", parentLocation: { uuid: "emergency" } },
    ] });
    return json(route, { results: [{ uuid: "emergency", display: "Emergency" }] });
  });
  await page.route(/\/openmrs\/ws\/rest\/v1\/bedtype(?:\?.*)?$/, (route) => json(route, { results: [{ uuid: "type", name: "Cama", displayName: "Cama", description: null }] }));
  await page.route(/\/openmrs\/ws\/rest\/v1\/bedTag(?:\?.*)?$/, (route) => json(route, { results: [{ uuid: "tag", name: "Aislamiento de contacto" }] }));
  await page.route(/\/openmrs\/ws\/rest\/v1\/admissionLocation\/ward\?v=layout$/, (route) => json(route, { ward: { uuid: "ward", name: "Sala de Urgencia", parentLocation: { uuid: "emergency" } }, bedLocationMappings: [
    { rowNumber: 1, columnNumber: 1, bedUuid: "bed", bedNumber: "U-1", status: "AVAILABLE", bedType: { name: "Cama", displayName: "Cama" } },
    { rowNumber: 1, columnNumber: 2 },
  ] }));
}

test("Beds replica ubicación, sala, layout, tipos y etiquetas en español", async ({ page }) => {
  await mockAdmin(page);
  await page.goto("/bahmni/admin/beds");
  await expect(page.getByRole("heading", { name: "Camas", level: 2 })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Ubicaciones de admisión/ })).toBeVisible();
  await page.getByRole("button", { name: /Urgencia/ }).first().click();
  await expect(page.getByRole("button", { name: /Sala de Urgencia/ }).first()).toBeVisible();
  await page.getByRole("button", { name: /Sala de Urgencia/ }).first().click();
  await expect(page.getByText("U-1", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Agregar cama/ })).toBeVisible();
  await page.getByRole("button", { name: /Agregar cama/ }).click();
  await expect(page.getByRole("dialog").getByText("Número de cama")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Cancelar" }).click();
  await page.getByRole("tab", { name: /Tipos de cama/ }).click();
  await expect(page.getByRole("cell", { name: "Cama", exact: true }).first()).toBeVisible();
  await page.getByRole("tab", { name: /Etiquetas de cama/ }).click();
  await expect(page.getByRole("cell", { name: "Aislamiento de contacto" })).toBeVisible();
  const accessibility = await new AxeBuilder({ page }).include("main").analyze();
  expect(accessibility.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? ""))).toEqual([]);
});
