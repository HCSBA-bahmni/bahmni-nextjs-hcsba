import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.skip(process.env.E2E_MPI_PREVIEW !== "true", "Run against the local preview profile with E2E_MPI_PREVIEW=true");

const patient = { resourceType: "Patient", id: "mpi-crid-1", identifier: [{ value: "12345678-5" }], name: [{ family: "Prueba", given: ["Persona", "Sintética"] }], gender: "female", birthDate: "1990-02-03" };
const bundle = (patients: unknown[]) => JSON.stringify({ resourceType: "Bundle", type: "searchset", entry: patients.map((resource) => ({ resource })) });

test.beforeEach(async ({ page }) => {
  await page.route("**/openmrs/**", (route) => route.fulfill({ status: 404, contentType: "application/json", body: "{}" }));
  await page.route("**/openmrs/ws/rest/v1/session**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ authenticated: true, user: { uuid: "user-1", display: "operador" }, sessionLocation: { uuid: "location-1", display: "HCSBA" } }) }));
  await page.route("**/openmrs/ws/rest/v1/user**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: [{ uuid: "user-1", username: "operador", display: "operador", privileges: [{ name: "Add Patients" }], roles: [] }] }) }));
  await page.route("**/openmrs/ws/rest/v1/provider**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: [{ uuid: "provider-1", display: "Operador de prueba", retired: false, attributes: [] }] }) }));
  await page.route("**/openmrs/ws/rest/v1/location**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: [{ uuid: "location-1", display: "HCSBA" }] }) }));
  await page.route("**/openmrs/ws/rest/v1/idgen/identifiertype**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify([
    { uuid: "local-id", name: "Patient Identifier", primary: true, identifierSources: [{ uuid: "source-local", name: "HCSBA", prefix: "HCSBA" }] },
    { uuid: "run-id", name: "RUN", identifierSources: [] },
  ]) }));
  await page.route("**/openmrs/ws/rest/v1/personattributetype**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: [] }) }));
  await page.route("**/openmrs/ws/rest/v1/relationshiptype**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: [] }) }));
  await page.route("**/openmrs/module/addresshierarchy/ajax/getOrderedAddressHierarchyLevels.form", (route) => route.fulfill({ contentType: "application/json", body: "[]" }));
  await page.route("**/bahmni_config/openmrs/apps/registration/app.json", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ config: { defaultIdentifierPrefix: "HCSBA", showEnterID: false, prominentExtraIdentifierTypes: ["RUN"], identifierMetadata: { RUN: { typeCode: "1", use: "official" } }, mandatoryPersonAttributes: ["biologicalSex"] } }) }));
  await page.route("**/implementation_config/openmrs/apps/registration/app.json", (route) => route.fulfill({ status: 404 }));
  await page.route("**/openmrs/ws/fhir2/R4/Patient?*", (route) => route.fulfill({ contentType: "application/fhir+json", body: bundle([]) }));
  await page.route("**/openmrs/ws/rest/v1/patient?q=*", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: [] }) }));
});

test("no match can be confirmed, but synthetic preview cannot save into OpenMRS", async ({ page }) => {
  await page.route("**/openmrs/mpi-admission-gateway/fhir/Patient?*", (route) => route.fulfill({ contentType: "application/fhir+json", headers: { "X-MPI-Outcome": "no-match", "X-MPI-Source": "minsal", "X-MPI-Purpose": "admision" }, body: bundle([]) }));
  await page.goto("/bahmni/registration/patient/new");
  await expect(page.getByRole("heading", { name: "Verificación de identidad MPI" })).toBeVisible();
  const accessibility = await new AxeBuilder({ page }).include(".mpi-admission-gate").analyze();
  expect(accessibility.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? ""))).toEqual([]);
  await page.getByLabel("RUN", { exact: true }).fill("12345678-5");
  await page.getByRole("button", { name: "Consultar identidad" }).click();
  await expect(page.getByText("No se encontró ficha local ni identidad MPI")).toBeVisible();
  await page.getByRole("button", { name: "Confirmar documento y completar EIS" }).click();
  await expect(page.getByRole("heading", { name: "Datos de identificación" })).toBeVisible();
  await expect(page.getByText("Prueba MPI sintética", { exact: false })).toBeVisible();
  await expect(page.getByLabel("RUN", { exact: true })).toHaveValue("12345678-5");
  await expect(page.getByRole("button", { name: "Generar RUN" })).toHaveCount(0);
  await page.getByRole("button", { name: "Siguiente" }).click();
  await page.getByRole("button", { name: "Siguiente" }).click();
  await expect(page.getByRole("heading", { name: "Identificador clínico OpenMRS" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Guardar paciente" })).toBeDisabled();
});

test("a legacy CLRUN* patient is opened instead of creating another chart", async ({ page }) => {
  const legacy = { ...patient, id: "legacy-patient", identifier: [{ value: "CLRUN*12345678-5" }] };
  await page.route("**/openmrs/ws/rest/v1/patient?q=*", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: [{ uuid: "legacy-patient", identifiers: [{ identifier: "CLRUN*12345678-5" }] }] }) }));
  await page.route("**/openmrs/ws/fhir2/R4/Patient/legacy-patient", (route) => route.fulfill({ contentType: "application/fhir+json", body: JSON.stringify(legacy) }));
  await page.route("**/openmrs/mpi-admission-gateway/fhir/Patient?*", (route) => route.fulfill({ contentType: "application/fhir+json", headers: { "X-MPI-Outcome": "no-match", "X-MPI-Source": "minsal", "X-MPI-Purpose": "admision" }, body: bundle([]) }));
  await page.goto("/bahmni/registration/patient/new");
  await page.getByLabel("RUN", { exact: true }).fill("12345678-5");
  await page.getByRole("button", { name: "Consultar identidad" }).click();
  await expect(page.getByRole("button", { name: "Abrir ficha existente" })).toBeVisible();
  await expect(page.getByRole("button", { name: /completar EIS/ })).toHaveCount(0);
});

