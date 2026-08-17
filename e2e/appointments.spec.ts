import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const config = {
  config: {
    allowVirtualConsultation: true, enableAppointmentRequests: false, minCharLengthToTriggerPatientSearch: 3, enableSpecialities: true, maxAppointmentProviders: 4,
    startOfWeek: "Monday", calendarSlotDuration: "00:30", calendarSlotLabelInterval: "01:00", startOfDay: "09:00", endOfDay: "19:00",
    enableServiceTypes: false, enableCalendarView: true, isServiceOnAppointmentEditable: false, enableResetAppointmentStatuses: ["CheckedIn"],
    colorsForAppointmentService: ["#006400"], allowedActions: ["CheckedIn", "Completed", "Missed", "Cancelled"],
    allowedActionsByStatus: { Scheduled: ["CheckedIn", "Missed", "Cancelled"] }, colorsForListView: {}, recurrence: { defaultNumberOfOccurrences: 10 },
    additionalInfoColumns: {}, enableAppointmentStatusOption: true, enableDetailedSummaryView: true,
  },
};

test.beforeEach(async ({ page }) => {
  await page.route("**/openmrs/ws/rest/v1/session**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ authenticated: true, user: { uuid: "user-1", display: "Agenda HCSBA" }, sessionLocation: { uuid: "location-1", display: "Consultas" } }) }));
  await page.route("**/openmrs/ws/rest/v1/user**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: [{ uuid: "user-1", username: "agenda", display: "Agenda HCSBA", privileges: [{ name: "app:appointments" }, { name: "app:appointments:manageAppointmentsTab" }, { name: "app:admin" }, { name: "Reset Appointment Status" }], roles: [], userProperties: { defaultLocale: "es" } }] }) }));
  await page.route("**/openmrs/ws/rest/v1/provider**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: [{ uuid: "provider-1", display: "Dra. Soto", retired: false, attributes: [{ voided: false, value: true, attributeType: { uuid: "available-for-appointments", display: "Available for appointments" } }] }] }) }));
  await page.route("**/openmrs/ws/rest/v1/location**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: [{ uuid: "location-1", display: "Consultas" }] }) }));
  await page.route("**/bahmni_config/openmrs/apps/appointments/app.json", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify(config) }));
  await page.route("**/implementation_config/openmrs/apps/appointments/app.json", (route) => route.fulfill({ status: 404 }));
  await page.route("**/openmrs/ws/rest/v1/appointmentService/all/default", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify([{ uuid: "service-1", name: "Cardiología", serviceTypes: [], speciality: { uuid: "speciality-1", name: "Medicina" } }]) }));
  await page.route("**/openmrs/ws/rest/v1/appointmentService/all/full", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify([{ uuid: "service-1", name: "Cardiología", description: "Consulta cardiovascular", durationMins: 30, color: "#006400", serviceTypes: [], weeklyAvailability: [], speciality: { uuid: "speciality-1", name: "Medicina" }, location: { uuid: "location-1", name: "Consultas" } }]) }));
  await page.route("**/openmrs/ws/rest/v1/speciality/all", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify([{ uuid: "speciality-1", name: "Medicina" }]) }));
  await page.route("**/openmrs/ws/rest/v1/appointment/all**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify([{ uuid: "appointment-1", patient: { uuid: "patient-1", display: "Ana Pérez", identifier: "HCSBA-1" }, service: { uuid: "service-1", name: "Cardiología", serviceTypes: [] }, providers: [{ uuid: "provider-1", display: "Dra. Soto", response: "ACCEPTED" }], location: { uuid: "location-1", display: "Consultas" }, startDateTime: [2026, 8, 14, 10, 0], endDateTime: [2026, 8, 14, 10, 30], status: "Scheduled", appointmentKind: "Scheduled", teleconsultation: null, additionalInfo: null }]) }));
  await page.route("**/openmrs/ws/rest/v1/appointments/search", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify([{ uuid: "appointment-1", patient: { uuid: "patient-1", display: "Ana Pérez", identifier: "HCSBA-1" }, service: { uuid: "service-1", name: "Cardiología", serviceTypes: [] }, providers: [{ uuid: "provider-1", display: "Dra. Soto", response: "ACCEPTED" }], location: { uuid: "location-1", display: "Consultas" }, startDateTime: [2026, 8, 14, 10, 0], endDateTime: [2026, 8, 14, 10, 30], status: "Scheduled", appointmentKind: "Scheduled", teleconsultation: false, additionalInfo: {} }]) }));
  await page.route("**/openmrs/ws/rest/v1/appointment/appointmentSummary?**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify([{ appointmentService: { uuid: "service-1", name: "Cardiología", serviceTypes: [], weeklyAvailability: [] }, appointmentCountMap: { "2026-08-14": { allAppointmentsCount: 1, missedAppointmentsCount: 0, appointmentServiceUuid: "service-1" } } }]) }));
});

