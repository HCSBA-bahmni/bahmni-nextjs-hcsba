import { expect, test, type Page, type Route } from "@playwright/test";

const patientUuid = "patient-1";
const existingVisitUuid = "visit-existing";
const encounterTypeName = "RADIOLOGY";
const encounterTypeUuid = "encounter-radiology";
const visitTypeUuid = "visit-type-opd";
const creatorProviderUuid = "provider-creator";
const otherProviderUuid = "provider-other";
const creatorPersonUuid = "person-creator";
const pngBuffer = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=", "base64");

interface CapturedRequests {
  uploads: Array<Record<string, unknown>>;
  saves: Array<Record<string, unknown>>;
  audits: Array<Record<string, unknown>>;
  deletes: string[];
}

interface MockOptions {
  currentProviderUuid: string;
  currentPersonUuid: string;
  includeExistingVisit?: boolean;
  documentProviderUuid?: string;
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

function documentUploadUrl() {
  return `/bahmni/document-upload?encounterType=${encodeURIComponent(encounterTypeName)}&topLevelConcept=${encodeURIComponent("All Radiology orders")}#/patient/${patientUuid}/document`;
}

function visitResults(includeExistingVisit = true) {
  return {
    results: includeExistingVisit ? [{
      uuid: existingVisitUuid,
      startDatetime: "2025-09-02T10:00:00.000Z",
      stopDatetime: "2025-09-02T12:00:00.000Z",
      visitType: { uuid: visitTypeUuid, display: "OPD", name: "OPD" },
      location: { uuid: "location-1", display: "HCSBA" },
      encounters: [{ uuid: "encounter-existing" }],
    }] : [],
  };
}

function encounterResults(documentProviderUuid = creatorProviderUuid) {
  return {
    results: [{
      uuid: "encounter-existing",
      provider: { uuid: documentProviderUuid, display: "Proveedor creador" },
      visit: { uuid: existingVisitUuid, startDatetime: "2025-09-02T10:00:00.000Z", stopDatetime: "2025-09-02T12:00:00.000Z" },
      obs: [{
        uuid: "obs-existing",
        concept: { uuid: "concept-angio", name: { name: "Angiografia" } },
        groupMembers: [{
          id: 1,
          uuid: "member-existing",
          obsDatetime: "2025-09-02T10:30:00.000Z",
          value: "existing-image.png",
          comment: "nota inicial",
        }],
      }],
    }],
  };
}

async function mockDocumentUpload(page: Page, options: MockOptions): Promise<CapturedRequests> {
  const captured: CapturedRequests = { uploads: [], saves: [], audits: [], deletes: [] };
  const includeExistingVisit = options.includeExistingVisit ?? true;

  await page.route("**/document_images/**", (route) => route.fulfill({ contentType: "image/png", body: pngBuffer }));
  await page.route("**/bahmni/i18n/document-upload/locale_es.json", (route) => json(route, {}));
  await page.route("**/bahmni_config/openmrs/i18n/document-upload/locale_es.json", (route) => json(route, {}));
  await page.route("**/implementation_config/openmrs/i18n/document-upload/locale_es.json", (route) => json(route, {}, 404));
  await page.route("**/openmrs/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    if (path.endsWith("/session")) {
      return json(route, {
        authenticated: true,
        user: { uuid: "user-1", display: "superman" },
        sessionLocation: { uuid: "location-1", display: "HCSBA", name: "HCSBA" },
      });
    }
    if (path.endsWith("/user")) {
      return json(route, {
        results: [{
          uuid: "user-1",
          username: "superman",
          display: "superman",
          person: { uuid: options.currentPersonUuid, display: "Persona actual" },
          privileges: [{ name: "app:radiology-upload" }, { name: "app:adt" }],
          roles: [],
          userProperties: { defaultLocale: "es" },
        }],
      });
    }
    if (path.endsWith("/provider")) {
      return json(route, { results: [{ uuid: options.currentProviderUuid, display: "Proveedor actual", retired: false, attributes: [] }] });
    }
    if (path.endsWith("/location")) {
      return json(route, { results: [{ uuid: "location-1", display: "HCSBA", name: "HCSBA" }] });
    }
    if (path.endsWith("/bahmnicore/sql/globalproperty")) {
      return json(route, "Escape");
    }
    if (path.endsWith(`/patientprofile/${patientUuid}`)) {
      return json(route, {
        patient: {
          uuid: patientUuid,
          identifiers: [{ identifier: "RUN*1-9", preferred: true }],
          person: {
            gender: "F",
            birthdate: "1990-01-01",
            names: [{ givenName: "Ana", familyName: "Prueba", preferred: true }],
          },
        },
      });
    }
    if (path.endsWith("/visittype")) {
      return json(route, { results: [{ uuid: visitTypeUuid, display: "OPD", name: "OPD" }] });
    }
    if (path.endsWith("/bahmnicore/config/bahmniencounter")) {
      return json(route, { encounterTypes: { [encounterTypeName]: encounterTypeUuid } });
    }
    if (path.endsWith("/visit")) {
      return json(route, visitResults(includeExistingVisit));
    }
    if (path.endsWith("/encounter")) {
      return json(route, includeExistingVisit ? encounterResults(options.documentProviderUuid) : { results: [] });
    }
    if (path.endsWith("/concept")) {
      return json(route, {
        results: [{
          uuid: "top-radiology",
          setMembers: [
            { uuid: "concept-angio", name: { name: "Angiografia" } },
            { uuid: "concept-ct", name: { name: "Tomografia computarizada de abdomen y pelvis con contraste" } },
            { uuid: "concept-xray", name: { name: "Radiografia diagnostica del torax, posteroanterior y lateral combinadas" } },
          ],
        }],
      });
    }
    if (path.endsWith("/bahmnicore/visitDocument/uploadDocument") && method === "POST") {
      captured.uploads.push(JSON.parse(request.postData() ?? "{}") as Record<string, unknown>);
      return json(route, { url: `uploaded-${captured.uploads.length}.png` });
    }
    if (path.endsWith("/bahmnicore/visitDocument") && method === "DELETE") {
      captured.deletes.push(url.searchParams.get("filename") ?? "");
      return json(route, {});
    }
    if (path.endsWith("/bahmnicore/visitDocument") && method === "POST") {
      captured.saves.push(JSON.parse(request.postData() ?? "{}") as Record<string, unknown>);
      return json(route, { visitUuid: "visit-created", encounterUuid: `encounter-saved-${captured.saves.length}` });
    }
    if (path.endsWith("/auditlog") && method === "POST") {
      captured.audits.push(JSON.parse(request.postData() ?? "{}") as Record<string, unknown>);
      return json(route, {});
    }

    return json(route, {}, 404);
  });

  return captured;
}

