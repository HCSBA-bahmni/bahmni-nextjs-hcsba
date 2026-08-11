import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.skip(process.env.HCSBA_E2E_REAL !== "1", "Sólo se ejecuta contra el ambiente HCSBA explícitamente seleccionado.");

interface PatientCandidate { uuid: string; display: string }
interface VisitCandidate { uuid: string; stopDatetime?: string | null }
interface EncounterCandidate { uuid: string }
interface TemporaryProfile { personUuid: string; userUuid: string; username: string; password: string; expectedBoards: number }
interface RoleResource extends Record<string, unknown> { uuid: string; privileges?: unknown; inheritedRoles?: unknown }

const syntheticQuery = process.env.HCSBA_SYNTHETIC_QUERY ?? "test";
const locationName = process.env.HCSBA_LOCATION ?? "OPD-1";

function superAuthorization(): string {
  const username = process.env.HCSBA_USERNAME;
  const password = process.env.HCSBA_PASSWORD;
  if (!username || !password) throw new Error("HCSBA_USERNAME y HCSBA_PASSWORD son obligatorios para la certificación real.");
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

function rows(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"));
  if (!value || typeof value !== "object") return [];
  const source = value as Record<string, unknown>;
  return rows(source.results ?? source.pageOfResults ?? []);
}

async function authenticate(page: Page): Promise<string> {
  const username = process.env.HCSBA_USERNAME;
  const password = process.env.HCSBA_PASSWORD;
  if (!username || !password) throw new Error("HCSBA_USERNAME y HCSBA_PASSWORD son obligatorios para la certificación real.");
  const authorization = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
  const session = await page.request.get("/openmrs/ws/rest/v1/session?v=custom:(uuid)", { headers: { Authorization: authorization } });
  expect(session.ok()).toBeTruthy();
  const locationsResponse = await page.request.get("/openmrs/ws/rest/v1/location?tag=Login%20Location&v=full");
  expect(locationsResponse.ok()).toBeTruthy();
  const locations = rows(await locationsResponse.json());
  const location = locations.find((item) => item.display === locationName) ?? locations[0];
  if (!location || typeof location.uuid !== "string") throw new Error("No existe una ubicación de login para certificar.");
  const selected = await page.request.post("/openmrs/ws/rest/v1/session", { data: { sessionLocation: location.uuid, locale: "es" } });
  expect(selected.ok()).toBeTruthy();
  return location.uuid;
}

async function createTemporaryPrivilegeProfiles(page: Page): Promise<TemporaryProfile[]> {
  const headers = { Authorization: superAuthorization() };
  const [rolesResponse, extensionsResponse] = await Promise.all([
    page.request.get("/openmrs/ws/rest/v1/role?v=full", { headers }),
    page.request.get("/bahmni_config/openmrs/apps/clinical/extension.json"),
  ]);
  expect(rolesResponse.ok()).toBeTruthy();
  expect(extensionsResponse.ok()).toBeTruthy();
  const extensions = await extensionsResponse.json() as Record<string, Record<string, unknown>>;
  const boards = Object.values(extensions).filter((extension) => extension.extensionPointId === "org.bahmni.clinical.consultation.board");
  const roles = rows(await rolesResponse.json()).flatMap((role): RoleResource[] => typeof role.uuid === "string" ? [{ ...role, uuid: role.uuid }] : []);
  const rolesByUuid = new Map(roles.map((role) => [role.uuid, role]));
  const effectivePrivileges = (role: RoleResource, seen = new Set<string>()): Set<string> => {
    if (seen.has(role.uuid)) return new Set();
    seen.add(role.uuid);
    const privileges = new Set(rows(role.privileges).flatMap((privilege) => typeof privilege.name === "string" ? [privilege.name] : []));
    rows(role.inheritedRoles).forEach((inherited) => {
      if (typeof inherited.uuid !== "string") return;
      const inheritedRole = rolesByUuid.get(inherited.uuid);
      if (inheritedRole) effectivePrivileges(inheritedRole, seen).forEach((privilege) => privileges.add(privilege));
    });
    return privileges;
  };
  const candidates = roles.flatMap((role) => {
    const privileges = effectivePrivileges(role);
    if (!privileges.has("app:clinical") || typeof role.uuid !== "string") return [];
    const expectedBoards = boards.filter((board) => {
      const required = Array.isArray(board.requiredPrivilege) ? board.requiredPrivilege : board.requiredPrivilege ? [board.requiredPrivilege] : [];
      return required.every((privilege) => typeof privilege === "string" && privileges.has(privilege));
    }).length;
    return [{ roleUuid: role.uuid, expectedBoards }];
  });
  const selected = [...new Map(candidates.map((candidate) => [candidate.expectedBoards, candidate])).values()].sort((a, b) => a.expectedBoards - b.expectedBoards);
  expect(selected.length, "Se requieren tres perfiles clínicos distintos").toBeGreaterThanOrEqual(3);
  const profiles: TemporaryProfile[] = [];
  try {
    for (const candidate of [selected[0]!, selected[Math.floor(selected.length / 2)]!, selected.at(-1)!]) {
    const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
    const personResponse = await page.request.post("/openmrs/ws/rest/v1/person", { headers, data: { names: [{ givenName: "Synthetic", familyName: "Certification" }], gender: "M" } });
    expect(personResponse.ok()).toBeTruthy();
    const person = await personResponse.json() as Record<string, unknown>;
    const username = `nextcert_${suffix}`;
    const password = `Tmp!${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}aA1`;
      const userResponse = await page.request.post("/openmrs/ws/rest/v1/user", { headers, data: { person: person.uuid, username, password, roles: [candidate.roleUuid] } });
      if (!userResponse.ok()) {
        await page.request.delete(`/openmrs/ws/rest/v1/person/${String(person.uuid)}?purge=true`, { headers });
      }
      expect(userResponse.ok()).toBeTruthy();
    const user = await userResponse.json() as Record<string, unknown>;
      profiles.push({ personUuid: String(person.uuid), userUuid: String(user.uuid), username, password, expectedBoards: candidate.expectedBoards });
    }
  } catch (error) {
    await removeTemporaryPrivilegeProfiles(page, profiles);
    throw error;
  }
  return profiles;
}

async function removeTemporaryPrivilegeProfiles(page: Page, profiles: TemporaryProfile[]) {
  const headers = { Authorization: superAuthorization() };
  for (const profile of profiles.reverse()) {
    const userCleanup = await page.request.delete(`/openmrs/ws/rest/v1/user/${profile.userUuid}?purge=true`, { headers });
    expect(userCleanup.ok()).toBeTruthy();
    const personCleanup = await page.request.delete(`/openmrs/ws/rest/v1/person/${profile.personUuid}?purge=true`, { headers });
    expect(personCleanup.ok()).toBeTruthy();
  }
}

async function discoverSyntheticPatients(page: Page, locationUuid: string): Promise<Array<PatientCandidate & { visits: VisitCandidate[]; encounters: EncounterCandidate[]; programs: Array<Record<string, unknown>> }>> {
  const search = await page.request.get(`/openmrs/ws/rest/v1/bahmni/search/patient/lucene?q=${encodeURIComponent(syntheticQuery)}&s=byIdOrName&startIndex=0&limit=100&loginLocationUuid=${encodeURIComponent(locationUuid)}&filterOnAllIdentifiers=false`);
  expect(search.ok()).toBeTruthy();
  const candidates = rows(await search.json()).flatMap((item) => {
    const uuid = typeof item.uuid === "string" ? item.uuid : typeof item.patientUuid === "string" ? item.patientUuid : "";
    const display = [item.name, item.givenName, item.familyName, item.display].filter((part) => typeof part === "string").join(" ");
    return uuid && display.toLocaleLowerCase().includes(syntheticQuery.toLocaleLowerCase()) ? [{ uuid, display }] : [];
  });
  return Promise.all(candidates.map(async (patient) => {
    const [visitsResponse, encountersResponse, programsResponse] = await Promise.all([
      page.request.get(`/openmrs/ws/rest/v1/visit?patient=${encodeURIComponent(patient.uuid)}&includeInactive=true&v=full`),
      page.request.get(`/openmrs/ws/rest/v1/encounter?patient=${encodeURIComponent(patient.uuid)}&v=full`),
      page.request.get(`/openmrs/ws/rest/v1/bahmniprogramenrollment?patient=${encodeURIComponent(patient.uuid)}&v=full`),
    ]);
    return {
      ...patient,
      visits: rows(await visitsResponse.json()).flatMap((item) => typeof item.uuid === "string" ? [{ uuid: item.uuid, stopDatetime: typeof item.stopDatetime === "string" ? item.stopDatetime : null }] : []),
      encounters: rows(await encountersResponse.json()).flatMap((item) => typeof item.uuid === "string" ? [{ uuid: item.uuid }] : []),
      programs: rows(await programsResponse.json()),
    };
  }));
}

async function expectConsultation(page: Page, url: string, modeLabel: string) {
  const failedEndpoints: string[] = [];
  const collectFailure = (response: import("@playwright/test").Response) => {
    if (response.status() < 400) return;
    const parsed = new URL(response.url());
    const safePath = parsed.pathname.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "<uuid>");
    failedEndpoints.push(`${response.status()} ${safePath}`);
  };
  page.on("response", collectFailure);
  await page.goto(url);
  await expect(page.getByText(modeLabel, { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("navigation", { name: "Tableros de consulta" })).toBeVisible();
  await expect(page.locator(".error-banner"), [...new Set(failedEndpoints)].join(", ")).toHaveCount(0);
  page.off("response", collectFailure);
}

async function expectAllEnabledBoards(page: Page) {
  const navigation = page.getByRole("navigation", { name: "Tableros de consulta" });
  const buttons = navigation.getByRole("button");
  expect(await buttons.count()).toBe(7);
  for (let index = 0; index < await buttons.count(); index++) {
    const button = buttons.nth(index);
    if (await button.isDisabled()) continue;
    await button.click();
    await page.waitForLoadState("networkidle");
    await expect(page.locator("main .p-progress-spinner")).toHaveCount(0, { timeout: 30_000 });
    await expect(page.locator(".error-banner")).toHaveCount(0);
  }
}

async function expectAccessibleConsultation(page: Page, url: string, modeLabel: string): Promise<void> {
  await expectConsultation(page, url, modeLabel);
  const accessibility = await new AxeBuilder({ page }).include("main").analyze();
  expect(accessibility.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? ""))).toEqual([]);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement?.tagName ?? "BODY")).not.toBe("BODY");
}