test("calendar renders configured hours, resources and appointment actions", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-08-14T12:00:00-04:00"));
  await page.goto("/bahmni/appointments/calendar");
  await expect(page.getByRole("heading", { name: "Agenda de citas" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Secciones de agenda" })).toBeVisible();
  const administration = page.getByRole("link", { name: /Administración/ });
  await expect(administration).toBeVisible();
  await expect(administration).toHaveAttribute("href", "/bahmni/appointments/admin");
  await expect(administration).toHaveAttribute("accesskey", "a");
  await expect(page.getByText("Dra. Soto", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Ana Pérez/).first()).toBeVisible();
  await page.getByText(/Ana Pérez/).first().click();
  await expect(page.getByRole("dialog")).toContainText("Cardiología");
  await expect(page.getByRole("button", { name: "Editar cita" })).toBeVisible();
  const accessibility = await new AxeBuilder({ page }).include("main").analyze();
  expect(accessibility.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? ""))).toEqual([]);
});

test("native administration lists, edits, creates and deletes appointment services", async ({ page }) => {
  const writes: Array<{ method: string; body?: Record<string, unknown>; url: string }> = [];
  await page.route("**/openmrs/ws/rest/v1/appointmentService?uuid=service-1", (route) => {
    if (route.request().method() === "DELETE") {
      writes.push({ method: "DELETE", url: route.request().url() });
      return route.fulfill({ status: 204 });
    }
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ uuid: "service-1", name: "Cardiología", description: "Consulta cardiovascular", durationMins: 30, color: "#006400", serviceTypes: [], weeklyAvailability: [], speciality: { uuid: "speciality-1", name: "Medicina" }, location: { uuid: "location-1", name: "Consultas" } }) });
  });
  await page.route("**/openmrs/ws/rest/v1/appointmentService", async (route) => {
    const body = JSON.parse(route.request().postData() ?? "{}");
    writes.push({ method: route.request().method(), body, url: route.request().url() });
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ uuid: body.uuid ?? "service-new", ...body, serviceTypes: body.serviceTypes ?? [], weeklyAvailability: body.weeklyAvailability ?? [] }) });
  });

  await page.goto("/bahmni/appointments/admin");
  await expect(page.getByRole("heading", { name: "Servicios" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Cardiología", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Editar Cardiología" }).click();
  await expect(page.getByRole("heading", { name: "Editar servicio" })).toBeVisible();
  await page.locator("#service-description").fill("Consulta actualizada");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page).toHaveURL(/\/bahmni\/appointments\/admin$/);
  expect(writes.find((item) => item.method === "POST")?.body).toMatchObject({ uuid: "service-1", name: "Cardiología", description: "Consulta actualizada" });

  await page.getByRole("link", { name: "Agregar nuevo servicio" }).click();
  await page.locator("#service-name").fill("Neurología");
  await page.locator("#service-location").selectOption("location-1");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page).toHaveURL(/\/bahmni\/appointments\/admin$/);
  expect(writes.filter((item) => item.method === "POST").at(-1)?.body).toMatchObject({ name: "Neurología", locationUuid: "location-1" });

  await page.getByRole("button", { name: "Eliminar Cardiología" }).click();
  await expect(page.getByRole("dialog", { name: "Eliminar servicio" })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Eliminar", exact: true }).click();
  await expect.poll(() => writes.some((item) => item.method === "DELETE")).toBe(true);
});

