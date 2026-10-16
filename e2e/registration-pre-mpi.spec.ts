import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("regularizes a verified pre-MPI patient without creating a second record", async ({ page }) => {
  let migrated = false;
  let generated = 0;
  let idgenSourceName = "";
  let savedPayload: { patient?: { uuid?: string; identifiers?: Array<Record<string, unknown>> } } | undefined;
  const run = "12345678-5";
  const patientUuid = "patient-legacy";
  const fhirPatient = {
    resourceType: "Patient", id: patientUuid, identifier: [{ value: `RUT*${run}` }], gender: "female", birthDate: "1990-01-01",
    name: [{ family: "Prueba", given: ["Persona", "Sintética"] }],
  };
  const profile = () => ({ patient: {
    uuid: patientUuid,
    person: { uuid: patientUuid, names: [{ uuid: "name-1", givenName: "Persona", familyName: "Prueba", preferred: true }], addresses: [], attributes: [], gender: "F", birthdate: "1990-01-01" },
    identifiers: migrated ? [
      { uuid: "hcsba-id", identifier: "HCSBA9001", preferred: true, identifierType: { uuid: "clinical-type" }, identifierSource: { uuid: "hcsba-source", prefix: "HCSBA" }, location: { uuid: "location-1" } },
      { uuid: "legacy-id", identifier: `RUT*${run}`, preferred: false, identifierType: { uuid: "clinical-type" }, location: { uuid: "location-1" } },
      { uuid: "run-id", identifier: run, preferred: false, identifierType: { uuid: "run-type" }, location: { uuid: "location-1" } },
    ] : [{ uuid: "legacy-id", identifier: `RUT*${run}`, preferred: true, identifierType: { uuid: "clinical-type" }, location: { uuid: "location-1" } }],
  }, relationships: [] });

  await page.route("**/openmrs/ws/rest/v1/session**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ authenticated: true, user: { uuid: "user-1", display: "superman" }, sessionLocation: { uuid: "location-1", display: "HCSBA" } }) }));
  await page.route("**/openmrs/ws/rest/v1/user**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: [{ uuid: "user-1", username: "superman", display: "superman", privileges: [], roles: [] }] }) }));
  await page.route("**/openmrs/ws/rest/v1/provider**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: [{ uuid: "provider-1", display: "Super Man", retired: false, attributes: [] }] }) }));
  await page.route("**/openmrs/ws/rest/v1/location**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: [{ uuid: "location-1", display: "HCSBA" }] }) }));
  await page.route("**/bahmni_config/openmrs/apps/registration/app.json", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ config: {
    showEnterID: false, defaultIdentifierPrefix: "HCSBA", prominentExtraIdentifierTypes: ["RUN"], hiddenExtraIdentifierTypes: ["CRID MPI"],
    identifierMetadata: { RUN: { typeCode: "1", use: "official", issuerCountryCode: "152" } },
  } }) }));
  await page.route("**/implementation_config/openmrs/apps/registration/app.json", (route) => route.fulfill({ status: 404 }));
  await page.route("**/bahmni/i18n/registration/locale_es.json", (route) => route.fulfill({ contentType: "application/json", body: "{}" }));
  await page.route("**/bahmni_config/openmrs/i18n/registration/locale_es.json", (route) => route.fulfill({ contentType: "application/json", body: "{}" }));
  await page.route("**/implementation_config/openmrs/i18n/registration/locale_es.json", (route) => route.fulfill({ status: 404 }));
  await page.route("**/openmrs/ws/rest/v1/idgen/identifiertype**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify([
    { uuid: "clinical-type", name: "Patient Identifier", display: "Patient Identifier", primary: true, required: true, identifierSources: [{ uuid: "hcsba-source", name: "Identificador clínico HCSBA", prefix: "HCSBA" }] },
    { uuid: "run-type", name: "RUN", display: "RUN", primary: false, required: false, identifierSources: [] },
  ]) }));
  await page.route("**/openmrs/ws/rest/v1/idgen", (route) => {
    generated += 1;
    idgenSourceName = String((route.request().postDataJSON() as { identifierSourceName?: string }).identifierSourceName ?? "");
    return route.fulfill({ contentType: "text/plain", body: "HCSBA9001" });
  });
  await page.route("**/openmrs/ws/rest/v1/personattributetype**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: [] }) }));
  await page.route("**/openmrs/ws/rest/v1/relationshiptype**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: [] }) }));
  await page.route("**/openmrs/ws/rest/v1/visittype**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: [] }) }));
  await page.route("**/openmrs/ws/rest/v1/visit**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: [] }) }));
  await page.route("**/openmrs/module/addresshierarchy/ajax/getOrderedAddressHierarchyLevels.form", (route) => route.fulfill({ contentType: "application/json", body: "[]" }));
  await page.route(`**/openmrs/ws/rest/v1/patientprofile/${patientUuid}**`, (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify(profile()) }));
  await page.route(`**/openmrs/ws/rest/v1/bahmnicore/patientprofile/${patientUuid}`, async (route) => {
    savedPayload = route.request().postDataJSON() as typeof savedPayload;
    migrated = true;
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ patient: { uuid: patientUuid } }) });
  });
  await page.route("**/openmrs/ws/rest/v1/eisidentity/identifier-metadata**", async (route) => {
    const records = migrated ? [{ identifierUuid: "run-id", identifierTypeUuid: "run-type", value: run, typeCode: "1", use: "official", issuerCountryCode: "152", voided: false }] : [];
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(records) });
  });
  await page.route(`**/openmrs/ws/fhir2/R4/Patient?identifier=${run}`, (route) => route.fulfill({ contentType: "application/fhir+json", body: JSON.stringify({ resourceType: "Bundle", type: "searchset", total: 0, entry: [] }) }));
  await page.route(`**/openmrs/ws/rest/v1/patient?q=${run}**`, (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: [{ uuid: patientUuid, identifiers: [{ identifier: `RUT*${run}` }] }] }) }));
  await page.route(`**/openmrs/ws/fhir2/R4/Patient/${patientUuid}`, (route) => route.fulfill({ contentType: "application/fhir+json", body: JSON.stringify(fhirPatient) }));
  await page.route(`**/openmrs/mpi-admission-gateway/fhir/Patient?identifier=${run}**`, (route) => route.fulfill({
    contentType: "application/fhir+json",
    headers: { "X-MPI-Outcome": "match-unique", "X-MPI-Source": "minsal", "X-MPI-Purpose": "admision", "X-MPI-Stale": "false" },
    body: JSON.stringify({ resourceType: "Bundle", type: "searchset", total: 1, entry: [{ resource: fhirPatient }] }),
  }));
  await page.route(`**/openmrs/mpi-admission-gateway/_sync/${patientUuid}`, (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ resultado: "actualizado", crid: "synthetic-crid", vinculado: true }) }));
  await page.route("**/openmrs/ws/rest/v1/patientImage**", (route) => route.fulfill({ status: 404 }));

  await page.goto(`/bahmni/registration/patient/${patientUuid}`);
  await page.getByRole("textbox", { name: "RUN" }).fill(run);
  await page.getByRole("button", { name: "Siguiente" }).click();
  await page.getByRole("button", { name: "Siguiente" }).click();
  await page.getByRole("button", { name: /Guardar/ }).click();

  const dialog = page.getByRole("dialog", { name: "Regularizar ficha pre-MPI" });
  await expect(dialog).toContainText("no se creará otro paciente");
  await expect(dialog).toContainText("Se conservará como alias");
  const confirm = dialog.getByRole("button", { name: "Confirmar identidad y regularizar" });
  await expect(confirm).toBeEnabled();
  const accessibility = await new AxeBuilder({ page }).include(".legacy-migration-dialog").analyze();
  expect(accessibility.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? ""))).toEqual([]);
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(dialog).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(confirm).toBeInViewport();
  await confirm.click();

  await expect.poll(() => savedPayload).toBeTruthy();
  expect(generated).toBe(1);
  expect(idgenSourceName).toBe("Identificador clínico HCSBA");
  expect(savedPayload?.patient?.uuid).toBe(patientUuid);
  expect(savedPayload?.patient?.identifiers).toEqual(expect.arrayContaining([
    expect.objectContaining({ identifier: "HCSBA9001", identifierType: "clinical-type", identifierSourceUuid: "hcsba-source", preferred: true }),
    expect.objectContaining({ uuid: "legacy-id", identifier: `RUT*${run}`, identifierType: "clinical-type", preferred: false }),
    expect.objectContaining({ identifier: run, identifierType: "run-type", preferred: false }),
  ]));
  await expect(page.getByText("Paciente guardado correctamente.")).toBeVisible();
});