async function openSyntheticActiveSummary(page: Page): Promise<void> {
  const locationUuid = await authenticate(page);
  const patients = await discoverSyntheticPatients(page, locationUuid);
  const active = patients.find((patient) => patient.visits.some((visit) => !visit.stopDatetime));
  if (!active) throw new Error("No existe un paciente sintÃ©tico con visita activa.");
  const visitUuid = active.visits.find((visit) => !visit.stopDatetime)!.uuid;
  await expectConsultation(page, `/bahmni/clinical/patient/${active.uuid}/consultation/summary?visitUuid=${visitUuid}`, "Visita activa");
}

test("certifies the available real HCSBA consultation modes without exposing clinical data", async ({ page }) => {
  const locationUuid = await authenticate(page);
  const patients = await discoverSyntheticPatients(page, locationUuid);
  expect(patients.length, "Se requiere al menos un paciente sintético").toBeGreaterThan(0);

  const active = patients.find((patient) => patient.visits.some((visit) => !visit.stopDatetime));
  const withoutVisit = patients.find((patient) => patient.visits.every((visit) => Boolean(visit.stopDatetime)));
  const historical = patients.find((patient) => patient.encounters.length > 0);
  if (!active || !withoutVisit || !historical) throw new Error("Faltan escenarios sintéticos para visita activa, sin visita o histórico.");

  const activeVisit = active.visits.find((visit) => !visit.stopDatetime)!;
  await expectConsultation(page, `/bahmni/clinical/patient/${active.uuid}/consultation/summary?visitUuid=${activeVisit.uuid}`, "Visita activa");
  await expectAllEnabledBoards(page);
  await expectConsultation(page, `/bahmni/clinical/patient/${withoutVisit.uuid}/consultation/summary`, "Sin visita abierta");

  const retrospectiveDate = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  await expectConsultation(page, `/bahmni/clinical/patient/${active.uuid}/consultation/summary?retrospectiveDate=${retrospectiveDate}`, "Entrada retrospectiva");
  await expect(page.getByRole("button", { name: /Órdenes/i })).toBeDisabled();
  await expect(page.getByRole("button", { name: /Bacteriología/i })).toBeDisabled();

  await expectConsultation(page, `/bahmni/clinical/patient/${historical.uuid}/consultation/summary?encounterUuid=${historical.encounters[0]!.uuid}`, "Editando encuentro");

});

