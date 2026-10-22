import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function setup(page: Page, privileges: string[], administrator = false) {
  const json = (body: unknown) => ({ contentType: "application/json", body: JSON.stringify(body) });
  let reviewReads = 0;
  await page.route("**/openmrs/**", r => r.fulfill({ status: 404, ...json({}) }));
  await page.route("**/bahmni_config/**", r => r.fulfill({ status: 404 }));
  await page.route("**/implementation_config/**", r => r.fulfill({ status: 404 }));
  await page.route("**/openmrs/ws/rest/v1/session**", r => r.fulfill(json({ authenticated: true, user: { uuid: "user", display: "Operador" }, sessionLocation: { uuid: "location", display: "HCSBA" } })));
  await page.route("**/openmrs/ws/rest/v1/user**", r => r.fulfill(json({ results: [{ uuid: "user", username: "operador", privileges: privileges.map(name => ({ name })), roles: administrator ? [{ name: "System Developer" }] : [] }] })));
  for (const resource of ["provider", "location"]) await page.route(`**/openmrs/ws/rest/v1/${resource}**`, r => r.fulfill(json({ results: [{ uuid: resource, display: "HCSBA", retired: false, attributes: [] }] })));
  await page.route("**/bahmni_config/openmrs/apps/home/extension.json", r => r.fulfill(json({
    registration: { id: "bahmni.registration", label: "Registro", url: "../registration/index.html", requiredPrivilege: "app:registration", order: 1 },
    patientManagement: { id: "bahmni.patientManagement", label: "Gestión de pacientes", url: "../patient-management", requiredPrivilege: "Manage MPI Identity Reviews", order: 1.5, icon: "pi pi-id-card" },
  })));
  await page.route("**/openmrs/mpi-admission-gateway/_identity", r => r.fulfill(json({ enabled: true, canManage: true, identifierMap: [] })));
  await page.route("**/openmrs/mpi-admission-gateway/_reviews**", r => { reviewReads++; return r.fulfill(json({ cases: [] })); });
  return () => reviewReads;
}

for (const administrator of [false, true]) test(`module is available from home and global navigation for ${administrator ? "administrator" : "manager without Registration"}`, async ({ page }) => {
  await setup(page, ["Manage MPI Identity Reviews", ...(administrator ? ["app:admin", "app:registration"] : [])], administrator);
  await page.goto("/bahmni/home");
  const tile = page.locator(".app-grid").getByRole("link", { name: "Gestión de pacientes", exact: true });
  await expect(tile).toHaveAttribute("href", "/bahmni/patient-management");
  await expect(tile).toHaveAttribute("data-navigation", "next");
  await tile.click();
  await expect(page.getByRole("heading", { name: "Gestión de pacientes", exact: true })).toBeVisible();
  await expect(page.getByText("No hay revisiones pendientes.", { exact: true })).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Navegación principal" });
  await expect(nav.getByRole("link", { name: "Gestión de pacientes" })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: "Registro", exact: true })).toHaveCount(administrator ? 1 : 0);
  const audit = await new AxeBuilder({ page }).include("main").analyze();
  expect(audit.violations.filter(v => ["serious", "critical"].includes(v.impact ?? ""))).toEqual([]);
});

