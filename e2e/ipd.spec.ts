import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.beforeEach(async ({ page }) => {
  await page.route("**/openmrs/ws/rest/v1/session**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ authenticated: true, user: { uuid: "user", display: "superman" }, sessionLocation: { uuid: "location", display: "IPD" } }) }));
  await page.route("**/openmrs/ws/rest/v1/user**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: [{ uuid: "user", username: "superman", display: "superman", privileges: ["app:adt", "Assign Beds", "Edit Bed Tags"].map((name) => ({ uuid: name, name })), roles: [] }] }) }));
  await page.route("**/openmrs/ws/rest/v1/provider**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: [{ uuid: "provider", display: "Super Man", attributes: [] }] }) }));
  await page.route("**/openmrs/ws/rest/v1/location**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: [{ uuid: "location", display: "IPD" }] }) }));
  await page.route("**/bahmni_config/openmrs/apps/ipd/app.json", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ config: { defaultVisitType: "IPD", enableIPDFeature: true, dashboard: { sections: {} } } }) }));
  await page.route("**/bahmni/i18n/ipd/locale_es.json", (route) => route.fulfill({ status: 404 }));
  await page.route("**/bahmni_config/openmrs/i18n/ipd/locale_es.json", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ MODULE_LABEL_ADMITTED_KEY: "Admitido" }) }));
  await page.route("**/implementation_config/openmrs/i18n/ipd/locale_es.json", (route) => route.fulfill({ status: 404 }));
  await page.route("**/implementation_config/openmrs/apps/ipd/*.json", (route) => route.fulfill({ status: 404 }));
  await page.route("**/bahmni_config/openmrs/apps/ipd/extension.json", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ admitted: { id: "admitted", extensionPointId: "org.bahmni.patient.search", type: "config", label: "Admitted", order: 1, requiredPrivilege: "app:adt", extensionParams: { searchHandler: "sql.admitted", translationKey: "MODULE_LABEL_ADMITTED_KEY" } } }) }));
  await page.route("**/openmrs/ws/rest/v1/bedTag**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: [] }) }));
});

test("renders configured queues and the coordinate-based ward map without legacy bundles", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.route("**/openmrs/ws/rest/v1/bahmnicore/sql**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify([{ uuid: "patient", identifier: "SYN-1", name: "Paciente Sintético", activeVisitUuid: "visit" }]) }));
  await page.route("**/openmrs/ws/rest/v1/admissionLocation/", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: [{ ward: { uuid: "ward", name: "Medicina" } }] }) }));
  await page.route("**/openmrs/ws/rest/v1/admissionLocation/ward**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ ward: { uuid: "ward", name: "Medicina" }, bedLayouts: [
    { bedId: 1, bedUuid: "bed-1", bedNumber: "A-1", status: "AVAILABLE", rowNumber: 1, columnNumber: 1, location: "Sala 1", patients: [], bedTagMaps: [] },
    { bedId: 2, bedUuid: "bed-2", bedNumber: "A-2", status: "OCCUPIED", rowNumber: 1, columnNumber: 2, location: "Sala 1", patients: [{ uuid: "patient-2", display: "SYN-2 - Paciente Ocupante", person: { display: "Paciente Ocupante" }, identifiers: [{ identifier: "SYN-2" }] }], bedTagMaps: [] },
    { bedId: 3, bedUuid: "bed-3", bedNumber: "A-3", status: "RESERVED", rowNumber: 2, columnNumber: 1, location: "Sala 1", patients: [], bedTagMaps: [] },
    { bedId: 4, bedUuid: "bed-4", bedNumber: "A-4", status: "BLOCKED", rowNumber: 2, columnNumber: 2, location: "Sala 1", patients: [], bedTagMaps: [] },
    ...Array.from({ length: 8 }, (_, index) => ({ bedId: index + 5, bedUuid: `bed-${index + 5}`, bedNumber: `B-${index + 1}`, status: "AVAILABLE", rowNumber: 1, columnNumber: 1, location: `Sala ${index + 2}`, patients: [], bedTagMaps: [] })),
  ] }) }));
  await page.goto("/bahmni/bedmanagement");
  await expect(page.getByRole("link", { name: "Lista de Pacientes" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("link", { name: "Gestión de las camas" })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Admitido/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Hospitalización" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Buscar paciente" })).toBeVisible();
  await expect(page.getByText("Paciente Sintético")).toBeVisible();
  await page.getByRole("textbox", { name: "Buscar paciente" }).fill("sin coincidencia");
  await expect(page.getByText("Sin pacientes encontrados")).toBeVisible();
  await page.getByRole("textbox", { name: "Buscar paciente" }).fill("");
  await page.getByRole("link", { name: "Gestión de las camas" }).click();
  await expect(page.getByRole("link", { name: "Gestión de las camas" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("Modo administrativo")).toBeVisible();
  await expect(page.getByRole("button", { name: /A-1 Disponible/ })).toBeVisible();
  await expect(page.locator(".ipd-bed svg")).toHaveCount(4);
  await expect(page.locator(".ipd-bed .pi-building")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /A-2 Ocupada/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /A-2 Ocupada, Paciente Ocupante/ })).toContainText("Paciente Ocupante");
  await expect(page.getByRole("button", { name: /A-3 Reservada/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /A-4 Bloqueada/ })).toBeVisible();
  const widths = await page.evaluate(() => {
    const roomTabs = document.querySelector<HTMLElement>(".ipd-room-tabs");
    const grid = document.querySelector<HTMLElement>(".ipd-grid");
    return {
      page: [document.documentElement.scrollWidth, document.documentElement.clientWidth],
      rooms: [roomTabs?.scrollWidth ?? 0, roomTabs?.clientWidth ?? 0],
      beds: [grid?.scrollWidth ?? 0, grid?.clientWidth ?? 0],
    };
  });
  expect(widths.page[0]).toBeLessThanOrEqual(widths.page[1] + 1);
  expect(widths.rooms[0]).toBeLessThanOrEqual(widths.rooms[1] + 1);
  expect(widths.beds[0]).toBeLessThanOrEqual(widths.beds[1] + 1);
  const sharedRoomBedWidth = (await page.getByRole("button", { name: /A-1 Disponible/ }).boundingBox())?.width;
  await page.getByRole("tab", { name: /Sala 2/ }).click();
  const singleRoomBed = page.getByRole("button", { name: /B-1 Disponible/ });
  await expect(singleRoomBed).toBeVisible();
  const singleRoomBedWidth = (await singleRoomBed.boundingBox())?.width;
  expect(sharedRoomBedWidth).toBeDefined();
  expect(singleRoomBedWidth).toBeDefined();
  expect(Math.abs(singleRoomBedWidth! - sharedRoomBedWidth!)).toBeLessThanOrEqual(1);
  const result = await new AxeBuilder({ page }).include("main").analyze();
  expect(result.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? ""))).toEqual([]);
  expect(await page.locator("script[src*='angular'],script[src*='/ipd/']").count()).toBe(0);
});