test("summary reproduces the original weekly grids and opens the filtered list", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-08-14T12:00:00-04:00"));
  await page.goto("/bahmni/appointments/summary");
  await expect(page.getByRole("heading", { name: "Especialidades" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Proveedores" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Servicios" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ubicaciones" })).toBeVisible();
  const servicesTable = page.getByRole("heading", { name: "Servicios" }).locator("xpath=following-sibling::div/table");
  const serviceRow = servicesTable.getByRole("row", { name: /Cardiología/ });
  await expect(serviceRow).toContainText("1");
  await serviceRow.getByRole("button", { name: "1", exact: true }).click();
  await expect(page).toHaveURL(/\/bahmni\/appointments\/list\?/);
  const url = new URL(page.url());
  expect(url.searchParams.get("date")).toBe("2026-08-14");
  expect(url.searchParams.get("services")).toBe("service-1");
  expect(url.searchParams.get("statuses")).toContain("Missed");
});

test("list keeps the selected patient scoped in the backend search", async ({ page }) => {
  let requestBody: Record<string, unknown> = {};
  await page.route("**/openmrs/ws/rest/v1/appointment/search", async (route) => {
    requestBody = JSON.parse(route.request().postData() ?? "{}");
    await route.fulfill({ contentType: "application/json", body: "[]" });
  });
  await page.goto("/bahmni/appointments/list?patientUuid=patient-1");
  await expect(page.getByText("No se encontraron citas para los filtros seleccionados.")).toBeVisible();
  expect(requestBody.patientUuids).toEqual(["patient-1"]);
});

test("list identifier opens the native clinical patient dashboard", async ({ page }) => {
  await page.goto("/bahmni/appointments/list");
  const identifier = page.getByRole("link", { name: "HCSBA-1" });
  await expect(identifier).toHaveAttribute("href", "/bahmni/clinical/patient/patient-1/dashboard");
  await expect(identifier).toHaveAttribute("target", "_blank");
  const popupPromise = page.waitForEvent("popup");
  await identifier.click();
  const clinical = await popupPromise;
  await expect(clinical).toHaveURL(/\/bahmni\/clinical\/patient\/patient-1\/dashboard/);
  await clinical.close();
});

test("new appointment searches and selects a patient with the shared patient finder", async ({ page }) => {
  let searchUrl: URL | undefined;
  let savedAppointment: Record<string, unknown> | undefined;
  await page.route("**/openmrs/ws/rest/v1/bahmni/search/patient/lucene?**", async (route) => {
    searchUrl = new URL(route.request().url());
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ pageOfResults: [{ uuid: "patient-2", identifier: "HCSBA-2", givenName: "María", familyName: "Rojas" }] }) });
  });
  await page.route("**/openmrs/ws/rest/v1/appointments/conflicts", (route) => route.fulfill({ status: 204 }));
  await page.route("**/openmrs/ws/rest/v1/appointment", async (route) => {
    savedAppointment = JSON.parse(route.request().postData() ?? "{}");
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({
      uuid: "appointment-new", patient: { uuid: "patient-2", identifier: "HCSBA-2", name: "María Rojas" },
      service: { uuid: "service-1", name: "Cardiología" }, providers: [{ uuid: "provider-1", name: "Dra. Soto", response: "ACCEPTED" }],
      location: { uuid: "location-1", name: "Consultas" }, startDateTime: 1786712400000, endDateTime: 1786714200000,
      status: "Scheduled", appointmentKind: "Scheduled", teleconsultation: null, additionalInfo: null,
    }) });
  });
  await page.goto("/bahmni/appointments/new");
  const input = page.getByPlaceholder("Nombre o identificador");
  await input.fill("María");
  await input.press("Enter");
  await expect(page.getByRole("button", { name: /María Rojas/ })).toBeVisible();
  expect(searchUrl?.pathname).toBe("/openmrs/ws/rest/v1/bahmni/search/patient/lucene");
  expect(searchUrl?.searchParams.get("loginLocationUuid")).toBe("location-1");
  expect(searchUrl?.searchParams.get("identifier")).toBe("María");
  expect(searchUrl?.searchParams.get("filterOnAllIdentifiers")).toBe("true");
  await page.getByRole("button", { name: /María Rojas/ }).click();
  await expect(page.getByText("HCSBA-2", { exact: true })).toBeVisible();
  await page.locator("#appointment-service").selectOption("service-1");
  await page.locator("#appointment-location").selectOption("location-1");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page).toHaveURL(/\/bahmni\/appointments\/calendar$/);
  expect(savedAppointment).toMatchObject({
    patientUuid: "patient-2", serviceUuid: "service-1", locationUuid: "location-1", status: "Scheduled",
    appointmentKind: "Scheduled", teleconsultation: false,
    providers: [{ uuid: "provider-1", response: "ACCEPTED" }],
  });
});