test("admission cannot see the module or load reviews through a direct URL", async ({ page }) => {
  const reads = await setup(page, ["app:registration", "Add Patients"]);
  await page.goto("/bahmni/home");
  await expect(page.locator(".app-grid").getByRole("link", { name: "Registro", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Gestión de pacientes", exact: true })).toHaveCount(0);
  await page.goto("/bahmni/patient-management");
  await expect(page.locator("main").getByRole("alert")).toContainText("Acceso reservado al gestor de identidad");
  expect(reads()).toBe(0);
});

test("a general administration privilege alone does not grant clinical identity management", async ({ page }) => {
  const reads = await setup(page, ["app:admin", "app:registration"]);
  await page.goto("/bahmni/home");
  await expect(page.getByRole("link", { name: "Gestión de pacientes", exact: true })).toHaveCount(0);
  await page.goto("/bahmni/patient-management");
  await expect(page.locator("main").getByRole("alert")).toContainText("Acceso reservado al gestor de identidad");
  expect(reads()).toBe(0);
});

test("old bookmarks redirect to the module, which also fits a narrow screen", async ({ page }) => {
  await setup(page, ["Manage MPI Identity Reviews"]);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/bahmni/registration/reviews");
  await expect(page).toHaveURL(/\/bahmni\/patient-management\/?$/);
  await expect(page.getByRole("heading", { name: "Gestión de pacientes", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

const traceCase = { id: "trace-case", status: "separated", patientUuid: "a", clinicalNumber: "ENSAYO-001", version: 8,
  patient: { name: [{ given: ["Paciente"], family: "Sintético" }] }, reason: "Cotejo solicitado por admisión", requestedBy: "admisor", createdAt: "2026-10-21T14:00:00Z",
  history: [{ event: "requested", actor: "admisor", at: "2026-10-21T14:00:00Z" },
    { event: "clinical-consolidated", actor: "gestor", reason: "Documentos cotejados para unificar", at: "2026-10-21T14:10:00Z" },
    { event: "clinical-separated", actor: "gestor", reason: "Personas distintas tras nueva revisión", at: "2026-10-21T14:20:00Z" }],
  clinical: { operationId: "operation", preferredUuid: "a", secondaryUuid: "b", completedAt: "2026-10-21T14:10:00Z", separatedAt: "2026-10-21T14:20:00Z" } };
async function setupTrace(page: Page, denied = false, clockDifference = false) {
  await setup(page, ["Manage MPI Identity Reviews"]);
  const mutations: string[] = [];
  page.on("request", r => { if (r.url().includes("/openmrs/") && r.method() !== "GET") mutations.push(`${r.method()} ${r.url()}`); });
  await page.route("**/openmrs/mpi-admission-gateway/_reviews**", r => r.fulfill({ json: r.request().url().endsWith("/trace-case") ? traceCase : { cases: [traceCase] } }));
  await page.route("**/openmrs/ws/fhir2/R4/**", r => {
    const ref = new URL(r.request().url()).pathname.split("/R4/")[1]!;
    const [type, id] = ref.split("/");
    if (denied) return r.fulfill({ status: 403, json: { resourceType: "OperationOutcome" } });
    if (type === "Patient") return r.fulfill({ json: { resourceType: "Patient", id, active: true } });
    if (type === "Observation") return r.fulfill({ json: { resourceType: "Observation", id, subject: { reference: "Patient/b" }, encounter: { reference: "Encounter/e" } } });
    const merge = id?.startsWith("merge-");
    return r.fulfill({ json: { resourceType: type, id, recorded: clockDifference ? "2026-10-21T14:10:00-03:00" : merge ? "2026-10-21T14:10:00Z" : "2026-10-21T14:20:00Z",
      reason: [{ text: merge ? "Documentos cotejados para unificar" : "Personas distintas tras nueva revisión" }],
      outcomeDesc: merge ? "Documentos cotejados para unificar" : "Personas distintas tras nueva revisión",
      agent: [{ who: { identifier: { value: "gestor" } }, type: { coding: [{ code: "author" }] }, requestor: true }],
      target: [{ reference: "Patient/a" }, { reference: "Patient/b" }, { reference: "Observation/o" }] } });
  });
  await page.goto("/bahmni/patient-management");
  await page.getByRole("button", { name: "Ver también finalizadas" }).click();
  await page.getByRole("button", { name: "Ver historial", exact: true }).click();
  return mutations;
}

test("manager reads completed history, immutable evidence and current references without preparing or writing", async ({ page }) => {
  const mutations = await setupTrace(page);
  const dialog = page.getByRole("dialog", { name: "Historial y trazabilidad" });
  await expect(dialog.getByRole("heading", { name: "Fusión de fichas completada", exact: true })).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Separación de fichas completada", exact: true })).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Fusión · evidencia FHIR", exact: true })).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Separación · evidencia FHIR", exact: true })).toBeVisible();
  await dialog.getByText("Procedencia de la acción · Provenance", { exact: true }).first().click();
  await expect(dialog.locator("pre").first()).toContainText('"id": "merge-operation"');
  await dialog.getByText("Consultar recursos afectados (3)", { exact: true }).last().click();
  await dialog.getByRole("button", { name: "Paciente", exact: true }).last().click();
  const current = dialog.getByRole("region", { name: "Estado FHIR actual" });
  await expect(current.getByText("Ficha activa · Sin vínculos Patient.link", { exact: true })).toBeVisible();
  await expect(current).toContainText("No se dispone de versiones históricas FHIR");
  await dialog.getByRole("button", { name: "Observación o resultado", exact: true }).click();
  await expect(current.getByText("Patient/b · Encounter/e", { exact: true })).toBeVisible();
  const audit = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
  expect(audit.violations.filter(v => ["serious", "critical"].includes(v.impact ?? ""))).toEqual([]);
  await dialog.getByRole("button", { name: "Cerrar historial", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(mutations).toEqual([]);
});

test("missing FHIR permissions retain history and present incomplete evidence explicitly", async ({ page }) => {
  const mutations = await setupTrace(page, true);
  const dialog = page.getByRole("dialog", { name: "Historial y trazabilidad" });
  await expect(dialog.getByRole("heading", { name: "Separación de fichas completada", exact: true })).toBeVisible();
  await expect(dialog.getByText("La evidencia FHIR está incompleta.", { exact: false })).toHaveCount(2);
  await expect(dialog.getByText("Provenance: Su perfil no tiene permiso", { exact: false })).toHaveCount(2);
  expect(mutations).toEqual([]);
});

test("trace dialog fits a narrow screen and can be dismissed with the keyboard", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await setupTrace(page);
  const dialog = page.getByRole("dialog", { name: "Historial y trazabilidad" });
  await expect(dialog.getByRole("heading", { name: "Fusión · evidencia FHIR", exact: true })).toBeVisible();
  expect(await dialog.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(false);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("material timestamp differences are disclosed without rewriting the FHIR evidence", async ({ page }) => {
  await setupTrace(page, false, true);
  const dialog = page.getByRole("dialog", { name: "Historial y trazabilidad" });
  await expect(dialog.getByText("Las fechas de las fuentes requieren revisión.", { exact: true })).toHaveCount(2);
  await dialog.getByText("Procedencia de la acción · Provenance", { exact: true }).first().click();
  await expect(dialog.locator("pre").first()).toContainText('"recorded": "2026-10-21T14:10:00-03:00"');
});
