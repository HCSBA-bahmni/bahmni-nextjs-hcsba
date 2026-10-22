import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const patientUuid = "11111111-1111-4111-8111-111111111111";
const candidate = { crid: "22222222-2222-4222-8222-222222222222", category: "potential", patient: { name: [{ given: ["Persona"], family: "Prueba" }], birthDate: "1990-01-02" } };
const passportMetadata = { identifierUuid: "passport-id", identifierTypeUuid: "passport-type", value: "TEST-P000123", typeCode: "4", use: "official", issuerCountryCode: "604", validTo: "2035-01-02", voided: false };

async function setup(page: Page, candidates: unknown[] = [], manager = false) {
  const writes: Array<{ kind: string; body: Record<string, unknown> }> = [];
  let pendingSaved = false;
  const json = (body: unknown) => ({ contentType: "application/json", body: JSON.stringify(body) });
  // Every clinical/national request is intercepted; synthetic RUNs cannot leave this test.
  await page.route("**/openmrs/**", route => route.fulfill({ status: 404, ...json({}) }));
  await page.route("**/openmrs/ws/rest/v1/session**", route => route.fulfill(json({ authenticated: true, user: { uuid: "user-1", display: "superman" }, sessionLocation: { uuid: "location-1", display: "HCSBA" } })));
  await page.route("**/openmrs/ws/rest/v1/user**", route => route.fulfill(json({ results: [{ uuid: "user-1", username: "superman", privileges: [{ name: "app:registration" }, ...(manager ? [{ name: "Manage MPI Identity Reviews" }] : [])], roles: [] }] })));
  for (const resource of ["provider", "location", "personattributetype", "relationshiptype", "visittype", "visit"]) {
    await page.route(`**/openmrs/ws/rest/v1/${resource}**`, route => route.fulfill(json({ results: resource === "location" ? [{ uuid: "location-1", display: "HCSBA" }]
      : resource === "provider" ? [{ uuid: "provider-1", display: "Operador de prueba", retired: false, attributes: [] }] : [] })));
  }
  await page.route("**/bahmni_config/openmrs/apps/registration/app.json", route => route.fulfill(json({ config: {
    showEnterID: false, defaultIdentifierPrefix: "HCSBA", prominentExtraIdentifierTypes: ["RUN", "Pasaporte"], hiddenExtraIdentifierTypes: ["CRID MPI"],
    identifierMetadata: { RUN: { typeCode: "1", use: "official", issuerCountryCode: "152" }, Pasaporte: { typeCode: "4", use: "official", country: true, countryRequired: true, period: true } },
  } })));
  await page.route("**/implementation_config/openmrs/apps/registration/app.json", route => route.fulfill({ status: 404 }));
  await page.route("**/openmrs/ws/rest/v1/idgen/identifiertype**", route => route.fulfill(json([
    { uuid: "clinical-type", name: "Patient Identifier", display: "Patient Identifier", primary: true, identifierSources: [{ uuid: "hcsba-source", name: "Identificador clínico HCSBA", prefix: "HCSBA" }] },
    { uuid: "run-type", name: "RUN", display: "RUN", identifierSources: [] },
    { uuid: "passport-type", name: "Pasaporte", display: "Pasaporte", identifierSources: [] },
  ])));
  await page.route("**/openmrs/module/addresshierarchy/ajax/getOrderedAddressHierarchyLevels.form", route => route.fulfill(json([])));
  await page.route(`**/openmrs/ws/rest/v1/patientprofile/${patientUuid}**`, route => route.fulfill(json({ patient: {
    uuid: patientUuid, person: { uuid: patientUuid, names: [{ uuid: "name-1", givenName: "Persona", familyName: "Prueba", preferred: true }], addresses: [], attributes: [], gender: "F", birthdate: "1990-01-02" },
    identifiers: [{ uuid: "clinical-id", identifier: "HCSBA9001", preferred: true, identifierType: { uuid: "clinical-type" }, location: { uuid: "location-1" } },
      { uuid: "passport-id", identifier: "TEST-P000123", preferred: false, identifierType: { uuid: "passport-type" }, location: { uuid: "location-1" } }],
  }, relationships: [] })));
  await page.route("**/openmrs/ws/rest/v1/eisidentity/identifier-metadata**", async route => {
    if (route.request().method() === "POST") writes.push({ kind: "eis", body: route.request().postDataJSON() });
    await route.fulfill(json([passportMetadata, { identifierUuid: "run-id", identifierTypeUuid: "run-type", value: "12345678-5", typeCode: "1", use: "official", issuerCountryCode: "152" }]));
  });
  await page.route(`**/openmrs/ws/rest/v1/bahmnicore/patientprofile/${patientUuid}`, async route => {
    writes.push({ kind: "clinical", body: route.request().postDataJSON() });
    await route.fulfill(json({ patient: { uuid: patientUuid } }));
  });
  await page.route("**/openmrs/ws/rest/v1/patient?q=**", route => route.fulfill(json({ results: [] })));
  await page.route("**/openmrs/ws/fhir2/R4/Patient?**", route => route.fulfill(json({ resourceType: "Bundle", entry: [] })));
  await page.route("**/openmrs/mpi-admission-gateway/fhir/Patient?**", route => route.fulfill({ ...json({ resourceType: "Bundle", entry: [] }), headers: { "X-MPI-Outcome": "no-match", "X-MPI-Source": "minsal", "X-MPI-Purpose": "admision" } }));
  await page.route("**/openmrs/mpi-admission-gateway/_identity", route => route.fulfill(json({ enabled: true, deferredReviews: true, canManage: manager, identifierMap: [
    { name: "Pasaporte", teiTypeCode: "05" }, { name: "RUN", teiTypeCode: "01", issuerCountryCode: "152" },
  ] })));
  await page.route("**/openmrs/mpi-admission-gateway/_match", route => route.fulfill(json({ provider: "opencr", candidates, token: "signed-review" })));
  await page.route(`**/openmrs/mpi-admission-gateway/_sync/${patientUuid}`, async route => {
    writes.push({ kind: "sync", body: route.request().postDataJSON() });
    pendingSaved = Boolean(route.request().postDataJSON().review?.caseId);
    await route.fulfill(json(pendingSaved ? { resultado: "revision-pendiente", caseId: route.request().postDataJSON().review.caseId, vinculado: false } : { resultado: "actualizado", crid: candidate.crid, vinculado: true }));
  });
  const reviewId = "33333333-3333-4333-8333-333333333333";
  const row = { id: reviewId, patientUuid, clinicalNumber: "HCSBA9001", status: "pending", patient: { name: [{ given: ["Persona"], family: "Prueba" }], identifier: [{ type: { coding: [{ code: "01" }] }, value: "12345678-5" }], gender: "female", birthDate: "1990-01-02" }, heldRun: "12345678-5", requestedBy: "admisor", createdAt: "2026-10-19T12:00:00Z", reason: "RUN y nacimiento distintos", version: 2, candidates, token: "fresh" };
  await page.route("**/openmrs/mpi-admission-gateway/_reviews**", async route => {
    const req = route.request();
    if (req.method() === "GET") return route.fulfill(json({ cases: manager || pendingSaved ? [row] : [] }));
    if (req.url().endsWith("/prepare")) return route.fulfill(json(row));
    if (req.url().endsWith("/resolve")) { writes.push({ kind: "resolve", body: req.postDataJSON() }); return route.fulfill(json({ status: req.postDataJSON().decision === "defer" ? "pending" : "resolved" })); }
    writes.push({ kind: "review", body: req.postDataJSON() });
    const heldRun = req.postDataJSON().patient.identifier.find((i: { type?: { coding?: Array<{ code: string }> } }) => i.type?.coding?.some(c => c.code === "01"))?.value;
    return route.fulfill(json({ id: reviewId, heldRun }));
  });
  return writes;
}