test("certifies consultation in a synthetic HCSBA program", async ({ page }) => {
  const locationUuid = await authenticate(page);
  const patients = await discoverSyntheticPatients(page, locationUuid);
  let programPatient = patients.find((patient) => patient.programs.length > 0);
  let enrollment = programPatient?.programs[0];
  let createdEnrollment: Record<string, unknown> | undefined;

  if (!enrollment && process.env.HCSBA_E2E_CREATE_PROGRAM_FIXTURE === "1") {
    programPatient = patients[0];
    if (!programPatient) throw new Error("No existe un paciente sintético para crear el fixture de programa.");
    const programResponse = await page.request.get("/openmrs/ws/rest/v1/program?v=full");
    const program = rows(await programResponse.json()).find((item) => item.retired !== true);
    if (!program || typeof program.uuid !== "string") throw new Error("No existe un programa configurado para el fixture.");
    const dateEnrolled = new Date().toISOString();
    const created = await page.request.post("/openmrs/ws/rest/v1/bahmniprogramenrollment", { data: { patient: programPatient.uuid, program: program.uuid, dateEnrolled, attributes: [] } });
    expect(created.ok()).toBeTruthy();
    createdEnrollment = await created.json() as Record<string, unknown>;
    enrollment = createdEnrollment;
  }

  test.skip(!programPatient || !enrollment, "El ambiente no contiene un enrolamiento sintético de programa.");
  const program = enrollment!.program as Record<string, unknown> | undefined;
  const programUuid = typeof program?.uuid === "string" ? program.uuid : typeof enrollment!.programUuid === "string" ? enrollment!.programUuid : "";
  if (!programUuid || typeof enrollment!.uuid !== "string") throw new Error("El enrolamiento sintético no tiene el contrato esperado.");
  try {
    await expectConsultation(page, `/bahmni/clinical/patient/${programPatient!.uuid}/consultation/summary?configName=programs&programUuid=${programUuid}&enrollment=${enrollment!.uuid}`, "Programa");
  } finally {
    if (createdEnrollment && typeof createdEnrollment.uuid === "string") {
      const cleanup = await page.request.post(`/openmrs/ws/rest/v1/bahmniprogramenrollment/${createdEnrollment.uuid}`, {
        data: {
          uuid: createdEnrollment.uuid,
          dateEnrolled: createdEnrollment.dateEnrolled,
          dateCompleted: null,
          states: Array.isArray(createdEnrollment.states) ? createdEnrollment.states : [],
          outcome: null,
          attributes: Array.isArray(createdEnrollment.attributes) ? createdEnrollment.attributes : [],
          voided: true,
          voidReason: "Fixture temporal de certificación Next.js",
        },
      });
      expect(cleanup.ok()).toBeTruthy();
    }
  }
});

