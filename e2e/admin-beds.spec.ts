import { expect, test, type Page, type Route } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

function json(route: Route, body: unknown, status = 200) { return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) }); }

async function confirmDeletion(page: Page) {
  const dialog = page.getByRole("dialog", { name: "Confirmar eliminación" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Eliminar", exact: true }).click();
}

async function mockAdmin(page: Page, manageLocations = true, bedStatus = "AVAILABLE", names = { location: "Urgencia", ward: "Sala de Urgencia" }) {
  const writes: Array<{ url: string; method: string; body: unknown }> = [];
  await page.route("**/openmrs/ws/rest/v1/session**", (route) => json(route, { authenticated: true, user: { uuid: "user" }, sessionLocation: { uuid: "emergency", display: "Emergency" } }));
  await page.route("**/openmrs/ws/rest/v1/user**", (route) => json(route, { results: [{ uuid: "user", username: "superman", privileges: [{ name: "app:admin" }], roles: [], userProperties: { defaultLocale: "es" } }] }));
  await page.route("**/openmrs/ws/rest/v1/provider**", (route) => json(route, { results: [{ uuid: "provider", display: "Administrador", attributes: [] }] }));
  await page.route(/\/openmrs\/ws\/rest\/v1\/location(?:\?.*)?$/, (route) => {
    const tag = new URL(route.request().url()).searchParams.get("tag");
    if (tag === "Visit Location") return json(route, { results: [{ uuid: "hospital", name: "Hospital HCSBA" }] });
    if (tag === "Admission Location") return json(route, { results: [
      { uuid: "emergency", name: names.location, description: "Atención de urgencia", parentLocation: { uuid: "hospital" } },
      { uuid: "ward", name: names.ward, parentLocation: { uuid: "emergency" } },
    ] });
    return json(route, { results: [{ uuid: "emergency", display: "Emergency" }] });
  });
  await page.route(/\/openmrs\/ws\/rest\/v1\/systemsetting(?:\?.*)?$/, (route) => json(route, { results: [{ property: "bedmanagement.owa.enableManagingLocations", value: String(manageLocations) }] }));
  await page.route(/\/openmrs\/ws\/rest\/v1\/bedtype(?:\/[^?]+)?(?:\?.*)?$/, async (route) => {
    if (route.request().method() === "GET") return json(route, { results: [{ uuid: "type", name: "Cama", displayName: "Cama", description: null }] });
    writes.push({ url: route.request().url(), method: route.request().method(), body: route.request().postDataJSON() }); return json(route, {});
  });
  await page.route(/\/openmrs\/ws\/rest\/v1\/bedTag(?:\/[^?]+)?(?:\?.*)?$/, async (route) => {
    if (route.request().method() === "GET") return json(route, { results: [{ uuid: "tag", name: "Aislamiento de contacto" }] });
    writes.push({ url: route.request().url(), method: route.request().method(), body: route.request().postDataJSON() }); return json(route, {});
  });
  await page.route(/\/openmrs\/ws\/rest\/v1\/admissionLocation(?:\/[^?]+)?(?:\?.*)?$/, async (route) => {
    if (route.request().method() === "GET") return json(route, { ward: { uuid: "ward", name: names.ward, parentLocation: { uuid: "emergency" } }, bedLocationMappings: [
      { rowNumber: 1, columnNumber: 1, bedUuid: "bed", bedNumber: "U-1", status: bedStatus, bedType: { name: "Cama", displayName: "Cama" } },
      { rowNumber: 1, columnNumber: 2 },
    ] });
    writes.push({ url: route.request().url(), method: route.request().method(), body: route.request().postDataJSON() }); return json(route, {});
  });
  await page.route(/\/openmrs\/ws\/rest\/v1\/bed(?:\/[^?]+)?(?:\?.*)?$/, async (route) => {
    writes.push({ url: route.request().url(), method: route.request().method(), body: route.request().postDataJSON() }); return json(route, {});
  });
  return writes;
}

test("Beds replica ubicación, sala, layout, tipos y etiquetas en español", async ({ page }) => {
  await mockAdmin(page);
  await page.goto("/bahmni/admin/beds");
  await expect(page.getByRole("heading", { name: "Camas", level: 2 })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Ubicaciones de admisión/ })).toBeVisible();
  await page.getByRole("button", { name: /Urgencia/ }).first().click();
  await expect(page.getByRole("button", { name: "Eliminar", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Agregar sala" })).toBeVisible();
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

test("muestra literalmente los nombres configurados en OpenMRS", async ({ page }) => {
  await mockAdmin(page, true, "AVAILABLE", { location: "Emergency", ward: "General Ward" });
  await page.goto("/bahmni/admin/beds");
  await expect(page.getByRole("button", { name: /Emergency/ }).first()).toBeVisible();
  await expect(page.getByText("Urgencias", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: /Emergency/ }).first().click();
  await expect(page.getByRole("button", { name: /General Ward/ }).first()).toBeVisible();
  await expect(page.getByText("Sala General", { exact: true })).toHaveCount(0);
});

test("oculta gestión de ubicaciones cuando el system setting está deshabilitado", async ({ page }) => {
  await mockAdmin(page, false);
  await page.goto("/bahmni/admin/beds");
  await expect(page.getByRole("button", { name: "Agregar ubicación", exact: true })).toHaveCount(0);
  const locationCard = page.locator(".admin-location-card").filter({ hasText: "Urgencia" }).first();
  await locationCard.hover();
  await expect(locationCard.getByRole("button", { name: /Editar ubicación/ })).toHaveCount(0);
  await locationCard.locator(".admin-location-card-open").click();
  await expect(page.getByRole("button", { name: "Agregar sala" })).toHaveCount(0);
  const wardCard = page.locator(".admin-location-card").filter({ hasText: "Sala de Urgencia" });
  await wardCard.hover();
  await expect(wardCard.getByRole("button", { name: /Editar sala/ })).toHaveCount(0);
  await wardCard.locator(".admin-location-card-open").click();
  await expect(page.getByRole("button", { name: "Editar distribución" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Agregar cama/ })).toBeVisible();
});

test("explica en español cuando OpenMRS impide eliminar una cama ocupada", async ({ page }) => {
  await mockAdmin(page, true);
  await page.unroute(/\/openmrs\/ws\/rest\/v1\/bed(?:\/[^?]+)?(?:\?.*)?$/);
  await page.route(/\/openmrs\/ws\/rest\/v1\/bed\/bed(?:\?.*)?$/, (route) => json(route, { error: { message: "org.openmrs.module.bedmanagement.exception.BedOccupiedException: Bed is occupied" } }, 400));
  await page.goto("/bahmni/admin/beds");
  await page.getByRole("button", { name: /Urgencia/ }).first().click();
  await page.getByRole("button", { name: /Sala de Urgencia/ }).first().click();
  await page.getByRole("button", { name: "Eliminar cama U-1" }).click();
  await confirmDeletion(page);
  await expect(page.getByRole("alert").filter({ hasText: "No se puede eliminar una cama ocupada." })).toBeVisible();
});

test("muestra edición y eliminación dentro de las tarjetas de ubicaciones y salas", async ({ page }) => {
  await mockAdmin(page, true);
  await page.goto("/bahmni/admin/beds");
  await page.getByRole("button", { name: "Agregar ubicación", exact: true }).click();
  await expect(page.getByRole("dialog").getByText("Ubicación padre")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Cancelar" }).click();

  const locationCard = page.locator(".admin-location-card").filter({ hasText: "Urgencia" }).first();
  await locationCard.hover();
  await locationCard.getByRole("button", { name: "Editar ubicación Urgencia" }).click();
  await expect(page.getByRole("dialog").getByLabel("Nombre", { exact: true })).toHaveValue("Urgencia");
  await page.getByRole("dialog").getByRole("button", { name: "Cancelar" }).click();
  await expect(locationCard.getByRole("button", { name: "Eliminar ubicación Urgencia" })).toBeDisabled();
  await locationCard.locator(".admin-location-card-open").click();
  await page.getByRole("button", { name: "Agregar sala" }).click();
  await expect(page.getByRole("dialog").getByText("Ubicación padre")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Cancelar" }).click();

  const wardCard = page.locator(".admin-location-card").filter({ hasText: "Sala de Urgencia" });
  await wardCard.hover();
  await wardCard.getByRole("button", { name: "Editar sala Sala de Urgencia" }).click();
  await expect(page.getByRole("dialog").getByLabel("Nombre", { exact: true })).toHaveValue("Sala de Urgencia");
  await page.getByRole("dialog").getByRole("button", { name: "Cancelar" }).click();
  await expect(wardCard.getByRole("button", { name: "Eliminar sala Sala de Urgencia" })).toBeEnabled();
  await wardCard.locator(".admin-location-card-open").click();
  await expect(page.getByRole("button", { name: "Editar distribución" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Agregar cama/ })).toBeVisible();
});

test("cada eliminación usa el recurso OpenMRS correcto y no ofrece borrar el layout", async ({ page }) => {
  const writes = await mockAdmin(page, true);
  await page.goto("/bahmni/admin/beds");
  await page.getByRole("button", { name: /Urgencia/ }).first().click();
  await page.getByRole("button", { name: /Sala de Urgencia/ }).first().click();
  await expect(page.getByRole("button", { name: "Eliminar distribución" })).toHaveCount(0);
  await page.getByRole("button", { name: "Eliminar cama U-1" }).click();
  await confirmDeletion(page);

  await page.getByRole("tab", { name: /Tipos de cama/ }).click();
  await page.getByRole("row", { name: /Cama/ }).getByRole("button", { name: "Eliminar" }).click();
  await confirmDeletion(page);
  await page.getByRole("tab", { name: /Etiquetas de cama/ }).click();
  await page.getByRole("row", { name: /Aislamiento de contacto/ }).getByRole("button", { name: "Eliminar" }).click();
  await confirmDeletion(page);

  await page.getByRole("tab", { name: /Ubicaciones de admisión/ }).click();
  await page.getByRole("button", { name: /Urgencia/ }).first().click();
  const deletableWardCard = page.locator(".admin-location-card").filter({ hasText: "Sala de Urgencia" });
  await deletableWardCard.hover();
  await deletableWardCard.getByRole("button", { name: "Eliminar sala Sala de Urgencia" }).click();
  await confirmDeletion(page);

  await expect.poll(() => writes.filter((write) => write.method === "DELETE").length).toBe(4);
  expect(writes.filter((write) => write.method === "DELETE").map((write) => new URL(write.url).pathname)).toEqual([
    "/openmrs/ws/rest/v1/bed/bed",
    "/openmrs/ws/rest/v1/bedtype/type",
    "/openmrs/ws/rest/v1/bedTag/tag",
    "/openmrs/ws/rest/v1/admissionLocation/ward",
  ]);
});

test("impide eliminar una sala con camas asociadas a pacientes", async ({ page }) => {
  const writes = await mockAdmin(page, true, "OCCUPIED");
  await page.goto("/bahmni/admin/beds");
  await page.getByRole("button", { name: /Urgencia/ }).first().click();
  const occupiedWardCard = page.locator(".admin-location-card").filter({ hasText: "Sala de Urgencia" });
  await occupiedWardCard.hover();
  await occupiedWardCard.getByRole("button", { name: "Eliminar sala Sala de Urgencia" }).click();
  await confirmDeletion(page);
  await expect(page.getByRole("alert").filter({ hasText: "tiene camas con pacientes asociados" })).toBeVisible();
  expect(writes.some((write) => write.method === "DELETE" && new URL(write.url).pathname.includes("admissionLocation"))).toBe(false);
});

test("revalida la jerarquía después de confirmar y evita un DELETE obsoleto", async ({ page }) => {
  const writes = await mockAdmin(page, true);
  await page.goto("/bahmni/admin/beds");
  await page.getByRole("button", { name: /Urgencia/ }).first().click();
  const wardCard = page.locator(".admin-location-card").filter({ hasText: "Sala de Urgencia" });
  await wardCard.hover();
  await wardCard.getByRole("button", { name: "Eliminar sala Sala de Urgencia" }).click();

  await page.unroute(/\/openmrs\/ws\/rest\/v1\/location(?:\?.*)?$/);
  await page.route(/\/openmrs\/ws\/rest\/v1\/location(?:\?.*)?$/, (route) => json(route, { results: [
    { uuid: "emergency", name: "Urgencia", parentLocation: { uuid: "hospital" } },
    { uuid: "ward", name: "Sala de Urgencia", parentLocation: { uuid: "emergency" } },
    { uuid: "new-child", name: "Sub-sala nueva", parentLocation: { uuid: "ward" } },
  ] }));
  await confirmDeletion(page);

  await expect(page.getByRole("alert").filter({ hasText: "ahora contiene salas" })).toBeVisible();
  expect(writes.some((write) => write.method === "DELETE" && new URL(write.url).pathname.includes("admissionLocation"))).toBe(false);
});

test("envía mutaciones reales de ubicación, layout, cama, tipo y etiqueta", async ({ page }) => {
  const writes = await mockAdmin(page, true);
  await page.goto("/bahmni/admin/beds");
  await page.getByRole("button", { name: "Agregar ubicación", exact: true }).click();
  await page.getByRole("dialog").getByLabel("Nombre", { exact: true }).fill("Nueva ubicación");
  await page.getByRole("dialog").getByRole("button", { name: "Guardar" }).click();
  await expect.poll(() => writes.length).toBe(1);

  await page.getByRole("button", { name: /Urgencia/ }).first().click();
  await page.getByRole("button", { name: "Agregar sala" }).click();
  await page.getByRole("dialog").getByLabel("Nombre", { exact: true }).fill("Sala nueva");
  await page.getByRole("dialog").getByRole("button", { name: "Guardar" }).click();
  await expect.poll(() => writes.length).toBe(2);

  await page.getByRole("button", { name: /Sala de Urgencia/ }).first().click();
  await page.getByRole("button", { name: "Editar distribución" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Guardar" }).click();
  await page.getByRole("button", { name: /Agregar cama/ }).click();
  await page.getByRole("dialog").getByLabel("Número de cama").fill("U-2");
  await page.getByRole("dialog").getByRole("button", { name: "Guardar" }).click();

  await page.getByRole("tab", { name: /Tipos de cama/ }).click();
  await page.getByRole("button", { name: "Agregar nuevo" }).click();
  await page.getByRole("dialog").getByLabel("Nombre", { exact: true }).fill("Cuna");
  await page.getByRole("dialog").getByLabel("Nombre para mostrar").fill("Cuna");
  await page.getByRole("dialog").getByRole("button", { name: "Guardar" }).click();

  await page.getByRole("tab", { name: /Etiquetas de cama/ }).click();
  await page.getByRole("button", { name: "Agregar nuevo" }).click();
  await page.getByRole("dialog").getByLabel("Nombre", { exact: true }).fill("Oxígeno");
  await page.getByRole("dialog").getByRole("button", { name: "Guardar" }).click();

  await expect.poll(() => writes.length).toBe(6);
  expect(writes.map((write) => new URL(write.url).pathname)).toEqual([
    "/openmrs/ws/rest/v1/admissionLocation",
    "/openmrs/ws/rest/v1/admissionLocation",
    "/openmrs/ws/rest/v1/admissionLocation/ward",
    "/openmrs/ws/rest/v1/bed",
    "/openmrs/ws/rest/v1/bedtype",
    "/openmrs/ws/rest/v1/bedTag",
  ]);
  expect(writes[1]?.body).toEqual({ parentLocationUuid: "emergency", name: "Sala nueva", description: "" });
});