async function submitExisting(page: Page, addRun = false, save = true) {
  await page.goto(`/bahmni/registration/patient/${patientUuid}`);
  await expect(page.getByRole("textbox", { name: "Nombres", exact: true })).toHaveValue("Persona");
  if (addRun) await page.getByRole("textbox", { name: "RUN", exact: true }).fill("12345678-5");
  await page.getByRole("button", { name: "Siguiente", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Información de dirección", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Siguiente", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Información adicional", exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Pasaporte", exact: true })).toHaveValue("TEST-P000123");
  if (save) await page.getByRole("button", { name: /Guardar/ }).click();
}

test("admission sends candidates to a manager before any clinical write", async ({ page }) => {
  const writes = await setup(page, [candidate]);
  await submitExisting(page);
  const dialog = page.getByRole("dialog", { name: "Enviar identidad a revisión" });
  await expect(dialog).toBeVisible(); expect(writes).toEqual([]);
  // Axe must inspect the settled dialog, not Firefox's intermediate fade opacity.
  await expect(dialog).toHaveClass(/p-dialog-enter-done/);
  await expect(dialog.getByRole("radio")).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Guardar y enviar a revisión" })).toBeDisabled();
  await dialog.getByLabel("Observación para el gestor").fill("El pasaporte presenta datos que requieren revisión");
  const accessibility = await new AxeBuilder({ page }).include("[role=dialog]").analyze();
  expect(accessibility.violations.filter(v => ["critical", "serious"].includes(v.impact || ""))).toEqual([]);
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await dialog.getByRole("button", { name: "Guardar y enviar a revisión" }).click();
  await expect.poll(() => writes.map(w => w.kind)).toEqual(["review", "clinical", "eis", "sync"]);
  expect(writes[3]?.body.review).toEqual(expect.objectContaining({ caseId: "33333333-3333-4333-8333-333333333333" }));
});