test("certifies three real HCSBA privilege profiles with temporary technical users", async ({ page, browser }) => {
  const locationUuid = await authenticate(page);
  const patients = await discoverSyntheticPatients(page, locationUuid);
  const active = patients.find((patient) => patient.visits.some((visit) => !visit.stopDatetime));
  if (!active) throw new Error("No existe un paciente sintético con visita activa.");
  const visitUuid = active.visits.find((visit) => !visit.stopDatetime)!.uuid;
  const profiles: TemporaryProfile[] = [];
  try {
    profiles.push(...await createTemporaryPrivilegeProfiles(page));
    expect(new Set(profiles.map((profile) => profile.expectedBoards)).size).toBe(3);
    for (const profile of profiles) {
      const context = await browser.newContext({ baseURL: "https://localhost", ignoreHTTPSErrors: true });
      try {
        const authorization = `Basic ${Buffer.from(`${profile.username}:${profile.password}`).toString("base64")}`;
        const session = await context.request.get("/openmrs/ws/rest/v1/session?v=full", { headers: { Authorization: authorization } });
        expect(session.ok()).toBeTruthy();
        const selectedLocation = await context.request.post("/openmrs/ws/rest/v1/session", { data: { sessionLocation: locationUuid, locale: "es" } });
        expect(selectedLocation.ok()).toBeTruthy();
        const profilePage = await context.newPage();
        await profilePage.goto(`/bahmni/clinical/patient/${active.uuid}/consultation/summary?visitUuid=${visitUuid}`);
        if (profile.expectedBoards === 0) {
          await expect(profilePage.getByText("No hay tableros de consulta visibles para sus privilegios.")).toBeVisible();
        } else {
          await expect(profilePage.getByRole("navigation", { name: "Tableros de consulta" }).getByRole("button")).toHaveCount(profile.expectedBoards);
        }
      } finally {
        await context.close();
      }
    }
  } finally {
    await removeTemporaryPrivilegeProfiles(page, profiles);
  }
});

