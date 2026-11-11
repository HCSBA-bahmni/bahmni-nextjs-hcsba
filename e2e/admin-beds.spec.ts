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
  let bedExists = true;
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
  await page.route(/\/openmrs\/ws\/rest\/v1\/systemsetting(?:\/[^?]+)?(?:\?.*)?$/, (route) => {
    if (route.request().method() === "GET") return json(route, { results: [{ property: "bedmanagement.owa.enableManagingLocations", value: String(manageLocations) }] });
    writes.push({ url: route.request().url(), method: route.request().method(), body: route.request().postDataJSON() }); return json(route, {});
  });
  await page.route(/\/openmrs\/ws\/rest\/v1\/bedtype(?:\/[^?]+)?(?:\?.*)?$/, async (route) => {
    if (route.request().method() === "GET") return json(route, { results: [
      { uuid: "type", name: "Cama", displayName: "Cama", description: null },
      { uuid: "critical-uti", name: "MINSAL_CRITICA_UTI", displayName: "Crít. UTI", description: "Tratamiento intermedio" },
      { uuid: "critical-uci", name: "MINSAL_CRITICA_UCI", displayName: "Crít. UCI", description: "Cuidados intensivos" },
      { uuid: "medium", name: "MINSAL_MEDIA", displayName: "Media", description: "Mediana complejidad" },
      { uuid: "basic", name: "MINSAL_BASICA", displayName: "Básica", description: "Baja complejidad" },
    ] });
    writes.push({ url: route.request().url(), method: route.request().method(), body: route.request().postDataJSON() }); return json(route, {});
  });
  await page.route(/\/openmrs\/ws\/rest\/v1\/bedTag(?:\/[^?]+)?(?:\?.*)?$/, async (route) => {
    if (route.request().method() === "GET") return json(route, { results: [
      { id: 1, uuid: "tag", name: "Aislamiento de contacto" },
      { id: 10, uuid: "adult", name: "Clasificación: Adulto" },
      { id: 11, uuid: "pediatric", name: "Clasificación: Pediátrica" },
      { id: 12, uuid: "neonatal", name: "Clasificación: Neonatal" },
      { id: 13, uuid: "mental", name: "Uso: Salud Mental" },
      { id: 14, uuid: "obstetric", name: "Uso: Obstetricia" },
      { id: 15, uuid: "palliative", name: "Uso: Cuidados Paliativos" },
      { id: 16, uuid: "designed", name: "Condición: Dotacional" },
      { id: 17, uuid: "enabled", name: "Condición: Habilitada" },
    ] });
    writes.push({ url: route.request().url(), method: route.request().method(), body: route.request().postDataJSON() }); return json(route, { uuid: "new-tag" });
  });
  await page.route(/\/openmrs\/ws\/rest\/v1\/bedTagMap(?:\/[^?]+)?\/?(?:\?.*)?$/, async (route) => {
    writes.push({ url: route.request().url(), method: route.request().method(), body: route.request().postDataJSON() }); return json(route, { uuid: "map-new" });
  });
  await page.route(/\/openmrs\/ws\/rest\/v1\/admissionLocation(?:\/[^?]+)?(?:\?.*)?$/, async (route) => {
    if (route.request().method() === "GET") return json(route, { ward: { uuid: "ward", name: names.ward, parentLocation: { uuid: "emergency" } }, bedLocationMappings: [
      ...(bedExists ? [{ rowNumber: 1, columnNumber: 1, bedId: 7, bedUuid: "bed", bedNumber: "U-1", status: bedStatus, bedType: { name: "Cama", displayName: "Cama" }, bedTagMaps: [] }] : []),
      { rowNumber: 1, columnNumber: 2 },
    ] });
    writes.push({ url: route.request().url(), method: route.request().method(), body: route.request().postDataJSON() }); return json(route, {});
  });
  await page.route(/\/openmrs\/ws\/rest\/v1\/bed(?:\/[^?]+)?(?:\?.*)?$/, async (route) => {
    if (route.request().method() === "DELETE") bedExists = false;
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

test("clasifica una cama y guarda el tipo seleccionado en OpenMRS", async ({ page }) => {
  const writes = await mockAdmin(page);
  await page.goto("/bahmni/admin/beds");
  await page.getByRole("button", { name: /Urgencia/ }).first().click();
  await page.getByRole("button", { name: /Sala de Urgencia/ }).first().click();
  await page.getByRole("button", { name: /Agregar cama/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Número de cama").fill("U-2");
  await dialog.locator(".p-dropdown").click();
  await page.getByRole("option", { name: "Crít. UCI" }).click();
  await dialog.getByRole("button", { name: "Guardar" }).click();
  await expect.poll(() => writes.find((write) => new URL(write.url).pathname === "/openmrs/ws/rest/v1/bed")?.body).toMatchObject({ bedNumber: "U-2", bedType: "MINSAL_CRITICA_UCI" });
  await expect(page.getByRole("tab", { name: /Clasificación/ })).toHaveCount(0);
});

test("categoriza camas seleccionadas por complejidad, edad, uso y condición", async ({ page }) => {
  const writes = await mockAdmin(page);
  await page.goto("/bahmni/admin/beds");
  await page.getByRole("button", { name: /Urgencia/ }).first().click();
  await page.getByRole("button", { name: /Sala de Urgencia/ }).first().click();
  await page.getByRole("checkbox", { name: "Seleccionar cama U-1" }).click();
  await page.getByRole("button", { name: "Categorizar (1)" }).click();
  const dialog = page.getByRole("dialog", { name: "Categorizar 1 cama" });
  const dropdowns = dialog.locator(".p-dropdown");
  await dropdowns.nth(0).click(); await page.getByRole("option", { name: "Cama crítica UTI" }).click();
  await dropdowns.nth(1).click(); await page.getByRole("option", { name: "Adulto", exact: true }).click();
  await dropdowns.nth(2).click(); await page.getByRole("option", { name: "Cuidados Paliativos", exact: true }).click();
  await dropdowns.nth(3).click(); await page.getByRole("option", { name: "Habilitada / Disponible", exact: true }).click();
  await dialog.getByRole("button", { name: "Aplicar categorización" }).click();
  await expect.poll(() => writes.filter((write) => write.method === "POST" && new URL(write.url).pathname.includes("bedTagMap")).length).toBe(3);
  expect(writes.find((write) => new URL(write.url).pathname === "/openmrs/ws/rest/v1/bed/bed")?.body).toMatchObject({ bedType: "MINSAL_CRITICA_UTI" });
  expect(writes.filter((write) => new URL(write.url).pathname === "/openmrs/ws/rest/v1/bedTagMap/").map((write) => write.body)).toEqual([
    { bed: { id: 7 }, bedTag: { id: 10 } },
    { bed: { id: 7 }, bedTag: { id: 15 } },
    { bed: { id: 7 }, bedTag: { id: 17 } },
  ]);
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

test("identifica y protege una cama ocupada antes de intentar eliminarla", async ({ page }) => {
  const writes = await mockAdmin(page, true, "OCCUPIED");
  await page.goto("/bahmni/admin/beds");
  await page.getByRole("button", { name: /Urgencia/ }).first().click();
  await page.getByRole("button", { name: /Sala de Urgencia/ }).first().click();
  const occupiedBed = page.locator(".admin-bed-cell").filter({ hasText: "U-1" });
  await expect(occupiedBed.getByText("Ocupada", { exact: true })).toBeVisible();
  await expect(occupiedBed.getByRole("button", { name: "Eliminar cama U-1" })).toBeDisabled();
  expect(writes.some((write) => write.method === "DELETE" && new URL(write.url).pathname.includes("/bed/"))).toBe(false);
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
  await expect(locationCard.getByRole("button", { name: "Eliminar ubicación Urgencia" })).toBeEnabled();
  await locationCard.locator(".admin-location-card-open").click();
  await expect(page.locator(".admin-selected-location-bar").getByRole("button", { name: "Eliminar ubicación Urgencia" })).toBeEnabled();
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

test("impide eliminar una sala que contiene camas", async ({ page }) => {
  const writes = await mockAdmin(page, true, "OCCUPIED");
  await page.goto("/bahmni/admin/beds");
  await page.getByRole("button", { name: /Urgencia/ }).first().click();
  const occupiedWardCard = page.locator(".admin-location-card").filter({ hasText: "Sala de Urgencia" });
  await occupiedWardCard.hover();
  await occupiedWardCard.getByRole("button", { name: "Eliminar sala Sala de Urgencia" }).click();
  await confirmDeletion(page);
  await expect(page.getByRole("alert").filter({ hasText: "contiene camas" })).toBeVisible();
  expect(writes.some((write) => write.method === "DELETE" && new URL(write.url).pathname.includes("admissionLocation"))).toBe(false);
});

test("impide eliminar una ubicación que contiene salas", async ({ page }) => {
  const writes = await mockAdmin(page, true);
  await page.goto("/bahmni/admin/beds");
  const locationCard = page.locator(".admin-location-card").filter({ hasText: "Urgencia" }).first();
  await locationCard.hover();
  await locationCard.getByRole("button", { name: "Eliminar ubicación Urgencia" }).click();
  await confirmDeletion(page);

  await expect(page.getByRole("alert").filter({ hasText: "contiene salas" })).toBeVisible();
  expect(writes.some((write) => write.method === "DELETE" && new URL(write.url).pathname.includes("admissionLocation"))).toBe(false);
});

test("revalida la jerarquía después de confirmar y bloquea una sala con descendientes", async ({ page }) => {
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

  await expect(page.getByRole("alert").filter({ hasText: "contiene salas" })).toBeVisible();
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
  await page.getByRole("dialog").getByLabel("Descripción").fill("Cuenta con suministro de oxígeno.");
  await page.getByRole("dialog").getByRole("button", { name: "Guardar" }).click();

  await expect.poll(() => writes.length).toBe(7);
  expect(writes.map((write) => new URL(write.url).pathname)).toEqual([
    "/openmrs/ws/rest/v1/admissionLocation",
    "/openmrs/ws/rest/v1/admissionLocation",
    "/openmrs/ws/rest/v1/admissionLocation/ward",
    "/openmrs/ws/rest/v1/bed",
    "/openmrs/ws/rest/v1/bedtype",
    "/openmrs/ws/rest/v1/bedTag",
    "/openmrs/ws/rest/v1/systemsetting",
  ]);
  expect(writes[1]?.body).toEqual({ parentLocationUuid: "emergency", name: "Sala nueva", description: "" });
});