test("renders the configured IPD dashboard with translated typed controls", async ({ page, context }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await context.addCookies([{ name: "bahmni.locale", value: "es_CL", domain: "localhost", path: "/" }]);
  await page.unroute("**/bahmni_config/openmrs/apps/ipd/app.json");
  await page.route("**/bahmni_config/openmrs/apps/ipd/app.json", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ config: { dashboard: {
    translationKey: "DASHBOARD_TAB_GENERAL_KEY",
    sections: {
      patient: { type: "patientInformation", translationKey: "DASHBOARD_TITLE_PATIENT_INFORMATION_KEY", displayOrder: 0 },
      links: { type: "navigationLinksControl", translationKey: "DASHBOARD_TITLE_NAVIGATION_LINKS_CONTROL_KEY", displayOrder: 1, showLinks: ["home", "registration"], customLinks: [{ name: "bedManagement", translationKey: "PATIENT_BED_MANAGEMENT_PAGE_KEY", url: "../bedmanagement/#/bedManagement/patient/{{patientUuid}}" }] },
      vitals: { type: "vitals", translationKey: "DASHBOARD_VITAL_FORM_KEY", displayOrder: 2, dashboardConfig: { conceptNames: ["Temperature"] } },
      admission: { type: "admissionDetails", translationKey: "DASHBOARD_TITLE_ADMISSION_DETAILS_KEY", displayOrder: 3 },
    },
  } } }) }));
  const translations = {
    DASHBOARD_TAB_GENERAL_KEY: "General",
    DASHBOARD_TITLE_PATIENT_INFORMATION_KEY: "Información del paciente",
    DASHBOARD_TITLE_NAVIGATION_LINKS_CONTROL_KEY: "Enlaces de navegación",
    DASHBOARD_VITAL_FORM_KEY: "Formulario Signos vitales",
    DASHBOARD_TITLE_ADMISSION_DETAILS_KEY: "Detalles de admisión",
    PATIENT_BED_MANAGEMENT_PAGE_KEY: "Gestión de cama",
  };
  await page.route("**/bahmni_config/openmrs/i18n/ipd/locale_es.json", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify(translations) }));
  await page.route("**/bahmni_config/openmrs/i18n/ipd/locale_es_CL.json", (route) => route.fulfill({ status: 404 }));
  await page.route("**/openmrs/ws/rest/v1/patientprofile/patient**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ patient: { identifiers: [{ identifier: "SYN-1" }], person: { names: [{ display: "Paciente Sintético" }], age: 30, gender: "F", addresses: [] } } }) }));
  await page.route("**/openmrs/ws/rest/v1/beds?**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: [{ bedId: 1, bedUuid: "bed", bedNumber: "O-S-1-1", status: "OCCUPIED", physicalLocation: { name: "O-SALA-1", parentLocation: { name: "ONCO" } }, patients: [{ uuid: "patient" }] }] }) }));
  await page.route("**/openmrs/ws/rest/v1/visit**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: [{ uuid: "visit", startDatetime: "2026-08-05T10:00:00.000-04:00", stopDatetime: null, visitType: { display: "IPD" } }] }) }));
  await page.route("**/openmrs/ws/rest/v1/bahmnicore/visit/summary**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ admissionDetails: { date: "2026-08-05T10:00:00.000-04:00", provider: "Super Man", notes: "Ingreso confirmado" } }) }));
  await page.route("**/openmrs/ws/rest/v1/bahmnicore/observations**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify([{ uuid: "obs", concept: { name: "Temperature", units: "°C" }, value: 37, observationDateTime: "2026-08-05T11:00:00.000-04:00" }]) }));

  await page.goto("/bahmni/bedmanagement/patient/patient/visit/visit/dashboard");

  await expect(page.getByRole("heading", { name: "Información del paciente" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Enlaces de navegación" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Formulario Signos vitales" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Detalles de admisión" })).toBeVisible();
  await expect(page.getByText("Paciente Sintético").first()).toBeVisible();
  await expect(page.getByText("Temperature")).toBeVisible();
  await expect(page.getByText("37")).toBeVisible();
  const admissionCard = page.locator('[data-control-type="admissionDetails"]');
  await expect(admissionCard.getByText("ONCO", { exact: true })).toBeVisible();
  await expect(admissionCard.getByText("O-S-1-1", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Gestión de cama" })).toHaveAttribute("href", "/bahmni/bedmanagement/patient/patient?visitUuid=visit");
  await expect(page.getByText(/DASHBOARD_.*_KEY/)).toHaveCount(0);
  await expect(page.getByText("[object Object]")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  const accessibility = await new AxeBuilder({ page }).include("main").analyze();
  expect(accessibility.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? ""))).toEqual([]);
  expect(await page.locator("script[src*='angular'],script[src*='/ipd/']").count()).toBe(0);
});

test("keeps the legacy administrative mode when a bed is selected without a patient", async ({ page }) => {
  const bed = { bedId: 7, bedUuid: "bed-7", bedNumber: "ADM-7", status: "AVAILABLE", rowNumber: 1, columnNumber: 1, location: "Sala administrativa", patients: [], bedTagMaps: [], physicalLocation: { name: "Sala administrativa", parentLocation: { uuid: "ward", name: "Medicina" } } };
  await page.route("**/openmrs/ws/rest/v1/admissionLocation/", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: [{ ward: { uuid: "ward", name: "Medicina" } }] }) }));
  await page.route("**/openmrs/ws/rest/v1/admissionLocation/ward**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ ward: { uuid: "ward", name: "Medicina" }, bedLayouts: [bed] }) }));
  await page.route("**/openmrs/ws/rest/v1/beds/7**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify(bed) }));

  await page.goto("/bahmni/bedmanagement/manage");
  await expect(page.getByRole("link", { name: "Gestión de las camas" })).toHaveAttribute("aria-current", "page");
  await page.getByRole("button", { name: "ADM-7 Disponible" }).click();
  await expect(page).toHaveURL(/\/bedmanagement\/bed\/7$/);
  await expect(page.getByRole("link", { name: "Gestión de las camas" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("Modo administrativo")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Estado de cama" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Editar tags" })).toBeVisible();
});

test("confirms an administrative status change from the ward layout even when the individual bed read is stale", async ({ page }) => {
  let wardStatus: "AVAILABLE" | "RESERVED" = "AVAILABLE";
  let statusPayload: Record<string, unknown> | undefined;
  const staleBed = { bedId: 7, bedUuid: "bed-7", bedNumber: "ADM-7", status: "AVAILABLE", rowNumber: 1, columnNumber: 1, location: "Sala administrativa", patients: [], bedTagMaps: [], physicalLocation: { name: "Sala administrativa", parentLocation: { uuid: "ward", name: "Medicina" } } };
  const wardBed = () => ({ ...staleBed, status: wardStatus });
  await page.route("**/openmrs/ws/rest/v1/admissionLocation/", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: [{ ward: { uuid: "ward", name: "Medicina" } }] }) }));
  await page.route("**/openmrs/ws/rest/v1/admissionLocation/ward**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ ward: { uuid: "ward", name: "Medicina" }, bedLayouts: [wardBed()] }) }));
  await page.route("**/openmrs/ws/rest/v1/beds/7**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify(staleBed) }));
  await page.route("**/openmrs/ws/rest/v1/bed/bed-7", (route) => {
    statusPayload = route.request().postDataJSON() as Record<string, unknown>;
    wardStatus = String(statusPayload.status) as "RESERVED";
    return route.fulfill({ status: 204 });
  });

  await page.goto("/bahmni/bedmanagement/bed/7");
  const status = page.getByRole("textbox", { name: "Estado de cama" });
  await expect(status).toHaveValue("Disponible");
  await page.locator('.p-dropdown:has(input[aria-label="Estado de cama"])').click();
  await page.getByRole("option", { name: "Reservada" }).click();

  await expect(page.getByText("Estado de cama actualizado.")).toBeVisible();
  await expect(status).toHaveValue("Reservada");
  await expect(page.getByText("Reservada", { exact: true }).first()).toBeVisible();
  expect(statusPayload).toEqual({ status: "RESERVED" });
});

test("re-reads an AVAILABLE bed, creates the legacy admission encounter and confirms assignment", async ({ page }) => {
  let assigned = false;
  let encounterPayload: Record<string, unknown> | undefined;
  await page.route("**/openmrs/ws/rest/v1/admissionLocation/", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: [{ ward: { uuid: "ward", name: "Medicina" } }] }) }));
  const bed = () => ({ bedId: 1, bedUuid: "bed", bedNumber: "A-1", status: assigned ? "OCCUPIED" : "AVAILABLE", rowNumber: 1, columnNumber: 1, location: "Sala 1", patients: assigned ? [{ uuid: "patient", display: "Paciente Sintético" }] : [], bedTagMaps: [], physicalLocation: { name: "Sala 1", parentLocation: { uuid: "ward", name: "Medicina" } } });
  await page.route("**/openmrs/ws/rest/v1/admissionLocation/ward**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ ward: { uuid: "ward", name: "Medicina" }, bedLayouts: [bed()] }) }));
  await page.route("**/openmrs/ws/rest/v1/beds/1**", async (route) => {
    if (route.request().method() === "POST") { assigned = true; return route.fulfill({ contentType: "application/json", body: "{}" }); }
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ bedId: 1, bedUuid: "bed", bedNumber: "A-1", patients: assigned ? [{ uuid: "patient" }] : [] }) });
  });
  await page.route("**/openmrs/ws/rest/v1/beds?**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: assigned ? [bed()] : [] }) }));
  await page.route("**/openmrs/ws/rest/v1/patientprofile/patient**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ patient: { identifier: "SYN-1", person: { display: "Paciente Sintético", age: 30, gender: "F" } } }) }));
  await page.route("**/openmrs/ws/rest/v1/visit**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: [] }) }));
  await page.route("**/openmrs/ws/rest/v1/bahmnicore/config/bahmniencounter**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ encounterTypes: { ADMISSION: "admission", TRANSFER: "transfer", DISCHARGE: "discharge" }, visitTypes: { IPD: "ipd" } }) }));
  await page.route("**/openmrs/ws/rest/v1/bahmnicore/bahmniencounter", (route) => { encounterPayload = route.request().postDataJSON() as Record<string, unknown>; return route.fulfill({ contentType: "application/json", body: JSON.stringify({ patientUuid: "patient", encounterUuid: "encounter", visitUuid: "visit" }) }); });
  await page.goto("/bahmni/bedmanagement/patient/patient");
  await expect(page.locator("main > h1")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Lista de Pacientes" })).toHaveAttribute("aria-current", "page");
  await page.getByRole("button", { name: /A-1 Disponible/ }).click();
  await expect(page).toHaveURL(/\/bedmanagement\/patient\/patient$/);
  await page.getByRole("button", { name: "Admitir", exact: true }).click();
  await page.getByRole("button", { name: "Confirmar" }).click();
  await expect(page.getByText("Paciente admitido y cama confirmada.")).toBeVisible();
  expect(encounterPayload).toEqual({ patientUuid: "patient", locationUuid: "location", encounterTypeUuid: "admission", visitTypeUuid: "ipd", providers: [{ uuid: "provider" }], observations: [] });
});

test("transfers an admitted patient using the legacy empty-patients preflight and refreshes both beds", async ({ page }) => {
  let destinationAssigned = false;
  let encounterPayload: Record<string, unknown> | undefined;
  let assignmentPayload: Record<string, unknown> | undefined;
  const source = () => ({ bedId: 1, bedUuid: "bed-1", bedNumber: "A-1", status: destinationAssigned ? "AVAILABLE" : "OCCUPIED", rowNumber: 1, columnNumber: 1, location: "Sala 1", patients: destinationAssigned ? [] : [{ uuid: "patient", display: "Paciente Sintético" }], bedTagMaps: [], physicalLocation: { name: "Sala 1", parentLocation: { uuid: "ward", name: "Medicina" } } });
  const destination = () => ({ bedId: 2, bedUuid: "bed-2", bedNumber: "B-1", status: destinationAssigned ? "OCCUPIED" : "AVAILABLE", rowNumber: 1, columnNumber: 1, location: "Sala 2", patients: destinationAssigned ? [{ uuid: "patient", display: "Paciente Sintético" }] : [], bedTagMaps: [], physicalLocation: { name: "Sala 2", parentLocation: { uuid: "ward", name: "Medicina" } } });
  await page.route("**/openmrs/ws/rest/v1/admissionLocation/", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: [{ ward: { uuid: "ward", name: "Medicina" } }] }) }));
  await page.route("**/openmrs/ws/rest/v1/admissionLocation/ward**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ ward: { uuid: "ward", name: "Medicina" }, bedLayouts: [source(), destination()] }) }));
  await page.route("**/openmrs/ws/rest/v1/beds?**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: [destinationAssigned ? destination() : source()] }) }));
  await page.route("**/openmrs/ws/rest/v1/beds/2**", (route) => {
    if (route.request().method() === "POST") {
      assignmentPayload = route.request().postDataJSON() as Record<string, unknown>;
      destinationAssigned = true;
      return route.fulfill({ contentType: "application/json", body: "{}" });
    }
    // This is the real legacy conflict contract: no operational status is required.
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ bedId: 2, bedUuid: "bed-2", bedNumber: "B-1", patients: [] }) });
  });
  await page.route("**/openmrs/ws/rest/v1/patientprofile/patient**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ patient: { identifier: "SYN-1", person: { display: "Paciente Sintético", age: 30, gender: "F" } } }) }));
  await page.route("**/openmrs/ws/rest/v1/visit**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: [{ uuid: "visit", startDatetime: "2026-08-07T10:00:00.000-0400", stopDatetime: null, visitType: { uuid: "ipd", display: "IPD" } }] }) }));
  await page.route("**/openmrs/ws/rest/v1/bahmnicore/config/bahmniencounter**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ encounterTypes: { ADMISSION: "admission", TRANSFER: "transfer", DISCHARGE: "discharge" }, visitTypes: { IPD: "ipd" } }) }));
  await page.route("**/openmrs/ws/rest/v1/bahmnicore/bahmniencounter", (route) => {
    encounterPayload = route.request().postDataJSON() as Record<string, unknown>;
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ patientUuid: "patient", encounterUuid: "transfer-encounter", visitUuid: "visit" }) });
  });

  await page.goto("/bahmni/bedmanagement/patient/patient");
  await page.getByRole("tab", { name: /Sala 2/ }).click();
  await page.getByRole("button", { name: /B-1 Disponible/ }).click();
  await page.getByRole("button", { name: "Transferir" }).click();
  await page.getByRole("button", { name: "Confirmar" }).click();

  await expect(page.getByText("Transferencia confirmada.")).toBeVisible();
  await expect(page.locator(".p-toast-message-success")).toContainText("Transferencia confirmada.");
  await expect(page.locator(".success-banner")).toHaveCount(0);
  await expect(page.getByText("B-1", { exact: true }).first()).toBeVisible();
  expect(encounterPayload).toEqual({ patientUuid: "patient", locationUuid: "location", encounterTypeUuid: "transfer", visitTypeUuid: "ipd", providers: [{ uuid: "provider" }], observations: [] });
  expect(assignmentPayload).toEqual({ patientUuid: "patient", encounterUuid: "transfer-encounter" });
});