test("certifies partial condition failure and an isolated retry against real HCSBA reads", async ({ page }) => {
  await openSyntheticActiveSummary(page);
  let encounterPosts = 0;
  let conditionPosts = 0;
  await page.route(/\/openmrs\/ws\/rest\/v1\/bahmnicore\/bahmniencounter(?:\?.*)?$/, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    encounterPosts += 1;
    const payload = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ...payload, encounterUuid: "synthetic-certification-encounter" }) });
  });
  await page.route(/\/openmrs\/ws\/rest\/emrapi\/condition(?:\?.*)?$/, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    conditionPosts += 1;
    if (conditionPosts === 1) await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: { message: "Synthetic condition failure" } }) });
    else await route.fulfill({ contentType: "application/json", body: "[]" });
  });
  await page.route(/\/openmrs\/ws\/rest\/v1\/auditlog(?:\?.*)?$/, (route) => route.fulfill({ status: 204 }));
  await page.getByLabel("Nota de consulta").fill("ValidaciÃ³n sintÃ©tica de reintento aislado");
  await page.locator(".consultation-patient-header").getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText(/El encuentro fue guardado, pero las condiciones no/)).toBeVisible();
  await page.locator(".consultation-patient-header").getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Condiciones guardadas.")).toBeVisible();
  expect(encounterPosts).toBe(1);
  expect(conditionPosts).toBe(2);
});