async function openPersistedVisit(page: Page) {
  const panel = page.locator(".document-upload-visit-panel").filter({ hasText: "Desde: 02 sept. 2025" });
  await panel.locator(".document-upload-visit-header").click();
  await expect(panel.getByText("existing-image.png")).toBeVisible();
  return panel;
}

async function addImageFile(panel: ReturnType<Page["locator"]>, name = "nuevo.png") {
  await panel.locator("input[type='file']").setInputFiles({ name, mimeType: "image/png", buffer: pngBuffer });
  await expect(panel.getByText(name)).toBeVisible();
}

test("document upload lets the creating provider edit, remove and restore a persisted document", async ({ page }) => {
  const captured = await mockDocumentUpload(page, {
    currentProviderUuid: creatorProviderUuid,
    currentPersonUuid: creatorPersonUuid,
    documentProviderUuid: creatorProviderUuid,
  });

  await page.goto(documentUploadUrl());
  const panel = await openPersistedVisit(page);
  const row = panel.locator(".document-upload-existing-files li").first();

  await row.getByRole("button", { name: "Agregar notas" }).click();
  await row.getByPlaceholder("Notas").fill("nota editada");
  await row.locator(".document-upload-type-field .p-dropdown").click();
  await page.getByRole("option", { name: "Tomografia computarizada de abdomen y pelvis con contraste" }).click();
  await row.getByRole("button", { name: "Quitar archivo" }).click();
  await expect(row.getByRole("button", { name: "Restaurar archivo" })).toBeVisible();
  await row.getByRole("button", { name: "Restaurar archivo" }).click();

  await panel.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Archivo guardado correctamente.")).toBeVisible();

  expect(captured.deletes).toEqual([]);
  expect(captured.saves).toHaveLength(1);
  expect(captured.saves[0]).toMatchObject({
    patientUuid,
    visitUuid: existingVisitUuid,
    encounterTypeUuid,
    providerUuid: creatorProviderUuid,
    documents: [expect.objectContaining({
      obsUuid: "obs-existing",
      image: "existing-image.png",
      testUuid: "concept-ct",
      comment: "nota editada",
      voided: false,
    })],
  });
  expect(captured.audits).toEqual([expect.objectContaining({
    eventType: "EDIT_ENCOUNTER",
    message: 'EDIT_ENCOUNTER_MESSAGE~{"encounterUuid":"encounter-saved-1","encounterType":"RADIOLOGY"}',
    patientUuid,
    module: "RADIOLOGY",
  })]);
});