test("does not create an encounter when another user occupied the transfer destination", async ({ page }) => {
  let encounterRequests = 0;
  const source = { bedId: 1, bedUuid: "bed-1", bedNumber: "A-1", status: "OCCUPIED", rowNumber: 1, columnNumber: 1, location: "Sala 1", patients: [{ uuid: "patient" }], bedTagMaps: [], physicalLocation: { name: "Sala 1", parentLocation: { uuid: "ward", name: "Medicina" } } };
  const destination = { bedId: 2, bedUuid: "bed-2", bedNumber: "B-1", status: "AVAILABLE", rowNumber: 1, columnNumber: 1, location: "Sala 2", patients: [], bedTagMaps: [], physicalLocation: { name: "Sala 2", parentLocation: { uuid: "ward", name: "Medicina" } } };
  await page.route("**/openmrs/ws/rest/v1/admissionLocation/", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: [{ ward: { uuid: "ward", name: "Medicina" } }] }) }));
  await page.route("**/openmrs/ws/rest/v1/admissionLocation/ward**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ ward: { uuid: "ward", name: "Medicina" }, bedLayouts: [source, destination] }) }));
  await page.route("**/openmrs/ws/rest/v1/beds?**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: [source] }) }));
  await page.route("**/openmrs/ws/rest/v1/beds/2**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ bedId: 2, patients: [{ uuid: "other-patient" }] }) }));
  await page.route("**/openmrs/ws/rest/v1/patientprofile/patient**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ patient: { identifier: "SYN-1", person: { display: "Paciente Sintético" } } }) }));
  await page.route("**/openmrs/ws/rest/v1/visit**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: [{ uuid: "visit", startDatetime: "2026-08-07T10:00:00.000-0400", stopDatetime: null, visitType: { uuid: "ipd", display: "IPD" } }] }) }));
  await page.route("**/openmrs/ws/rest/v1/bahmnicore/config/bahmniencounter**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ encounterTypes: { ADMISSION: "admission", TRANSFER: "transfer", DISCHARGE: "discharge" }, visitTypes: { IPD: "ipd" } }) }));
  await page.route("**/openmrs/ws/rest/v1/bahmnicore/bahmniencounter", (route) => { encounterRequests += 1; return route.fulfill({ contentType: "application/json", body: "{}" }); });

  await page.goto("/bahmni/bedmanagement/patient/patient");
  await page.getByRole("tab", { name: /Sala 2/ }).click();
  await page.getByRole("button", { name: /B-1 Disponible/ }).click();
  await page.getByRole("button", { name: "Transferir" }).click();
  await page.getByRole("button", { name: "Confirmar" }).click();
  await expect(page.getByText("La cama destino fue asignada a otro paciente. Se recargó el mapa.")).toBeVisible();
  expect(encounterRequests).toBe(0);
});

test("discharges an admitted patient with the legacy payload and confirms that the bed was released", async ({ page }) => {
  let assigned = true;
  let dischargePayload: Record<string, unknown> | undefined;
  const bed = () => ({ bedId: 1, bedUuid: "bed-1", bedNumber: "A-1", status: assigned ? "OCCUPIED" : "AVAILABLE", rowNumber: 1, columnNumber: 1, location: "Sala 1", patients: assigned ? [{ uuid: "patient", display: "Paciente Sintético" }] : [], bedTagMaps: [], physicalLocation: { name: "Sala 1", parentLocation: { uuid: "ward", name: "Medicina" } } });
  await page.route("**/openmrs/ws/rest/v1/admissionLocation/", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: [{ ward: { uuid: "ward", name: "Medicina" } }] }) }));
  await page.route("**/openmrs/ws/rest/v1/admissionLocation/ward**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ ward: { uuid: "ward", name: "Medicina" }, bedLayouts: [bed()] }) }));
  await page.route("**/openmrs/ws/rest/v1/beds?**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: assigned ? [bed()] : [] }) }));
  await page.route("**/openmrs/ws/rest/v1/patientprofile/patient**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ patient: { identifier: "SYN-1", person: { display: "Paciente Sintético", age: 30, gender: "F" } } }) }));
  await page.route("**/openmrs/ws/rest/v1/visit**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: [{ uuid: "visit", startDatetime: "2026-08-07T10:00:00.000-0400", stopDatetime: null, visitType: { uuid: "ipd", display: "IPD" } }] }) }));
  await page.route("**/openmrs/ws/rest/v1/bahmnicore/config/bahmniencounter**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ encounterTypes: { ADMISSION: "admission", TRANSFER: "transfer", DISCHARGE: "discharge" }, visitTypes: { IPD: "ipd" } }) }));
  await page.route("**/openmrs/ws/rest/v1/bahmnicore/discharge", (route) => {
    dischargePayload = route.request().postDataJSON() as Record<string, unknown>;
    assigned = false;
    return route.fulfill({ contentType: "application/json", body: "{}" });
  });

  await page.goto("/bahmni/bedmanagement/patient/patient");
  await page.getByRole("button", { name: "Dar de alta" }).click();
  await page.getByRole("button", { name: "Confirmar" }).click();

  await expect(page.getByText("Alta confirmada y cama liberada.")).toBeVisible();
  expect(dischargePayload).toEqual({ patientUuid: "patient", locationUuid: "location", encounterTypeUuid: "discharge", providers: [{ uuid: "provider" }], observations: [] });
});

test("renders the native Care View workflow and confirms a current-shift care-team assignment", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  let assigned = false;
  let careTeamPayload: Record<string, unknown> | undefined;
  let careSearchKeys: string[] = [];
  await page.route("**/bahmni_config/openmrs/apps/careViewDashboard/app.json", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ pageSizeOptions: [10, 20], defaultPageSize: 10, timeframeLimitInHours: 2 }) }));
  await page.route("**/implementation_config/openmrs/apps/careViewDashboard/app.json", (route) => route.fulfill({ status: 404 }));
  await page.route("**/bahmni_config/openmrs/apps/ipdDashboard/app.json", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({
    enable24HourTime: true,
    shiftDetails: { "1": { shiftStartTime: "00:00", shiftEndTime: "23:59" } },
    nursingTasks: { timeInMinutesFromNowToShowTaskAsRelevant: 30, timeInMinutesFromNowToShowPastTaskAsLate: 60, timeInMinutesFromStartTimeToShowAdministeredTaskAsLate: 60 },
    drugChart: { timeInMinutesFromNowToShowPastTaskAsLate: 60, timeInMinutesFromStartTimeToShowAdministeredTaskAsLate: 60 },
  }) }));
  await page.route("**/implementation_config/openmrs/apps/ipdDashboard/app.json", (route) => route.fulfill({ status: 404 }));
  await page.route("**/openmrs/ws/rest/v1/admissionLocation/", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: [{ ward: { uuid: "ward", name: "Medicina" } }] }) }));
  await page.route("**/openmrs/ws/rest/v1/ipd/wards/ward/summary**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ totalPatients: 1, myPatients: assigned ? 1 : 0 }) }));
  await page.route("**/openmrs/ws/rest/v1/ipd/wards/ward/patients?**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ admittedPatients: [{
    patientDetails: { uuid: "patient", display: "Paciente Sintético", identifier: "SYN-1", person: { gender: "F", age: 30 } },
    visitDetails: { uuid: "visit" },
    bedDetails: { bedNumber: "M-1" },
    newTreatments: [{ uuid: "treatment" }],
    careTeamDetails: { participants: assigned ? [{ uuid: "participant", providerUuid: "provider", providerName: "Super Man" }] : [] },
  }], totalPatients: 1 }) }));
  await page.route("**/openmrs/ws/rest/v1/ipd/wards/ward/patients/search?**", (route) => {
    const url = new URL(route.request().url());
    careSearchKeys = url.searchParams.getAll("searchKeys");
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ admittedPatients: [{
      patientUuid: "patient",
      visitUuid: "visit",
      patientName: "Paciente Sintetico",
      patientIdentifier: "SYN-1",
      bedNumber: "M-1",
      gender: "F",
      age: 30,
      hasNewTreatments: true,
      careTeamParticipants: assigned ? [{ uuid: "participant", providerUuid: "provider", providerName: "Super Man" }] : [],
    }], totalPatients: 1 }) });
  });
  await page.route("**/openmrs/ws/rest/v1/ipd/schedule/type/medication/patientsMedicationSummary?**", (route) => {
    const url = new URL(route.request().url());
    const start = Number(url.searchParams.get("startTime")) * 1000;
    return route.fulfill({ contentType: "application/json", body: JSON.stringify([{ patientUuid: "patient", tasks: [{ uuid: "medication", drugName: "Paracetamol", startTime: start + 600_000, status: "REQUESTED", dose: 1, doseUnit: "Comprimido", route: "Oral" }] }]) });
  });
  await page.route("**/openmrs/ws/rest/v1/tasks?**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify([]) }));
  await page.route("**/openmrs/ws/rest/v1/ipd/careteam/participants", (route) => {
    careTeamPayload = route.request().postDataJSON() as Record<string, unknown>;
    assigned = true;
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ uuid: "participant" }) });
  });

  await page.goto("/bahmni/bedmanagement/care-view");

  await expect(page.getByRole("heading", { name: "Vista de cuidados" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Vista de cuidados" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("link", { name: "Lista de Pacientes" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Gestión de las camas" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Volver al mapa" })).toHaveCount(0);
  await expect(page.getByText("Paciente Sintético")).toBeVisible();
  await expect(page.getByText("Paracetamol")).toBeVisible();
  await expect(page.getByText("Tratamientos nuevos")).toBeVisible();
  await page.getByRole("textbox", { name: "Buscar paciente" }).fill("SYN");
  await page.getByRole("textbox", { name: "Buscar paciente" }).press("Enter");
  await expect(page.getByText("Paciente Sintetico")).toBeVisible();
  expect(careSearchKeys).toEqual(["bedNumber", "patientIdentifier", "patientName"]);
  await page.getByRole("button", { name: "Asignarme" }).click();
  await expect(page.locator(".p-toast-message-success")).toContainText("Paciente asignado para el turno vigente.");
  expect(careTeamPayload).toMatchObject({ patientUuid: "patient", careTeamParticipantsRequest: [{ providerUuid: "provider" }] });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  // PrimeReact fades the Toast in; inspect accessibility after its temporary
  // opacity no longer alters the effective contrast reported by Axe.
  await page.waitForTimeout(500);
  const accessibility = await new AxeBuilder({ page }).include("main").analyze();
  expect(accessibility.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? ""))).toEqual([]);
  expect(await page.locator("script[src*='angular'],script[src*='/ipd/']").count()).toBe(0);
});