test("certifies that a real-context 409 remains retryable without a duplicate write", async ({ page }) => {
  await openSyntheticActiveSummary(page);
  let encounterPosts = 0;
  await page.route(/\/openmrs\/ws\/rest\/v1\/bahmnicore\/bahmniencounter(?:\?.*)?$/, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    encounterPosts += 1;
    await route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: { message: "Conflicto sintÃ©tico de certificaciÃ³n" } }) });
  });
  await page.getByLabel("Nota de consulta").fill("ValidaciÃ³n sintÃ©tica de conflicto");
  const save = page.locator(".consultation-patient-header").getByRole("button", { name: "Guardar" });
  await save.click();
  await expect(page.locator(".error-banner")).toContainText("Conflicto sintÃ©tico de certificaciÃ³n");
  await expect(save).toBeEnabled();
  expect(encounterPosts).toBe(1);
});

test("certifies ambiguous-write protection against real HCSBA reads", async ({ page }) => {
  await openSyntheticActiveSummary(page);
  let encounterPosts = 0;
  await page.route(/\/openmrs\/ws\/rest\/v1\/bahmnicore\/bahmniencounter(?:\?.*)?$/, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    encounterPosts += 1;
    await route.abort("connectionreset");
  });
  await page.route(/\/openmrs\/ws\/rest\/v1\/bahmnicore\/bahmniencounter\/find(?:\?.*)?$/, (route) => route.fulfill({ contentType: "application/json", body: "{}" }));
  await page.getByLabel("Nota de consulta").fill("ValidaciÃ³n sintÃ©tica de escritura ambigua");
  await page.locator(".consultation-patient-header").getByRole("button", { name: "Guardar" }).click();
  await expect(page.locator(".error-banner")).toContainText("No repita el");
  await expect(page.getByRole("button", { name: "Recargar y verificar" })).toBeVisible();
  await expect(page.locator(".consultation-patient-header").getByRole("button", { name: "Guardar" })).toBeDisabled();
  expect(encounterPosts).toBe(1);
});

test("certifies that a critical CDSS alert blocks the write in a real HCSBA context", async ({ page }) => {
  await openSyntheticActiveSummary(page);
  let encounterPosts = 0;
  await page.route(/\/openmrs\/ws\/rest\/v1\/bahmnicore\/sql\/globalproperty\?[^#]*property=cdss\.enable/, (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify("true") }));
  await page.route(/\/openmrs\/ws\/rest\/v1\/cdss(?:\?.*)?$/, (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify([{ severity: "critical", active: true, summary: "Alerta CDSS crÃ­tica sintÃ©tica" }]) }));
  await page.route(/\/openmrs\/ws\/rest\/v1\/bahmnicore\/bahmniencounter(?:\?.*)?$/, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    encounterPosts += 1;
    await route.fulfill({ status: 500 });
  });
  await page.getByLabel("Nota de consulta").fill("ValidaciÃ³n sintÃ©tica CDSS");
  await page.locator(".consultation-patient-header").getByRole("button", { name: "Guardar" }).click();
  await expect(page.locator(".error-banner")).toContainText("Alerta CDSS crÃ­tica sintÃ©tica");
  expect(encounterPosts).toBe(0);
});

test("certifies configured print, patient documents and teleconsultation actions", async ({ page }) => {
  await openSyntheticActiveSummary(page);
  await page.evaluate(() => {
    window.print = () => { document.body.dataset.consultationPrinted = "true"; };
    window.open = ((url?: string | URL) => {
      document.body.dataset.consultationOpened = String(url ?? "");
      return null;
    }) as typeof window.open;
  });
  await page.route(/\/openmrs\/ws\/rest\/v1\/adhocTeleconsultation\/generateAdhocTeleconsultationLink(?:\?.*)?$/, (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: { link: "https://example.invalid/synthetic-consultation" } }) }));

  await page.getByRole("button", { name: "Imprimir" }).click();
  await page.getByRole("menuitem", { name: "Imprimir consulta" }).click();
  await expect.poll(() => page.evaluate(() => document.body.dataset.consultationPrinted)).toBe("true");

  await page.getByRole("button", { name: "Documentos" }).click();
  await expect(page.getByRole("complementary")).toContainText("Documentos del paciente");
  await expect(page.getByRole("button", { name: "Cargar documento" })).toBeEnabled();
  await expect(page.locator(".consultation-documents-sidebar .error-banner")).toHaveCount(0);
  await page.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Teleconsulta" }).click();
  await expect.poll(() => page.evaluate(() => document.body.dataset.consultationOpened)).toBe("https://example.invalid/synthetic-consultation");
});

