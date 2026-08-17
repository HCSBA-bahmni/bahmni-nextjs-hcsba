import { expect, test, type Page } from "@playwright/test";

const json = (value: unknown) => JSON.stringify(value);
const localDate = (offsetDays = 0) => {
  const value = new Date();
  value.setHours(12, 0, 0, 0);
  value.setDate(value.getDate() + offsetDays);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
};
const openMrsDate = (value: string) => `${value}T00:00:00.000-0400`;

async function mockPrograms(page: Page) {
  const consentType = { uuid: "attribute-consent", name: "Consent", description: "Consentimiento", datatypeClassname: "java.lang.Boolean" };
  const identifierType = { uuid: "attribute-identifier", name: "Program ID", description: "ID del programa", datatypeClassname: "java.lang.String" };
  const workflow = {
    uuid: "workflow-treatment",
    states: [
      { uuid: "state-initial", concept: { display: "Inicial" } },
      { uuid: "state-follow-up", concept: { display: "Seguimiento" } },
    ],
  };
  const outcomesConcept = { setMembers: [{ uuid: "outcome-completed", display: "Tratamiento completado" }] };
  const definitions = [
    { uuid: "program-treatment", name: "Tratamiento activo", display: "Tratamiento activo", allWorkflows: [workflow], outcomesConcept },
    { uuid: "program-new", name: "Programa nuevo", display: "Programa nuevo", allWorkflows: [workflow], outcomesConcept },
    { uuid: "program-history", name: "Programa histórico", display: "Programa histórico", allWorkflows: [workflow], outcomesConcept },
  ];
  let enrollments: Array<Record<string, unknown>> = [
    {
      uuid: "enrollment-active",
      display: "Tratamiento activo",
      program: definitions[0],
      dateEnrolled: openMrsDate(localDate(-20)),
      dateCompleted: null,
      states: [{ uuid: "patient-state-active", state: workflow.states[0], startDate: openMrsDate(localDate(-10)), endDate: null }],
      attributes: [
        { uuid: "stored-consent", attributeType: consentType, value: "false" },
        { uuid: "stored-identifier", attributeType: identifierType, value: "SYN-001" },
      ],
    },
    {
      uuid: "enrollment-history",
      display: "Programa histórico",
      program: definitions[2],
      dateEnrolled: openMrsDate(localDate(-90)),
      dateCompleted: openMrsDate(localDate(-30)),
      outcome: { uuid: "outcome-completed", display: "Tratamiento completado" },
      states: [{ uuid: "patient-state-history", state: workflow.states[0], startDate: openMrsDate(localDate(-85)), endDate: openMrsDate(localDate(-30)) }],
      attributes: [],
    },
  ];
  const createdPayloads: Array<Record<string, unknown>> = [];
  const updatedPayloads: Array<{ uuid: string; body: Record<string, unknown> }> = [];

  await page.route("**/openmrs/ws/rest/v1/session**", (route) => route.fulfill({ contentType: "application/json", body: json({ authenticated: true, user: { uuid: "user-programs", display: "program.user" }, sessionLocation: { uuid: "location-programs", display: "Consulta" } }) }));
  await page.route("**/openmrs/ws/rest/v1/user**", (route) => route.fulfill({ contentType: "application/json", body: json({ results: [{ uuid: "user-programs", username: "program.user", display: "Program User", privileges: [{ uuid: "clinical", name: "app:clinical" }], roles: [], userProperties: { defaultLocale: "es" } }] }) }));
  await page.route("**/openmrs/ws/rest/v1/provider**", (route) => route.fulfill({ contentType: "application/json", body: json({ results: [{ uuid: "provider-programs", display: "Profesional sintético", attributes: [] }] }) }));
  await page.route("**/openmrs/ws/rest/v1/location**", (route) => route.fulfill({ contentType: "application/json", body: json({ results: [{ uuid: "location-programs", display: "Consulta" }] }) }));
  await page.route("**/openmrs/ws/rest/v1/bahmnicore/sql/globalproperty**", (route) => route.fulfill({ contentType: "application/json", body: json("") }));
  await page.route("**/openmrs/ws/rest/v1/patientprofile/patient-programs**", (route) => route.fulfill({ contentType: "application/json", body: json({ patient: { identifiers: [{ identifier: "SYN-PROG-1" }], person: { gender: "F", age: 35, names: [{ givenName: "Paciente", familyName: "Sintética" }] } } }) }));
  await page.route("**/bahmni_config/openmrs/apps/clinical/app.json", (route) => route.fulfill({ contentType: "application/json", body: json({ config: { program: { Consent: { required: true } } } }) }));
  await page.route("**/implementation_config/openmrs/apps/clinical/app.json", (route) => route.fulfill({ status: 404 }));
  await page.route("**/bahmni/i18n/clinical/locale_es.json", (route) => route.fulfill({ contentType: "application/json", body: "{}" }));
  await page.route("**/bahmni_config/openmrs/i18n/clinical/locale_es.json", (route) => route.fulfill({ contentType: "application/json", body: "{}" }));
  await page.route("**/implementation_config/openmrs/i18n/clinical/locale_es.json", (route) => route.fulfill({ status: 404 }));
  await page.route("**/openmrs/ws/rest/v1/programattributetype**", (route) => route.fulfill({ contentType: "application/json", body: json({ results: [consentType, identifierType] }) }));
  await page.route("**/openmrs/ws/rest/v1/program?**", (route) => route.fulfill({ contentType: "application/json", body: json({ results: definitions }) }));
  await page.route("**/openmrs/ws/rest/v1/bahmniprogramenrollment**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === "GET") return route.fulfill({ contentType: "application/json", body: json({ results: enrollments }) });
    const body = request.postDataJSON() as Record<string, unknown>;
    if (path.endsWith("/bahmniprogramenrollment")) {
      createdPayloads.push(body);
      const definition = definitions.find((program) => program.uuid === body.program) ?? definitions[1];
      const states = Array.isArray(body.states) ? body.states as Array<Record<string, unknown>> : [];
      const attributes = Array.isArray(body.attributes) ? body.attributes as Array<Record<string, unknown>> : [];
      const created = {
        uuid: `enrollment-created-${createdPayloads.length}`,
        display: definition.display,
        program: definition,
        dateEnrolled: body.dateEnrolled,
        dateCompleted: null,
        states: states.map((state, index) => ({ uuid: `created-state-${index}`, state: workflow.states.find((item) => item.uuid === state.state), startDate: state.startDate, endDate: null })),
        attributes: attributes.map((attribute, index) => ({ ...attribute, uuid: `created-attribute-${index}`, attributeType: attribute.attributeType === undefined ? consentType : attribute.attributeType })),
      };
      enrollments = [...enrollments, created];
      return route.fulfill({ contentType: "application/json", body: json(created) });
    }
    const uuid = decodeURIComponent(path.split("/").at(-1) ?? "");
    updatedPayloads.push({ uuid, body });
    const current = enrollments.find((item) => item.uuid === uuid);
    if (current) {
      if (body.voided === true) current.voided = true;
      else {
        current.dateEnrolled = body.dateEnrolled;
        current.dateCompleted = body.dateCompleted;
        current.outcome = body.outcome ? outcomesConcept.setMembers.find((item) => item.uuid === body.outcome) : undefined;
        const incomingStates = Array.isArray(body.states) ? body.states as Array<Record<string, unknown>> : [];
        const previousStates = current.states as Array<Record<string, unknown>>;
        current.states = incomingStates.map((state, index) => {
          const stateValue = state.state as Record<string, unknown>;
          const stateUuid = String(stateValue?.uuid ?? "");
          const definition = workflow.states.find((item) => item.uuid === stateUuid) ?? stateValue;
          return { ...state, uuid: state.uuid ?? `updated-state-${index}`, state: definition, endDate: index < incomingStates.length - 1 ? state.endDate ?? openMrsDate(localDate()) : state.endDate ?? null };
        });
        const incomingAttributes = Array.isArray(body.attributes) ? body.attributes as Array<Record<string, unknown>> : [];
        current.attributes = incomingAttributes.filter((attribute) => attribute.voided !== true).map((attribute) => ({ ...attribute, attributeType: attribute.attributeType === undefined ? consentType : attribute.attributeType }));
        if (previousStates.length === 0 && incomingStates.length === 0) current.states = [];
      }
    }
    return route.fulfill({ contentType: "application/json", body: json(current ?? {}) });
  });

  return { createdPayloads, updatedPayloads };
}