test("admission holds the RUN proposal and retains the original passport and chart UUID", async ({ page }) => {
  const writes = await setup(page, [{ ...candidate, category: "auto", patient: { ...candidate.patient, birthDate: "1990-01-03", gender: "female", identifier: [{ system: "http://clientregistry.org/nationalid", value: "12345678-5" }] } }]);
  await submitExisting(page, true);
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Estás incorporando el RUN 12345678-5" })).toBeVisible();
  await expect(dialog.getByText("Diferente", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("radio")).toHaveCount(0);
  await dialog.getByLabel("Observación para el gestor").fill("La fecha de nacimiento es diferente. Revisar documentos.");
  await dialog.getByRole("button", { name: "Guardar y enviar a revisión" }).click();
  await expect.poll(() => writes.map(w => w.kind)).toEqual(["review", "clinical", "eis", "sync"]);
  const saved = writes[1]?.body.patient as { uuid: string; identifiers: Array<{ identifier: string }> };
  expect(saved.uuid).toBe(patientUuid);
  expect(saved.identifiers.map(i => i.identifier)).toEqual(expect.arrayContaining(["HCSBA9001", "TEST-P000123"]));
  expect(saved.identifiers.map(i => i.identifier)).not.toContain("12345678-5");
});

test("admission has no inbox access even through its direct URL", async ({ page }) => {
  const writes = await setup(page);
  await page.goto("/bahmni/registration/reviews");
  await expect(page.getByRole("heading", { name: "Acceso reservado al gestor de identidad" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Revisar antecedentes" })).toHaveCount(0);
  expect(writes).toEqual([]);
});

test("an already assigned local RUN can be referred without a national lookup", async ({ page }) => {
  const existingUuid="44444444-4444-4444-8444-444444444444";
  await setup(page,[{...candidate,category:"auto",localPatientUuid:existingUuid,clinicalNumber:"HCSBA9002"}]);
  await page.route("**/openmrs/ws/fhir2/R4/Patient?**",route=>route.fulfill({contentType:"application/json",body:JSON.stringify({resourceType:"Bundle",entry:[{resource:{resourceType:"Patient",id:existingUuid,identifier:[{value:"12345678-5"}]}}]})}));
  let nationalLookups=0;
  await page.route("**/openmrs/mpi-admission-gateway/fhir/Patient?**",route=>{nationalLookups++;return route.fulfill({status:503});});
  await submitExisting(page,true);
  await expect(page.getByRole("dialog",{name:"Enviar identidad a revisión"})).toBeVisible();
  expect(nationalLookups).toBe(0);
});

test("manager refreshes OpenCR candidates and resolves with documented evidence", async ({ page }) => {
  const writes = await setup(page, [candidate], true);
  await page.goto("/bahmni/registration/reviews");
  await page.getByRole("button", { name: "Revisar antecedentes" }).click();
  const dialog = page.getByRole("dialog", { name: "Resolver revisión de identidad" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Confirmo que corresponde a esta persona").check();
  await dialog.getByLabel("Motivo y evidencia de la verificación").fill("Se cotejaron RUN y pasaporte originales de prueba");
  await dialog.getByRole("button", { name: "Guardar resolución" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Identidad asociada correctamente" })).toBeVisible();
  expect(writes).toEqual([{ kind: "resolve", body: expect.objectContaining({ decision: "same", selectedCrid: candidate.crid, version: 2 }) }]);
});

test("manager may keep a case pending without choosing an identity", async ({ page }) => {
  const writes = await setup(page, [candidate], true);
  await page.goto("/bahmni/registration/reviews");
  await page.getByRole("button", { name: "Revisar antecedentes" }).click();
  await page.getByLabel("Motivo y evidencia de la verificación").fill("Falta documentación para explicar la diferencia de fecha");
  await page.getByRole("button", { name: "Mantener pendiente" }).click();
  await expect(page.getByRole("status").filter({ hasText: "La revisión sigue pendiente" })).toBeVisible();
  expect(writes[0]?.body.decision).toBe("defer");
});

test("an unavailable matching engine prevents saving the clinical chart", async ({ page }) => {
  const writes = await setup(page);
  await page.route("**/openmrs/mpi-admission-gateway/_match", route => route.fulfill({ status: 503, contentType: "application/json", body: "{}" }));
  await submitExisting(page);
  await expect(page.locator(".error-banner").filter({ hasText: "No se pudo verificar la identidad" })).toBeVisible();
  expect(writes).toEqual([]);
});

test("without RUN uses plain language and hides technical identity tags", async ({ page }) => {
  await setup(page);
  await page.goto("/bahmni/registration/patient/new");
  await page.getByText("La persona no tiene RUN", { exact: true }).click();
  await page.getByLabel("Confirmo que revisé la búsqueda local con el documento presentado.").check();
  await page.getByRole("button", { name: "Continuar con otro documento" }).click();
  await expect(page.getByText("Sin RUN: se buscarán posibles coincidencias", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Datos de identificación" })).toBeVisible();
  await expect(page.getByText(/CRID:|Traza:/)).toHaveCount(0);
});
test("passport issuer displays a country name while keeping the stored code", async ({ page }) => {
  const writes = await setup(page, [candidate]);
  await page.route("**/openmrs/ws/rest/v1/personattributetype**", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: [{ uuid: "origin-attribute", name: "countryOfOrigin", concept: { uuid: "country-catalog" } }] }) }));
  await page.route("**/openmrs/ws/rest/v1/concept/country-catalog**", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ answers: [{ uuid: "peru-concept", display: "País ISO 3166-1 604 - PERÚ" }] }) }));
  await submitExisting(page);
  await expect(page.getByRole("dialog").getByText("País emisor: PERÚ", { exact: true })).toHaveCount(2);
  await page.getByLabel("Observación para el gestor").fill("Cotejar pasaporte extranjero antes de asociar");
  await page.getByRole("button", { name: "Guardar y enviar a revisión" }).click();
  await expect.poll(() => writes.map(w => w.kind)).toEqual(["review", "clinical", "eis", "sync"]);
  expect(JSON.stringify(writes[2]?.body)).toContain('"issuerCountryCode":"604"');
});
test("a verified consolidated chart can start a visit without returning to pending identity", async ({ page }) => {
  const writes = await setup(page);
  const json = (body: unknown) => ({ contentType: "application/json", body: JSON.stringify(body) });
  await page.route("**/openmrs/mpi-admission-gateway/_sync/**", async route => {
    writes.push({ kind: "sync", body: {} });
    await route.fulfill(json({ resultado: "consolidacion-verificada", crid: "crid-merged", vinculado: true, caseId: "case-merged", preferredUuid: patientUuid }));
  });
  await page.route("**/openmrs/ws/rest/v1/visittype**", route => route.fulfill(json({ results: [{ uuid: "opd", name: "OPD", display: "OPD" }] })));
  await page.route("**/openmrs/ws/rest/v1/bahmnicore/visitLocation/**", route => route.fulfill(json({ uuid: "visit-location", display: "Hospital" })));
  await page.route("**/openmrs/ws/rest/v1/visit", async route => {
    writes.push({ kind: "visit", body: route.request().postDataJSON() });
    await route.fulfill(json({ uuid: "visit-consolidated", startDatetime: "2026-10-19T16:00:00Z" }));
  });
  await submitExisting(page, false, false);
  await page.getByRole("button", { name: /visita OPD/ }).click();
  await expect.poll(() => writes.map(w => w.kind)).toEqual(["clinical", "eis", "sync", "visit"]);
  await expect(page).toHaveURL(new RegExp(`${patientUuid}/visit\\?visitUuid=visit-consolidated`), { timeout: 15_000 });
  expect(writes[3]?.body.patient).toBe(patientUuid);
  await expect(page.getByText("La ficha se guardó, pero falta completar la verificación de identidad. No cree otra ficha.")).toHaveCount(0);
});

test("an admission alert permits starting the requested visit with the same patient", async ({ page }) => {
  const writes = await setup(page, [candidate]);
  const json = (body: unknown) => ({ contentType: "application/json", body: JSON.stringify(body) });
  await page.route("**/openmrs/ws/rest/v1/visittype**", route => route.fulfill(json({ results: [{ uuid: "opd", name: "OPD", display: "OPD" }] })));
  await page.route("**/openmrs/ws/rest/v1/bahmnicore/visitLocation/**", route => route.fulfill(json({ uuid: "visit-location", display: "Hospital" })));
  await page.route("**/openmrs/ws/rest/v1/visit", async route => {
    writes.push({ kind: "visit", body: route.request().postDataJSON() });
    await route.fulfill(json({ uuid: "visit-1", startDatetime: "2026-10-19T12:00:00Z" }));
  });
  await submitExisting(page, false, false);
  await page.getByRole("button", { name: /visita OPD/ }).click();
  await page.getByLabel("Observación para el gestor").fill("Identidad por revisar; paciente continúa su ingreso");
  await page.getByRole("button", { name: "Guardar y enviar a revisión" }).click();
  await expect.poll(() => writes.map(w => w.kind)).toEqual(["review", "clinical", "eis", "sync", "visit"]);
  expect(writes[4]?.body.patient).toBe(patientUuid);
  await expect(page).toHaveURL(new RegExp(`${patientUuid}/visit\\?visitUuid=visit-1`));
  await expect(page.getByText("Revisión pendiente", { exact: true })).toBeVisible();
});