test("certifies keyboard and axe accessibility in all five real HCSBA modes", async ({ page }) => {
  const locationUuid = await authenticate(page);
  const patients = await discoverSyntheticPatients(page, locationUuid);
  const active = patients.find((patient) => patient.visits.some((visit) => !visit.stopDatetime));
  const withoutVisit = patients.find((patient) => patient.visits.every((visit) => Boolean(visit.stopDatetime)));
  const historical = patients.find((patient) => patient.encounters.length > 0);
  if (!active || !withoutVisit || !historical) throw new Error("Faltan escenarios sintéticos para accesibilidad.");
  const activeVisit = active.visits.find((visit) => !visit.stopDatetime)!;
  await expectAccessibleConsultation(page, `/bahmni/clinical/patient/${active.uuid}/consultation/summary?visitUuid=${activeVisit.uuid}`, "Visita activa");
  await expectAccessibleConsultation(page, `/bahmni/clinical/patient/${withoutVisit.uuid}/consultation/summary`, "Sin visita abierta");
  const retrospectiveDate = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  await expectAccessibleConsultation(page, `/bahmni/clinical/patient/${active.uuid}/consultation/summary?retrospectiveDate=${retrospectiveDate}`, "Entrada retrospectiva");
  await expectAccessibleConsultation(page, `/bahmni/clinical/patient/${historical.uuid}/consultation/summary?encounterUuid=${historical.encounters[0]!.uuid}`, "Editando encuentro");

  const programPatient = patients.find((patient) => patient.programs.length > 0) ?? patients[0]!;
  let enrollment = programPatient.programs[0];
  let createdEnrollment: Record<string, unknown> | undefined;
  if (!enrollment) {
    const programsResponse = await page.request.get("/openmrs/ws/rest/v1/program?v=full");
    const program = rows(await programsResponse.json()).find((item) => item.retired !== true);
    if (!program || typeof program.uuid !== "string") throw new Error("No existe un programa para la certificación de accesibilidad.");
    const created = await page.request.post("/openmrs/ws/rest/v1/bahmniprogramenrollment", { data: { patient: programPatient.uuid, program: program.uuid, dateEnrolled: new Date().toISOString(), attributes: [] } });
    expect(created.ok()).toBeTruthy();
    createdEnrollment = await created.json() as Record<string, unknown>;
    enrollment = createdEnrollment;
  }
  try {
    const program = enrollment.program as Record<string, unknown> | undefined;
    const programUuid = typeof program?.uuid === "string" ? program.uuid : String(enrollment.programUuid ?? "");
    if (!programUuid || typeof enrollment.uuid !== "string") throw new Error("El enrolamiento no tiene el contrato esperado.");
    await expectAccessibleConsultation(page, `/bahmni/clinical/patient/${programPatient.uuid}/consultation/summary?configName=programs&programUuid=${programUuid}&enrollment=${enrollment.uuid}`, "Programa");
  } finally {
    if (createdEnrollment && typeof createdEnrollment.uuid === "string") {
      const cleanup = await page.request.post(`/openmrs/ws/rest/v1/bahmniprogramenrollment/${createdEnrollment.uuid}`, { data: { ...createdEnrollment, voided: true, voidReason: "Fixture temporal de accesibilidad Next.js" } });
      expect(cleanup.ok()).toBeTruthy();
    }
  }
});