test("programs preserves clinical contracts through enrollment, editing, completion, voiding and dashboard navigation", async ({ page }) => {
  test.setTimeout(90_000);
  const requests = await mockPrograms(page);
  await page.goto("/bahmni/clinical/programs/patient/patient-programs");
  await expect(page.getByRole("heading", { name: "Paciente Sintética" })).toBeVisible();

  const activeCard = page.locator("article.program-card", { hasText: "Tratamiento activo" });
  const historicalCard = page.locator("article.program-card", { hasText: "Programa histórico" });
  const activeDashboardHref = await activeCard.getByRole("link", { name: /Abrir dashboard/ }).getAttribute("href");
  expect(activeDashboardHref).toContain("programUuid=program-treatment");
  expect(activeDashboardHref).toContain("enrollment=enrollment-active");
  expect(activeDashboardHref).toContain("dateEnrolled=");
  const historicalDashboardHref = await historicalCard.getByRole("link", { name: /Abrir dashboard/ }).getAttribute("href");
  expect(historicalDashboardHref).toContain("programUuid=program-history");
  expect(historicalDashboardHref).toContain("enrollment=enrollment-history");
  expect(historicalDashboardHref).toContain("dateCompleted=");

  await page.route("**/bahmni/clinical/patient/patient-programs/dashboard?**", (route) => route.fulfill({ contentType: "text/html", body: "<h1>Dashboard de programa sintético</h1>" }));
  await activeCard.getByRole("link", { name: /Abrir dashboard/ }).click();
  await expect(page).toHaveURL(/\/bahmni\/clinical\/patient\/patient-programs\/dashboard\?/);
  expect(new URL(page.url()).searchParams.get("enrollment")).toBe("enrollment-active");
  expect(new URL(page.url()).searchParams.get("programUuid")).toBe("program-treatment");
  await page.goto("/bahmni/clinical/programs/patient/patient-programs");
  await expect(page.getByRole("heading", { name: "Paciente Sintética" })).toBeVisible();
  await historicalCard.getByRole("link", { name: /Abrir dashboard/ }).click();
  await expect(page).toHaveURL(/\/bahmni\/clinical\/patient\/patient-programs\/dashboard\?/);
  expect(new URL(page.url()).searchParams.get("enrollment")).toBe("enrollment-history");
  expect(new URL(page.url()).searchParams.get("dateCompleted")).toBe(openMrsDate(localDate(-30)));
  await page.goto("/bahmni/clinical/programs/patient/patient-programs");
  await expect(page.getByRole("heading", { name: "Paciente Sintética" })).toBeVisible();

  await page.getByRole("button", { name: "Abrir" }).click();
  const enrollmentPanel = page.locator(".program-enrollment-section");
  await enrollmentPanel.locator("label.field", { hasText: "Programa" }).first().locator("select").selectOption("program-new");
  await enrollmentPanel.locator("label.field", { hasText: "Estado del Programa" }).locator("select").selectOption("state-initial");
  await enrollmentPanel.locator("label.field", { hasText: "Consentimiento" }).locator("select").selectOption("false");
  await enrollmentPanel.locator("label.field", { hasText: "ID del programa" }).locator("input").fill("SYN-NEW");
  await enrollmentPanel.getByRole("button", { name: "Enrolar" }).click();
  await expect.poll(() => requests.createdPayloads.length).toBe(1);
  expect(requests.createdPayloads[0]).toMatchObject({ patient: "patient-programs", program: "program-new" });
  expect(requests.createdPayloads[0]?.attributes).toContainEqual({ attributeType: { uuid: "attribute-consent" }, value: "false" });

  await activeCard.getByRole("button", { name: "Editar" }).click();
  const consent = activeCard.getByLabel(/Consentimiento/);
  await expect(consent).toHaveValue("false");
  await consent.selectOption("");
  await expect(activeCard.getByRole("button", { name: "Guardar cambios" })).toBeDisabled();
  await consent.selectOption("false");
  await activeCard.getByLabel("ID del programa").fill("SYN-002");
  const startDate = activeCard.getByLabel("Fecha de inicio *");
  await startDate.fill(localDate());
  await expect(activeCard.getByRole("alert")).toContainText("fecha de enrolamiento no puede ser posterior");
  await expect(activeCard.getByRole("button", { name: "Guardar cambios" })).toBeDisabled();
  await startDate.fill(localDate(-20));
  await activeCard.getByLabel("Estado del Programa").selectOption("state-follow-up");
  await activeCard.getByRole("button", { name: "Guardar cambios" }).click();
  await expect.poll(() => requests.updatedPayloads.filter((item) => item.uuid === "enrollment-active").length).toBe(1);
  const editPayload = requests.updatedPayloads.find((item) => item.uuid === "enrollment-active")?.body;
  expect(editPayload?.attributes).toEqual(expect.arrayContaining([
    expect.objectContaining({ uuid: "stored-consent", value: "false" }),
    expect.objectContaining({ uuid: "stored-identifier", value: "SYN-002" }),
  ]));
  expect(editPayload?.states).toHaveLength(2);

  await activeCard.getByRole("button", { name: "Editar" }).click();
  await activeCard.getByLabel("Resultado del Programa").selectOption("outcome-completed");
  await activeCard.getByRole("button", { name: "Finalizar programa" }).click();
  await expect.poll(() => requests.updatedPayloads.filter((item) => item.uuid === "enrollment-active").length).toBe(2);
  const finishPayload = requests.updatedPayloads.filter((item) => item.uuid === "enrollment-active").at(-1)?.body;
  expect(finishPayload).toMatchObject({ outcome: "outcome-completed" });
  expect(finishPayload?.dateCompleted).toContain(localDate());
  await expect(page.locator("article.program-card", { hasText: "Tratamiento activo" }).getByText("Finalizado")).toBeVisible();

  await historicalCard.getByRole("button", { name: "Anular programa" }).click();
  await page.getByLabel("Motivo de anulación *").fill("Registro sintético duplicado");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Confirmar anulación" }).click();
  await expect.poll(() => requests.updatedPayloads.some((item) => item.uuid === "enrollment-history" && item.body.voided === true)).toBe(true);
  await expect(page.locator("article.program-card", { hasText: "Programa histórico" })).toHaveCount(0);
});
