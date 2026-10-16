import { expect, test } from "@playwright/test";

// Exercises the actual locally served home extensions and the same-origin app.
// Session/user fixtures avoid modifying accounts or clinical data in shared OpenMRS.
test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.route("**/openmrs/ws/**", (route) => route.fulfill({ contentType: "application/json", body: "{}" }));
  await page.route("**/openmrs/ws/rest/v1/session**", (route) => route.fulfill({ json: {
    authenticated: true, user: { uuid: "demo-user", display: "demo.registro" },
    sessionLocation: { uuid: "location-1", display: "HCSBA" },
  } }));
  await page.route("**/openmrs/ws/rest/v1/provider**", (route) => route.fulfill({ json: {
    results: [{ uuid: "demo-provider", display: "Demo Registro", retired: false, attributes: [] }],
  } }));
  await page.route("**/openmrs/ws/rest/v1/location**", (route) => route.fulfill({ json: {
    results: [{ uuid: "location-1", display: "HCSBA" }],
  } }));
});

for (const profile of [
  { name: "registration demo", privileges: ["app:registration"], navigation: ["Inicio", "Registro"] },
  { name: "clinical user", privileges: ["app:clinical"], navigation: ["Inicio", "Clínico"] },
  { name: "multiple applications", privileges: ["app:registration", "app:clinical", "app:appointments", "app:adt"], navigation: ["Inicio", "Registro", "Clínico", "Citas", "Camas"] },
  { name: "no application privileges", privileges: [], navigation: ["Inicio"] },
]) {
  test(`home and navigation respect effective privileges: ${profile.name}`, async ({ page }) => {
    await page.route("**/openmrs/ws/rest/v1/user**", (route) => route.fulfill({ json: { results: [{
      uuid: "demo-user", username: "demo.registro", roles: [{ name: "HCSBA-Registro-Demo" }],
      privileges: profile.privileges.map((name) => ({ name, retired: false })), userProperties: { defaultLocale: "es" },
    }] } }));

    await page.goto("/bahmni/home");
    await expect(page.getByRole("heading", { name: "Aplicaciones" })).toBeVisible();
    const navigation = page.getByRole("navigation", { name: "Navegación principal" });
    await expect(navigation.getByRole("link")).toHaveText(profile.navigation);
    await expect(page.getByRole("status", { name: "" }).filter({ hasText: "Cargando aplicaciones" })).toHaveCount(0);
    const tiles = page.locator(".app-tile");
    const expectedCount = profile.privileges.includes("app:clinical") ? profile.privileges.length + 1 : profile.privileges.length;
    await expect(tiles).toHaveCount(expectedCount);

    if (profile.name === "registration demo") {
      await expect(tiles).toHaveText(["Registro"]);
      await tiles.first().click();
      await expect(page.getByRole("heading", { name: "Registro de pacientes" })).toBeVisible();
      await expect(navigation.getByRole("link")).toHaveText(["Inicio", "Registro"]);
      await page.reload();
      await expect(navigation.getByRole("link")).toHaveText(["Inicio", "Registro"]);
      await page.goto("/bahmni/clinical");
      await expect(page.getByRole("main").getByRole("alert")).toContainText("No tiene el privilegio app:clinical");
      await expect(page.locator(".clinical-search-panel")).toHaveCount(0);
    }
  });
}

test("retired application privilege does not display an application", async ({ page }) => {
  await page.route("**/openmrs/ws/rest/v1/user**", (route) => route.fulfill({ json: { results: [{
    uuid: "demo-user", username: "demo.registro", roles: [],
    privileges: [{ name: "app:registration", retired: false }, { name: "app:clinical", retired: true }],
    userProperties: { defaultLocale: "es" },
  }] } }));
  await page.goto("/bahmni/home");
  await expect(page.locator(".app-tile")).toHaveText(["Registro"]);
  await expect(page.getByRole("navigation", { name: "Navegación principal" }).getByRole("link")).toHaveText(["Inicio", "Registro"]);
});