test("adds a prescribed treatment to the drug chart with the legacy IPD contract", async ({ page }) => {
  await page.unroute("**/openmrs/ws/rest/v1/user**");
  await page.route("**/openmrs/ws/rest/v1/user**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: [{ uuid: "user", username: "superman", display: "superman", privileges: ["app:adt", "Edit Medication Tasks"].map((name) => ({ uuid: name, name })), roles: [] }] }) }));
  await page.route("**/bahmni_config/openmrs/apps/ipdDashboard/app.json", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({
    config: {
      enable24HourTimers: true,
      drugChartStartTimeFrequencies: ["Every 8 hours"],
      drugChartScheduleFrequencies: [{ name: "Twice a day", frequencyPerDay: 2, scheduleTiming: ["06:00", "18:00"] }],
    },
    sections: [{ title: "Treatments", componentKey: "TR", displayOrder: 1 }, { title: "Drug Chart", componentKey: "DC", displayOrder: 2 }],
    shiftDetails: { "1": { shiftStartTime: "00:00", shiftEndTime: "23:59" } },
    nursingTasks: { timeInMinutesFromNowToShowPastTaskAsLate: 60, timeInMinutesFromStartTimeToShowAdministeredTaskAsLate: 60 },
    drugChart: { timeInMinutesFromNowToShowPastTaskAsLate: 60, timeInMinutesFromStartTimeToShowAdministeredTaskAsLate: 60 },
    drugChartSlider: { timeInMinutesToDisableSlotPostScheduledTime: 60 },
  }) }));
  await page.route("**/implementation_config/openmrs/apps/ipdDashboard/app.json", (route) => route.fulfill({ status: 404 }));
  await page.route("**/openmrs/ws/rest/v1/patientprofile/patient**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ patient: { identifiers: [{ identifier: "SYN-1", preferred: true }], person: { names: [{ display: "Paciente Sintético" }], age: 30, gender: "F", addresses: [] } } }) }));
  await page.route("**/openmrs/ws/rest/v1/beds?**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: [{ bedId: 1, bedUuid: "bed", bedNumber: "M-1", status: "OCCUPIED", physicalLocation: { name: "Sala 1", parentLocation: { uuid: "ward", name: "Medicina" } }, patients: [{ uuid: "patient" }] }] }) }));
  await page.route("**/openmrs/ws/rest/v1/visit**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: [{ uuid: "visit", startDatetime: "2026-08-04T10:00:00.000-04:00", stopDatetime: null, visitType: { display: "IPD" } }] }) }));
  await page.route("**/openmrs/ws/rest/v1/bahmnicore/visit/summary**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ admissionDetails: { date: "2026-08-04T10:00:00.000-04:00", provider: "Super Man" } }) }));
  let scheduled = false;
  await page.route("**/openmrs/ws/rest/v1/ipdVisit/visit/medication?**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ ipdDrugOrders: [{
    drugOrder: {
      uuid: "order-1", effectiveStartDate: "2026-08-04T12:00:00.000-04:00", scheduledDate: "2026-08-04T12:00:00.000-04:00", dateActivated: "2026-08-04T12:00:00.000-04:00",
      visit: { uuid: "visit", startDateTime: "2026-08-04T10:00:00.000-04:00" }, drug: { display: "Paracetamol 500 mg" }, duration: 20, durationUnits: "Days",
      dosingInstructions: { dose: 1, doseUnits: "Comprimido", quantity: 20, quantityUnits: "Comprimido", route: "Oral", frequency: "Twice a day", administrationInstructions: JSON.stringify({ instructions: "As directed", additionalInstructions: "Con agua" }) },
    },
    provider: { uuid: "provider", name: "Super Man" },
    ...(scheduled ? { drugOrderSchedule: { firstDaySlotsStartTime: [1785895200], dayWiseSlotsStartTime: [1785895200, 1785938400], remainingDaySlotsStartTime: [], medicationAdministrationStarted: false, pendingSlotsAvailable: true, allSlotsAttended: false } } : {}),
  }, ...(scheduled ? [{
    drugOrder: {
      uuid: "order-2", effectiveStartDate: "2026-08-04T12:00:00.000-04:00", scheduledDate: "2026-08-04T12:00:00.000-04:00",
      visit: { uuid: "visit" }, drug: { display: "Ibuprofeno 400 mg" }, duration: 5, durationUnits: "Days",
      dosingInstructions: { dose: 1, doseUnits: "Comprimido", route: "Oral", frequency: "Four times a day" },
    },
    provider: { uuid: "provider", name: "Super Man" },
    drugOrderSchedule: { firstDaySlotsStartTime: [1785895200], dayWiseSlotsStartTime: [1785852000, 1785873600, 1785895200, 1785915900], remainingDaySlotsStartTime: [], medicationAdministrationStarted: false, pendingSlotsAvailable: false, allSlotsAttended: true },
  }] : [])], emergencyMedications: [] }) }));
  await page.route("**/openmrs/ws/rest/v1/ipd/schedule/type/medication?**", (route) => {
    const url = new URL(route.request().url());
    const start = Number(url.searchParams.get("startTime"));
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(scheduled ? [{ slots: [{
      uuid: "slot-1", startTime: start + 18 * 60 * 60, status: "SCHEDULED",
      order: { uuid: "order-1", drug: { display: "Paracetamol 500 mg" }, dose: 1, doseUnits: { display: "Comprimido" }, route: { display: "Oral" } },
    }] }] : []) });
  });
  let schedulePayload: Record<string, unknown> | undefined;
  await page.route("**/openmrs/ws/rest/v1/ipd/schedule/type/medication", (route) => {
    schedulePayload = route.request().postDataJSON() as Record<string, unknown>;
    scheduled = true;
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ uuid: "schedule" }) });
  });
  await page.route("**/openmrs/ws/rest/v1/auditlog", (route) => route.fulfill({ contentType: "application/json", body: "{}" }));
  await page.route("**/openmrs/ws/rest/v1/bahmnicore/sql/globalproperty**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify("") }));

  await page.goto("/bahmni/clinical/patient/patient/dashboard/visit/ipd/visit?source=careViewDashboard");
  const add = page.getByRole("button", { name: "Programar" });
  await expect(add).toBeVisible();
  await add.click();
  await expect(page.getByRole("dialog", { name: "Añadir al gráfico de medicamentos" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Medicamento" })).toHaveValue("Paracetamol 500 mg");
  await expect(page.getByRole("textbox", { name: "Indicación", exact: true })).toHaveValue("As directed");
  await expect(page.getByRole("textbox", { name: "Indicación adicional" })).toHaveValue("Con agua");
  await expect(page.locator('input[type="time"]')).toHaveCount(0);
  expect(await page.locator(".p-calendar").count()).toBeGreaterThanOrEqual(4);
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByRole("dialog", { name: "Añadir al gráfico de medicamentos" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Editar" }).first()).toBeVisible();
  await expect(page.locator(".ipd-drug-chart tbody")).toContainText("Paracetamol 500 mg");
  await expect(page.locator(".ipd-drug-chart tbody")).toContainText("Ibuprofeno 400 mg");
  await expect(page.locator(".ipd-drug-chart-no-slots")).toContainText("Sin dosis en el turno visible");
  await expect(page.locator(".ipd-drug-chart thead time")).toHaveCount(48);
  expect(schedulePayload).toMatchObject({
    patientUuid: "patient", providerUuid: "provider", orderUuid: "order-1", serviceType: "MEDICATION_REQUEST", medicationFrequency: "FIXED_SCHEDULE_FREQUENCY",
  });
  expect(Array.isArray(schedulePayload?.dayWiseSlotsStartTime)).toBe(true);
  expect((schedulePayload?.dayWiseSlotsStartTime as number[]).every((value) => Number.isInteger(value) && value < 10_000_000_000)).toBe(true);
});