test("RUN is manual in the first step and the clinical number is assigned later", async ({ page }) => {
  await page.route("**/openmrs/mpi-admission-gateway/fhir/Patient?*", (route) => route.fulfill({ contentType: "application/fhir+json", headers: { "X-MPI-Outcome": "no-match", "X-MPI-Source": "minsal", "X-MPI-Purpose": "admision" }, body: bundle([]) }));
  await page.goto("/bahmni/registration/patient/new");
  await page.getByLabel("RUN", { exact: true }).fill("12345678-5");
  await page.getByRole("button", { name: "Consultar identidad" }).click();
  await page.getByRole("button", { name: "Confirmar documento y completar EIS" }).click();
  await expect(page.getByLabel("RUN", { exact: true })).toHaveValue("12345678-5");
  await expect(page.getByRole("button", { name: "Generar RUN" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Identificador clínico OpenMRS" })).toBeHidden();
  await page.getByRole("button", { name: "Siguiente" }).click();
  await page.getByRole("button", { name: "Siguiente" }).click();
  await expect(page.getByRole("heading", { name: "Identificador clínico OpenMRS" })).toBeVisible();
  await expect(page.getByLabel("Número de ficha")).toHaveValue("Se asignará automáticamente al guardar");
});

test("a known OpenMRS patient is opened instead of creating a duplicate", async ({ page }) => {
  await page.route("**/openmrs/ws/fhir2/R4/Patient?*", (route) => route.fulfill({ contentType: "application/fhir+json", body: bundle([{ ...patient, id: "patient-existing" }]) }));
  await page.route("**/openmrs/mpi-admission-gateway/fhir/Patient?*", (route) => route.fulfill({ contentType: "application/fhir+json", headers: { "X-MPI-Outcome": "match-unique", "X-MPI-Source": "local", "X-MPI-Purpose": "admision" }, body: bundle([patient]) }));
  await page.goto("/bahmni/registration/patient/new");
  await page.getByLabel("RUN", { exact: true }).fill("12345678-5");
  await page.getByRole("button", { name: "Consultar identidad" }).click();
  await expect(page.getByRole("button", { name: "Abrir ficha existente" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirmar identidad y completar EIS" })).toHaveCount(0);
  await page.getByRole("button", { name: "Abrir ficha existente" }).click();
  await expect(page).toHaveURL(/\/registration\/patient\/patient-existing$/);
});

test("stale or ambiguous MPI responses do not permit a new record", async ({ page }) => {
  await page.route("**/openmrs/mpi-admission-gateway/fhir/Patient?*", (route) => route.fulfill({ contentType: "application/fhir+json", headers: { "X-MPI-Outcome": "no-match", "X-MPI-Stale": "true", "X-MPI-Source": "local", "X-MPI-Purpose": "admision" }, body: bundle([]) }));
  await page.goto("/bahmni/registration/patient/new");
  await page.getByLabel("RUN", { exact: true }).fill("12345678-5");
  await page.getByRole("button", { name: "Consultar identidad" }).click();
  await expect(page.getByText("El MPI nacional no pudo confirmar la identidad", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: /completar EIS/ })).toHaveCount(0);
});

test("a cached negative result is refreshed nationally before creating a ficha", async ({ page }) => {
  const queries: string[] = [];
  await page.route("**/openmrs/mpi-admission-gateway/fhir/Patient?*", (route) => {
    queries.push(route.request().url());
    const refreshed = route.request().url().includes("_refresh=true");
    return route.fulfill({ contentType: "application/fhir+json", headers: { "X-MPI-Outcome": "no-match", "X-MPI-Source": refreshed ? "minsal" : "local", "X-MPI-Purpose": "admision" }, body: bundle([]) });
  });
  await page.goto("/bahmni/registration/patient/new");
  await page.getByLabel("RUN", { exact: true }).fill("12345678-5");
  await page.getByRole("button", { name: "Consultar identidad" }).click();
  await expect(page.getByRole("button", { name: "Confirmar documento y completar EIS" })).toBeVisible();
  expect(queries).toHaveLength(2);
  expect(queries[1]).toContain("_refresh=true");
});