test("document upload blocks persisted document edits for a different provider and saves only new files", async ({ page }) => {
  const captured = await mockDocumentUpload(page, {
    currentProviderUuid: otherProviderUuid,
    currentPersonUuid: "person-other",
    documentProviderUuid: creatorProviderUuid,
  });

  await page.goto(documentUploadUrl());
  const panel = await openPersistedVisit(page);
  const row = panel.locator(".document-upload-existing-files li").first();

  await expect(row.locator(".document-upload-type-field .p-dropdown")).toHaveClass(/p-disabled/);
  await expect(row.getByRole("button", { name: "Quitar archivo" })).toHaveCount(0);
  await row.getByRole("button", { name: "Agregar notas" }).click();
  await expect(row.getByPlaceholder("Notas")).toBeDisabled();

  await addImageFile(panel, "temporal.png");
  await panel.getByText("temporal.png").locator("xpath=ancestor::li").getByRole("button", { name: "Quitar archivo" }).click();
  await expect(panel.getByText("temporal.png")).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "Guardar" })).toBeDisabled();

  await addImageFile(panel, "nuevo.png");
  await panel.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Archivo guardado correctamente.")).toBeVisible();

  expect(captured.saves).toHaveLength(1);
  const documents = captured.saves[0]?.documents as Array<Record<string, unknown>>;
  expect(documents).toHaveLength(1);
  expect(documents[0]).toEqual(expect.objectContaining({ image: "uploaded-1.png", testUuid: "concept-angio" }));
  expect(documents[0]).not.toHaveProperty("obsUuid");
  expect(JSON.stringify(captured.saves[0])).not.toContain("obs-existing");
  expect(JSON.stringify(captured.saves[0])).not.toContain("existing-image.png");
  expect(captured.audits).toEqual([expect.objectContaining({ eventType: "EDIT_ENCOUNTER", patientUuid, module: "RADIOLOGY" })]);
});

test("document upload audits open visit and edit encounter when saving a new visit", async ({ page }) => {
  const captured = await mockDocumentUpload(page, {
    currentProviderUuid: creatorProviderUuid,
    currentPersonUuid: creatorPersonUuid,
    includeExistingVisit: false,
  });

  await page.goto(documentUploadUrl());
  const panel = page.locator(".document-upload-visit-panel").filter({ hasText: "Nueva visita" });
  await expect(panel.getByText("Tipo de visita")).toBeVisible();

  await panel.locator(".document-upload-form-grid .p-dropdown").click();
  await page.getByRole("option", { name: "OPD" }).click();
  await panel.locator(".p-calendar input").first().fill("14/08/2026");
  await panel.locator(".p-calendar input").first().press("Tab");
  await addImageFile(panel, "nueva-visita.png");

  await expect(panel.getByRole("button", { name: "Guardar" })).toBeEnabled();
  await panel.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Archivo guardado correctamente.")).toBeVisible();

  expect(captured.uploads).toEqual([expect.objectContaining({
    patientUuid,
    encounterTypeName,
    fileType: "image",
    fileName: "nueva-visita",
  })]);
  expect(captured.saves).toHaveLength(1);
  expect(captured.saves[0]).toMatchObject({
    patientUuid,
    visitTypeUuid,
    encounterTypeUuid,
    providerUuid: creatorProviderUuid,
    documents: [expect.objectContaining({ image: "uploaded-1.png", testUuid: "concept-angio" })],
  });
  expect(captured.saves[0]).not.toHaveProperty("visitUuid");
  expect(captured.audits).toEqual([
    expect.objectContaining({
      eventType: "OPEN_VISIT",
      message: 'OPEN_VISIT_MESSAGE~{"visitUuid":"visit-created","visitType":"OPD"}',
      patientUuid,
      module: "RADIOLOGY",
    }),
    expect.objectContaining({
      eventType: "EDIT_ENCOUNTER",
      message: 'EDIT_ENCOUNTER_MESSAGE~{"encounterUuid":"encounter-saved-1","encounterType":"RADIOLOGY"}',
      patientUuid,
      module: "RADIOLOGY",
    }),
  ]);
});