test("certifies the enabled dashboard Consultation button opens the Next.js flow", async ({ page }) => {
  const locationUuid = await authenticate(page);
  const patients = await discoverSyntheticPatients(page, locationUuid);
  const active = patients.find((patient) => patient.visits.some((visit) => !visit.stopDatetime));
  if (!active) throw new Error("No existe un paciente sintético con visita activa.");
  const visitUuid = active.visits.find((visit) => !visit.stopDatetime)!.uuid;
  await page.goto(`/bahmni/clinical/patient/${active.uuid}/dashboard?visitUuid=${visitUuid}`);
  const consultation = page.getByRole("button", { name: "Consulta", exact: true });
  await expect(consultation).toBeEnabled({ timeout: 30_000 });
  await consultation.click();
  await expect(page).toHaveURL(/\/bahmni\/clinical\/patient\/[^/]+\/consultation\//);
  await expect(page.getByRole("navigation", { name: "Tableros de consulta" })).toBeVisible({ timeout: 30_000 });
});

test("certifies a reversible retrospective write on a synthetic patient", async ({ page }) => {
  test.skip(process.env.HCSBA_E2E_ALLOW_WRITES !== "1", "Las escrituras reales requieren habilitación explícita.");
  const locationUuid = await authenticate(page);
  const patients = await discoverSyntheticPatients(page, locationUuid);
  const patient = patients.find((candidate) => candidate.visits.every((visit) => Boolean(visit.stopDatetime))) ?? patients[0];
  if (!patient) throw new Error("No existe un paciente sintético para la escritura reversible.");
  const retrospectiveDate = new Date(Date.now() - 10 * 86_400_000).toISOString().slice(0, 10);
  let savedEncounterUuid = "";
  let existingEncounterUuid = "";
  let submittedPayload: Record<string, unknown> | undefined;
  const collectEncounter = async (response: import("@playwright/test").Response) => {
    if (!response.url().endsWith("/openmrs/ws/rest/v1/bahmnicore/bahmniencounter") || response.request().method() !== "POST" || !response.ok()) return;
    submittedPayload = response.request().postDataJSON() as Record<string, unknown>;
    const body = await response.json() as Record<string, unknown>;
    savedEncounterUuid = typeof body.encounterUuid === "string" ? body.encounterUuid : typeof body.uuid === "string" ? body.uuid : "";
  };
  const collectExistingEncounter = async (response: import("@playwright/test").Response) => {
    if (!response.url().includes("/openmrs/ws/rest/v1/bahmnicore/bahmniencounter/find") || !response.ok()) return;
    const body = await response.json() as Record<string, unknown>;
    existingEncounterUuid = typeof body.encounterUuid === "string" ? body.encounterUuid : typeof body.uuid === "string" ? body.uuid : "";
  };
  page.on("response", collectEncounter);
  page.on("response", collectExistingEncounter);
  try {
    await expectConsultation(page, `/bahmni/clinical/patient/${patient.uuid}/consultation/summary?retrospectiveDate=${retrospectiveDate}`, "Entrada retrospectiva");
    test.skip(Boolean(existingEncounterUuid), "La fecha retrospectiva seleccionada ya contiene un encuentro y no se modificará.");
    await page.getByLabel("Nota de consulta").fill(`Certificación automática Next.js ${new Date().toISOString()}`);
    await page.locator(".consultation-patient-header").getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("Consulta guardada.")).toBeVisible({ timeout: 30_000 });
    expect(submittedPayload).toMatchObject({ patientUuid: patient.uuid, locationUuid, encounterDateTime: retrospectiveDate });
    expect(submittedPayload).not.toHaveProperty("visitUuid");
    expect(submittedPayload).toHaveProperty("visitType");
    expect(savedEncounterUuid).not.toBe("");
  } finally {
    page.off("response", collectEncounter);
    page.off("response", collectExistingEncounter);
    if (savedEncounterUuid) {
      const cleanup = await page.request.delete(`/openmrs/ws/rest/v1/encounter/${savedEncounterUuid}?reason=${encodeURIComponent("Fixture temporal de certificación Next.js")}`);
      expect(cleanup.ok()).toBeTruthy();
    }
  }
});
