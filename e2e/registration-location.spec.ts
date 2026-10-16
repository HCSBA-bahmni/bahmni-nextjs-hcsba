import { expect, test } from "@playwright/test";

test("edit keeps an uncatalogued identifier, repairs its location, and reports server errors in a toast", async ({ page }) => {
  let patientPayload: { patient?: { identifiers?: Array<Record<string, unknown>> } } | undefined;
  await page.setViewportSize({ width: 1366, height: 768 });

  await page.route("**/openmrs/ws/rest/v1/session**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ authenticated: true, user: { uuid: "user-1", display: "superman" }, sessionLocation: { uuid: "location-1", display: "HCSBA" } }) }));
  await page.route("**/openmrs/ws/rest/v1/user**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: [{ uuid: "user-1", username: "superman", display: "superman", privileges: [], roles: [] }] }) }));
  await page.route("**/openmrs/ws/rest/v1/provider**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: [{ uuid: "provider-1", display: "Super Man", retired: false, attributes: [] }] }) }));
  await page.route("**/openmrs/ws/rest/v1/location**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: [{ uuid: "location-1", display: "HCSBA" }] }) }));
  await page.route("**/bahmni_config/openmrs/apps/registration/app.json", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ config: { showEnterID: false, hiddenExtraIdentifierTypes: ["CRID MPI"] } }) }));
  await page.route("**/implementation_config/openmrs/apps/registration/app.json", (route) => route.fulfill({ status: 404 }));
  await page.route("**/bahmni/i18n/registration/locale_es.json", (route) => route.fulfill({ contentType: "application/json", body: "{}" }));
  await page.route("**/bahmni_config/openmrs/i18n/registration/locale_es.json", (route) => route.fulfill({ contentType: "application/json", body: "{}" }));
  await page.route("**/implementation_config/openmrs/i18n/registration/locale_es.json", (route) => route.fulfill({ status: 404 }));
  await page.route("**/openmrs/ws/rest/v1/idgen/identifiertype**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify([{ uuid: "clinical-type", name: "Patient Identifier", display: "Patient Identifier", primary: true, required: true, identifierSources: [] }]) }));
  await page.route("**/openmrs/ws/rest/v1/personattributetype**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: [] }) }));
  await page.route("**/openmrs/ws/rest/v1/relationshiptype**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: [] }) }));
  await page.route("**/openmrs/ws/rest/v1/visittype**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: [] }) }));
  await page.route("**/openmrs/ws/rest/v1/visit**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: [] }) }));
  await page.route("**/openmrs/module/addresshierarchy/ajax/getOrderedAddressHierarchyLevels.form", (route) => route.fulfill({ contentType: "application/json", body: "[]" }));
  await page.route("**/openmrs/ws/rest/v1/eisidentity/identifier-metadata**", (route) => route.fulfill({ contentType: "application/json", body: "[]" }));
  await page.route("**/openmrs/ws/rest/v1/patientprofile/patient-location**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ patient: { uuid: "patient-location", person: { uuid: "patient-location", names: [{ uuid: "name-1", givenName: "Persona", familyName: "Prueba", preferred: true }], addresses: [], attributes: [], gender: "F", birthdate: "1990-01-01" }, identifiers: [{ uuid: "clinical-id", identifier: "HCSBA100002", preferred: true, identifierType: { uuid: "clinical-type" }, location: { uuid: "location-1" } }, { uuid: "crid-id", identifier: "mpi-master-1", preferred: false, identifierType: { uuid: "crid-type" }, location: null }] }, relationships: [] }) }));
  await page.route("**/openmrs/ws/rest/v1/bahmnicore/patientprofile/patient-location", async (route) => {
    patientPayload = route.request().postDataJSON() as typeof patientPayload;
    await route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: { message: "Patient failed: Id Localidad no puede ser nulo" } }) });
  });

  await page.goto("/bahmni/registration/patient/patient-location");
  await expect(page.getByRole("heading", { name: "Editar paciente" })).toBeVisible();
  await page.getByRole("button", { name: "Siguiente" }).click();
  await page.getByRole("button", { name: "Siguiente" }).click();
  await page.evaluate(() => window.scrollTo(0, 0));

  const actionBar = page.locator(".patient-registration-actions");
  const saveButton = actionBar.getByRole("button", { name: /Guardar/ });
  await expect(actionBar).toHaveCSS("position", "sticky");
  await expect(actionBar).toBeInViewport();
  const [barBox, saveBox] = await Promise.all([actionBar.boundingBox(), saveButton.boundingBox()]);
  expect(barBox).not.toBeNull();
  expect(saveBox).not.toBeNull();
  expect(barBox!.x + barBox!.width).toBeLessThanOrEqual(1366);
  expect(saveBox!.x + saveBox!.width).toBeLessThanOrEqual(barBox!.x + barBox!.width);
  expect(await actionBar.getByRole("button").evaluateAll((buttons) => buttons.every((button) => button.scrollWidth <= button.clientWidth))).toBe(true);

  await page.setViewportSize({ width: 375, height: 812 });
  await expect(actionBar).toHaveCSS("position", "static");
  await actionBar.scrollIntoViewIfNeeded();
  await expect(actionBar).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await actionBar.getByRole("button").evaluateAll((buttons) => buttons.every((button) => button.scrollWidth <= button.clientWidth))).toBe(true);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 844, height: 390 });
  await actionBar.scrollIntoViewIfNeeded();
  await expect(actionBar).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await actionBar.getByRole("button").evaluateAll((buttons) => buttons.every((button) => button.scrollWidth <= button.clientWidth))).toBe(true);

  await saveButton.click();

  expect(patientPayload?.patient?.identifiers).toEqual(expect.arrayContaining([
    expect.objectContaining({ uuid: "crid-id", identifierType: "crid-type", location: "location-1" }),
  ]));
  await expect(page.locator(".p-toast")).toContainText("Revise el formulario");
  await expect(page.locator(".patient-form-error-summary")).toContainText("Falta la ubicación requerida por el identificador clínico");
  await expect(page.locator("#identifier-location-error")).toBeVisible();
});
