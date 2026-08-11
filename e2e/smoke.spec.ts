import { test,expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test.beforeEach(async ({ page }) => {
  await page.route("**/openmrs/ws/rest/v1/provider**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: [{ uuid: "provider-1", display: "Super Man", retired: false, attributes: [] }] }) }));
  await page.route("**/openmrs/ws/rest/v1/location**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: [{ uuid: "location-1", display: "HCSBA" }] }) }));
});
test("health endpoint",async({request})=>{const response=await request.get("/bahmni/api/health");expect(response.ok()).toBeTruthy();expect(await response.json()).toMatchObject({status:"ok",service:"bahmni-next-web"})});
test("login has no serious accessibility violations",async({page})=>{await page.goto("/bahmni/login");await expect(page.getByRole("heading",{name:"Acceso HCSBA"})).toBeVisible();const result=await new AxeBuilder({page}).include("main").analyze();expect(result.violations.filter(item=>["serious","critical"].includes(item.impact??""))).toEqual([])});
test("login form submits the password value without treating a credential 401 as OTP",async({page})=>{let authorization="";await page.route("**/openmrs/ws/rest/v1/session**",async route=>{authorization=(await route.request().allHeaders()).authorization??"";await route.fulfill({status:401,contentType:"application/json",body:JSON.stringify({error:{message:"invalid"}})})});await page.goto("/bahmni/login");const username=page.getByLabel("Usuario",{exact:true});const password=page.getByLabel("Contraseña",{exact:true});await username.fill("usuario-prueba");await password.fill("clave-prueba");await expect(username).toHaveValue("usuario-prueba");await expect(password).toHaveValue("clave-prueba");await page.getByRole("button",{name:"Ingresar",exact:true}).click();await expect(page.locator(".error-banner")).toContainText("Usuario o contraseña incorrectos.");await expect(page.getByLabel("Código de verificación")).toHaveCount(0);expect(authorization).toBe(`Basic ${Buffer.from("usuario-prueba:clave-prueba").toString("base64")}`)});

test("login treats the OpenMRS 200 unauthenticated response as invalid credentials instead of OTP", async ({ page }) => {
  await page.route("**/openmrs/ws/rest/v1/session**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ authenticated: false }) });
  });
  await page.goto("/bahmni/login");
  await page.getByLabel("Usuario", { exact: true }).fill("usuario-prueba");
  await page.getByLabel("Contraseña", { exact: true }).fill("incorrecta");
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(page.locator(".error-banner")).toContainText("Usuario o contraseña incorrectos.");
  await expect(page.getByLabel("Código de verificación")).toHaveCount(0);
});

test("login asks for OTP only after OpenMRS accepts the first factor with 204", async ({ page }) => {
  await page.route("**/openmrs/ws/rest/v1/session**", async (route) => {
    const authorization = (await route.request().allHeaders()).authorization;
    if (!authorization) return route.fulfill({ contentType: "application/json", body: JSON.stringify({ authenticated: false }) });
    return route.fulfill({ status: 204 });
  });
  await page.goto("/bahmni/login");
  await page.getByLabel("Usuario", { exact: true }).fill("usuario-otp");
  await page.getByLabel("Contraseña", { exact: true }).fill("clave-otp");
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(page.getByLabel("Código de verificación")).toBeVisible();
  await expect(page.getByRole("button", { name: "Reenviar código" })).toBeVisible();
});

test("successful login preserves the destination and requires a location", async ({ page }) => {
  await page.route("**/openmrs/ws/rest/v1/session**", async (route) => {
    const headers = await route.request().allHeaders();
    const authenticated = Boolean(headers.authorization);
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ authenticated, user: authenticated ? { uuid: "user-1", display: "superman" } : undefined }) });
  });
  await page.route("**/openmrs/ws/rest/v1/user**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify(route.request().method() === "POST" ? { uuid: "user-1", username: "superman", display: "superman", privileges: [], roles: [], userProperties: { defaultLocale: "es" } } : { results: [{ uuid: "user-1", username: "superman", display: "superman", privileges: [], roles: [], userProperties: { defaultLocale: "es" } }] }) }));
  await page.goto("/bahmni/login?returnUrl=%2Fregistration");
  await page.getByLabel("Usuario", { exact: true }).fill("superman");
  await page.getByLabel("Contraseña", { exact: true }).fill("clave-prueba");
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(page).toHaveURL(/\/bahmni\/location\?locale=es&returnUrl=%2Fregistration$/);
});

test("successful login restores the last allowed location without asking again", async ({ page, context }) => {
  let selectedLocation = "";
  await context.addCookies([{ name: "bahmni.user.location", value: JSON.stringify({ uuid: "location-1", name: "HCSBA" }), url: "http://127.0.0.1:3000" }]);
  await page.route("**/openmrs/ws/rest/v1/session**", async (route) => {
    if (route.request().method() === "POST") {
      const body = JSON.parse(route.request().postData() ?? "{}") as { sessionLocation?: string };
      selectedLocation = body.sessionLocation ?? "";
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ authenticated: true, user: { uuid: "user-1", display: "superman" }, sessionLocation: { uuid: selectedLocation, display: "HCSBA" } }) });
      return;
    }
    const headers = await route.request().allHeaders();
    const authenticated = Boolean(headers.authorization);
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ authenticated, user: authenticated ? { uuid: "user-1", display: "superman" } : undefined }) });
  });
  await page.route("**/openmrs/ws/rest/v1/user**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify(route.request().method() === "POST" ? { uuid: "user-1", username: "superman", display: "superman", privileges: [], roles: [], userProperties: { defaultLocale: "es" } } : { results: [{ uuid: "user-1", username: "superman", display: "superman", privileges: [], roles: [], userProperties: { defaultLocale: "es" } }] }) }));

  await page.goto("/bahmni/login?returnUrl=%2Fregistration");
  await page.getByLabel("Usuario", { exact: true }).fill("superman");
  await page.getByLabel("Contraseña", { exact: true }).fill("clave-prueba");
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();

  await expect(page).toHaveURL(/\/bahmni\/registration$/);
  expect(selectedLocation).toBe("location-1");
});

test("home loads HCSBA translations and normalizes legacy routes", async ({ page }) => {
  await page.route("**/openmrs/ws/rest/v1/session**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ authenticated: true, user: { uuid: "user-1", display: "superman" }, sessionLocation: { uuid: "location-1", display: "HCSBA" } }) }));
  await page.route("**/openmrs/ws/rest/v1/user**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: [{ uuid: "user-1", username: "superman", display: "superman", privileges: [], roles: [] }] }) }));
  await page.route("**/bahmni_config/openmrs/apps/home/extension.json", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ registration: { order: 1, translationKey: "MODULE_LABEL_REGISTRATION_KEY", url: "../registration/index.html", icon: "fa-user" }, clinical: { order: 2, translationKey: "MODULE_LABEL_CLINICAL_KEY", url: "../clinical/index.html#/default/patient/search", icon: "fa-stethoscope" } }) }));
  await page.route("**/implementation_config/openmrs/apps/home/extension.json", (route) => route.fulfill({ status: 404 }));
  await page.route("**/bahmni_config/openmrs/i18n/home/locale_es.json", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ MODULE_LABEL_REGISTRATION_KEY: "Registro", MODULE_LABEL_CLINICAL_KEY: "Clínico" }) }));
  await page.route("**/implementation_config/openmrs/i18n/home/locale_es.json", (route) => route.fulfill({ status: 404 }));
  await page.goto("/bahmni/home");
  const main = page.getByRole("main");
  await expect(main.getByRole("link", { name: "Registro" })).toHaveAttribute("href", "/bahmni/registration");
  await expect(main.getByRole("link", { name: "Clínico" })).toHaveAttribute("href", "/bahmni/clinical");
  await expect(page.getByText("HCSBA", { exact: true })).toBeVisible();
  const accessibility = await new AxeBuilder({ page }).include("main").analyze();
  expect(accessibility.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? ""))).toEqual([]);
});

test("clinical dashboard uses HCSBA configuration and active visit context", async ({ page }) => {
  await page.route("**/openmrs/ws/rest/v1/session**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ authenticated: true, user: { uuid: "user-1", display: "superman" }, sessionLocation: { uuid: "login-location", display: "OPD-1" } }) }));
  await page.route("**/openmrs/ws/rest/v1/user**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: [{ uuid: "user-1", username: "superman", display: "superman", privileges: [{ uuid: "clinical", name: "app:clinical" }], roles: [] }] }) }));
  await page.route("**/openmrs/ws/rest/v1/provider**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: [{ uuid: "provider-1", display: "Super Man", attributes: [] }] }) }));
  await page.route("**/bahmni_config/openmrs/apps/clinical/dashboard.json", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ general: { translationKey: "DASHBOARD_TAB_GENERAL_KEY", displayByDefault: true, sections: { patientInformation: { type: "patientInformation", translationKey: "DASHBOARD_TITLE_PATIENT_INFORMATION_KEY", displayOrder: 0, addressFields: ["cityVillage"] }, diagnosis: { type: "diagnosis", translationKey: "DASHBOARD_TITLE_DIAGNOSIS_KEY", displayOrder: 1 }, conditions: { type: "conditionsList", translationKey: "CONDITION_LIST_DISPLAY_CONTROL_TITLE", displayOrder: 3 }, visits: { type: "visits", translationKey: "DASHBOARD_TITLE_VISITS_KEY", displayOrder: 7 }, labFulfillment: { type: "ordersControl", orderType: "Lab Order", translationKey: "DASHBOARD_TITLE_LAB_ORDERS_DISPLAY_CONTROL_KEY", displayOrder: 8, dashboardConfig: { conceptNames: [] }, expandedViewConfig: { conceptNames: [], showDetailsButton: true } }, forms: { type: "formsV2React", translationKey: "Observation Forms", displayOrder: 17, dashboardConfig: { maximumNoOfVisits: 10, showEditForActiveEncounter: true } } } }, trends: { translationKey: "DASHBOARD_TAB_TRENDS_KEY", displayByDefault: false, sections: { trendsPatient: { type: "patientInformation", translationKey: "DASHBOARD_TITLE_PATIENT_INFORMATION_KEY" } } }, patientSummary: { translationKey: "DASHBOARD_TAB_PATIENT_SUMMARY_KEY", displayByDefault: false, sections: { summaryPatient: { type: "patientInformation", translationKey: "DASHBOARD_TITLE_PATIENT_INFORMATION_KEY" } } } }) }));
  await page.route("**/implementation_config/openmrs/apps/clinical/dashboard.json", (route) => route.fulfill({ status: 404 }));
  await page.route("**/bahmni_config/openmrs/i18n/clinical/locale_es.json", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ DASHBOARD_TAB_GENERAL_KEY: "General", DASHBOARD_TAB_TRENDS_KEY: "Tendencias", DASHBOARD_TAB_PATIENT_SUMMARY_KEY: "Resumen del paciente", DASHBOARD_TITLE_PATIENT_INFORMATION_KEY: "Información del paciente", DASHBOARD_TITLE_DIAGNOSIS_KEY: "Diagnóstico", CONDITION_LIST_DISPLAY_CONTROL_TITLE: "Condiciones", DASHBOARD_TITLE_VISITS_KEY: "Visitas" }) }));
  await page.route("**/implementation_config/openmrs/i18n/clinical/locale_es.json", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ DASHBOARD_TITLE_LAB_ORDERS_DISPLAY_CONTROL_KEY: "Cumplimiento de órdenes de Laboratorio", NO_FULFILMENT_MESSAGE: "No se han captado observaciones de esta orden" }) }));
  await page.route("**/bahmni/i18n/clinical/locale_es.json", (route) => route.fulfill({ contentType: "application/json", body: "{}" }));
  await page.route("**/openmrs/ws/rest/v1/patientprofile/patient-1**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ patient: { identifiers: [{ identifier: "RUN*1-9" }], person: { gender: "F", age: 36, names: [{ givenName: "Ana", familyName: "Pérez" }], addresses: [{ address1: "No configurada", cityVillage: "Santiago" }] } } }) }));
  await page.route("**/openmrs/ws/rest/v1/visit**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: [{ uuid: "visit-1", startDatetime: "2026-08-03T10:00:00.000Z", stopDatetime: null, visitType: { uuid: "opd", display: "OPD" }, location: { uuid: "visit-location", display: "Consulta" }, encounters: [] }] }) }));
  await page.route("**/openmrs/ws/rest/v1/bahmnicore/visitLocation/login-location", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ uuid: "visit-location", display: "Consulta" }) }));
  await page.route("**/openmrs/ws/rest/v1/bahmnicore/diagnosis/search**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify(Array.from({ length: 9 }, (_, index) => ({ uuid: `diagnosis-${index + 1}`, codedAnswer: { name: index === 0 ? "Hipertensión" : `Diagnóstico ${index + 1}` }, certainty: "CONFIRMED", order: "PRIMARY", diagnosisDateTime: `2026-08-${String(index + 1).padStart(2, "0")}T10:00:00.000Z` }))) }));
  await page.route("**/openmrs/ws/rest/emrapi/conditionhistory**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 450));
    await route.fulfill({ contentType: "application/json", body: JSON.stringify([{ conditions: [{ uuid: "condition-active", concept: { shortName: "Asma" }, status: "ACTIVE", onSetDate: "2025-01-01" }, { uuid: "condition-history", concept: { shortName: "Asma" }, status: "HISTORY_OF", onSetDate: "2026-01-01", previousConditionUuid: "condition-active" }] }]) });
  });
  await page.route("**/openmrs/ws/rest/v1/bahmnicore/patient/patient-1/forms**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify([{ formName: "Vitals", encounterDateTime: "2026-08-03T10:00:00.000Z", encounterUuid: "encounter-form-1", visitUuid: "visit-1", formVersion: "1", providers: [{ providerName: "Dra. HCSBA", uuid: "provider-1" }] }]) }));
  await page.route("**/openmrs/ws/rest/v1/bahmniie/form/latestPublishedForms**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify([{ uuid: "form-1", name: "Vitals", nameTranslation: "[{\"locale\":\"es\",\"display\":\"Signos vitales\"}]" }]) }));
  await page.route("**/openmrs/ws/rest/v1/bahmnicore/bahmniencounter/encounter-form-1**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ observations: [{ uuid: "obs-1", formFieldPath: "Vitals.1/1-0", concept: { uuid: "height", shortName: "Estatura" }, value: 170 }] }) }));
  await page.route("**/openmrs/ws/rest/v1/ordertype**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: [{ uuid: "lab-order-type", display: "Lab Order" }] }) }));
  await page.route("**/openmrs/ws/rest/v1/bahmnicore/orders**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify([
    { orderUuid: "lab-order-1", concept: "Absolute eosinophil count test", conceptName: "Recuento absoluto de eosinófilos", provider: "Super Man", orderDate: "2026-01-18T09:45:00.000-03:00", bahmniObservations: [] },
    { orderUuid: "lab-order-2", concept: "Blood grouping test", conceptName: "Determinación de grupo sanguíneo", provider: "Super Man", orderDate: "2026-01-18T09:45:00.000-03:00", bahmniObservations: [] },
  ]) }));
  await page.goto("/bahmni/clinical/patient/patient-1/dashboard");
  await expect(page.getByRole("heading", { name: "Ana Pérez" })).toBeVisible();
  await expect(page.getByText("RUN*1-9").first()).toBeVisible();
  await page.getByText("Hipertensión").waitFor({ state: "attached" });
  await expect(page.locator(".clinical-dashboard-loader")).toBeVisible();
  const dashboardScroll = page.getByLabel("Contenido del dashboard clínico");
  await expect.poll(() => dashboardScroll.evaluate((element) => getComputedStyle(element).overflowAnchor)).toBe("none");
  await expect.poll(() => dashboardScroll.evaluate((element) => getComputedStyle(element).opacity)).toBe("0");
  await dashboardScroll.evaluate((element) => { element.scrollTop = 180; });
  await expect.poll(() => dashboardScroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await page.getByText("Asma").waitFor({ state: "attached" });
  await expect.poll(() => dashboardScroll.evaluate((element) => element.scrollTop)).toBe(0);
  await expect.poll(() => dashboardScroll.evaluate((element) => getComputedStyle(element).opacity)).toBe("1");
  await expect(page.getByText("Hipertensión")).toBeVisible();
  await expect(page.getByText("Asma")).toBeVisible();
  await expect(page.getByText("Registro 1", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Santiago", { exact: true })).toBeVisible();
  await expect(page.getByText("No configurada", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Visita activa")).toBeVisible();
  await expect(page.getByText("Signos vitales")).toBeVisible();
  await expect(page.getByText("Dra. HCSBA")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Cumplimiento de órdenes de Laboratorio" })).toBeVisible();
  await expect(page.getByText("Absolute eosinophil count test", { exact: true })).toBeVisible();
  await expect(page.getByText("Blood grouping test", { exact: true })).toBeVisible();
  await expect(page.getByText("Determinación de grupo sanguíneo", { exact: true })).toHaveCount(0);
  await expect(page.getByText("No se han captado observaciones de esta orden", { exact: true }).filter({ visible: true })).toHaveCount(1);
  await page.getByText("Blood grouping test", { exact: true }).click();
  await expect(page.getByText("No se han captado observaciones de esta orden", { exact: true }).filter({ visible: true })).toHaveCount(2);
  const diagnosisPrimeCard = page.locator('[data-control-type="diagnosis"] > .p-card');
  await expect(diagnosisPrimeCard).toBeVisible();
  await expect(diagnosisPrimeCard.locator(".p-card-header")).toHaveCSS("background-image", /linear-gradient/);
  await expect(diagnosisPrimeCard.locator(".clinical-card-header h2")).toHaveCSS("color", "rgb(255, 255, 255)");
  await expect.poll(async () => {
    const diagnosisCard = await page.locator('[data-control-type="diagnosis"]').boundingBox();
    const conditionsCard = await page.locator('[data-control-type="conditionsList"]').boundingBox();
    return Boolean(diagnosisCard && conditionsCard && conditionsCard.y < diagnosisCard.y + diagnosisCard.height - 8);
  }).toBe(true);
  const tabs = page.getByRole("navigation", { name: "Dashboards clínicos" });
  await expect.poll(() => dashboardScroll.evaluate((element) => getComputedStyle(element).overflowY)).toBe("auto");
  const tabsTop = (await tabs.boundingBox())?.y;
  await dashboardScroll.evaluate((element) => { element.scrollTop = 240; });
  await expect.poll(() => dashboardScroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  expect((await tabs.boundingBox())?.y).toBe(tabsTop);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Ana Pérez" })).toBeVisible();
  await expect.poll(() => dashboardScroll.evaluate((element) => element.scrollTop)).toBe(0);
  await page.getByRole("button", { name: "Ver", exact: true }).click();
  await expect(page.locator("dt", { hasText: "Estatura" }).filter({ visible: true }).first()).toBeVisible();
  await expect(page.locator("dd", { hasText: "170" }).filter({ visible: true }).first()).toBeVisible();
  await expect(page.locator(".clinical-dashboard-scroll")).toHaveCSS("opacity", "1");
  const accessibility = await new AxeBuilder({ page }).include("main").analyze();
  expect(accessibility.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? ""))).toEqual([]);
  const activeDashboardTab = page.locator(".clinical-tab.selected").filter({ has: page.getByRole("button", { name: "General", exact: true }) });
  await expect(activeDashboardTab).toHaveCSS("background-image", /linear-gradient/);
  await expect(page.getByRole("button", { name: "Abrir otro dashboard", exact: true })).toHaveCSS("border-radius", "50%");
  await expect(page.getByRole("button", { name: "Tendencias", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Abrir otro dashboard", exact: true }).click();
  await page.getByRole("menuitem", { name: "Tendencias", exact: true }).click();
  await expect(page).toHaveURL(/tab=trends/);
  await expect(page.getByRole("button", { name: "Tendencias", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "General", exact: true }).click();
  await expect(page).toHaveURL(/tab=general/);
  await expect(page.getByRole("button", { name: "Cerrar Tendencias", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Cerrar Tendencias", exact: true }).click();
  await expect(page).toHaveURL(/tab=general/);
  await expect(page.getByRole("button", { name: "Tendencias", exact: true })).toHaveCount(0);
});

test("registration Form 2 preserves the published layout and latest-observations panel", async ({ page }) => {
  const formDefinition = { name: "Registration Details", uuid: "7f659037-5aa5-44cc-aced-32a4d6ed113e", version: "1", controls: [
    { type: "section", id: "1", label: { value: "Basic Details", translationKey: "SECTION_1" }, properties: { location: { row: 0, column: 0 } }, controls: [
      { type: "obsControl", id: "5", label: { value: "Height (cm)", translationKey: "HEIGHT_(CM)_5" }, properties: { location: { row: 0, column: 0 } }, concept: { uuid: "height", name: "Height (cm)", datatype: "Numeric", answers: [] } },
      { type: "obsControl", id: "4", label: { value: "Weight (kg)", translationKey: "WEIGHT_(KG)_4" }, properties: { location: { row: 1, column: 0 } }, concept: { uuid: "weight", name: "Weight (kg)", datatype: "Numeric", answers: [] } },
      { type: "obsControl", id: "21", label: { value: "Body mass index" }, properties: { location: { row: 2, column: 0 } }, concept: { uuid: "bmi", name: "Body mass index", datatype: "Numeric", answers: [] } },
      { type: "obsControl", id: "23", label: { value: "BMI Status" }, properties: { location: { row: 3, column: 0 } }, concept: { uuid: "bmi-status", name: "BMI Status", datatype: "Coded", answers: [{ uuid: "obesity", name: { name: "Obesity" } }] } },
    ] },
    { type: "section", id: "6", label: { value: "Vitals", translationKey: "SECTION_6" }, properties: { location: { row: 1, column: 0 } }, controls: [
      { type: "obsGroupControl", id: "24", label: { value: "Blood Pressure", translationKey: "BLOOD_PRESSURE_24" }, properties: { location: { row: 0, column: 0 } }, concept: { uuid: "bp", name: "Blood Pressure", datatype: "N/A", answers: [] }, controls: [
        { type: "obsControl", id: "27", label: { value: "Body position", translationKey: "BODY_POSITION_27" }, properties: { location: { row: 0, column: 0 }, dropDown: false, autoComplete: false }, concept: { uuid: "position", name: "Body position", datatype: "Coded", answers: [{ uuid: "sitting", displayString: "sitting", translationKey: "SITTING_27" }, { uuid: "recumbent", displayString: "recumbent", translationKey: "RECUMBENT_27" }] } },
      ] },
    ] },
  ] };
  let registrationSaved = false;
  const latestObservationUrls: string[] = [];
  await page.route("**/openmrs/ws/rest/v1/session**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ authenticated: true, user: { uuid: "user-1", display: "superman" }, sessionLocation: { uuid: "login-location", display: "OPD-1" } }) }));
  await page.route("**/openmrs/ws/rest/v1/user**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: [{ uuid: "user-1", username: "superman", display: "superman", privileges: [{ uuid: "edit-visits", name: "Edit Visits" }, { uuid: "delete-visits", name: "Delete Visits" }], roles: [] }] }) }));
  await page.route("**/openmrs/ws/rest/v1/provider**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: [{ uuid: "provider-1", display: "Super Man", attributes: [] }] }) }));
  await page.route("**/bahmni_config/openmrs/apps/registration/app.json", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ config: {} }) }));
  await page.route("**/implementation_config/openmrs/apps/registration/app.json", (route) => route.fulfill({ status: 404 }));
  await page.route("**/bahmni_config/openmrs/apps/registration/extension.json", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ registrationSecondPage: { extensionPointId: "org.bahmni.registration.conceptSetGroup.observations", type: "forms", requiredPrivilege: "Edit Visits", extensionParams: { formName: "Registration Details", conceptNames: ["Height (cm)", "Weight (kg)", "Body mass index", "BMI Status"], showLatest: true } } }) }));
  await page.route("**/implementation_config/openmrs/apps/registration/extension.json", (route) => route.fulfill({ status: 404 }));
  await page.route("**/bahmni/i18n/registration/locale_es.json", (route) => route.fulfill({ contentType: "application/json", body: "{}" }));
  await page.route("**/bahmni_config/openmrs/i18n/registration/locale_es.json", (route) => route.fulfill({ contentType: "application/json", body: "{}" }));
  await page.route("**/implementation_config/openmrs/i18n/registration/locale_es.json", (route) => route.fulfill({ status: 404 }));
  await page.route("**/openmrs/ws/rest/v1/patientprofile/patient-form**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ patient: { identifiers: [{ identifier: "CL192837", identifierType: { display: "Patient Identifier" } }], person: { names: [{ display: "Test Test" }] } } }) }));
  await page.route("**/openmrs/ws/rest/v1/visit**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: [{ uuid: "visit-1", startDatetime: "2026-08-03T10:00:00.000Z", stopDatetime: null, visitType: { uuid: "opd", display: "OPD" }, location: { uuid: "visit-location", display: "Consulta" }, encounters: [] }] }) }));
  await page.route("**/openmrs/ws/rest/v1/bahmnicore/visitLocation/login-location", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ uuid: "visit-location", display: "Consulta" }) }));
  await page.route("**/openmrs/ws/rest/v1/bahmnicore/config/bahmniencounter**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ encounterTypes: { REG: "reg-type" }, visitTypes: {} }) }));
  await page.route("**/openmrs/ws/rest/v1/bahmnicore/bahmniencounter/find", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ encounterUuid: null, observations: [] }) }));
  await page.route("**/openmrs/ws/rest/v1/bahmnicore/bahmniencounter", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    registrationSaved = true;
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ encounterUuid: "registration-encounter-1" }) });
  });
  await page.route("**/openmrs/ws/rest/v1/bahmniie/form/latestPublishedForms**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify([{ formName: "Registration Details", formUuid: formDefinition.uuid, formVersion: "1" }]) }));
  await page.route(`**/openmrs/ws/rest/v1/form/${formDefinition.uuid}**`, (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ resources: [{ value: JSON.stringify(formDefinition) }] }) }));
  await page.route("**/openmrs/ws/rest/v1/bahmniie/form/translations**", (route) => route.fulfill({ contentType: "application/json", body: "[{}]" }));
  await page.route("**/openmrs/ws/rest/v1/bahmnicore/observations?**", (route) => {
    latestObservationUrls.push(route.request().url());
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(registrationSaved ? [{ observationDateTime: "2026-08-03T14:26:00.000-04:00", groupMembers: [{ concept: { name: "Weight (kg)", units: "kg" }, value: 70 }, { concept: { name: "Body mass index", units: "kg/m2" }, value: 31.11 }, { concept: { name: "BMI Status" }, value: { displayString: "Obesity" } }] }] : []) });
  });
  await page.goto("/bahmni/registration/patient/patient-form/visit?visitUuid=visit-1");
  await expect(page.getByRole("heading", { name: "Detalles de Registro" })).toBeVisible();
  await expect(page.getByText("Datos básicos", { exact: true })).toBeVisible();
  await expect(page.getByText("Signos vitales", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Estatura (cm)")).toBeVisible();
  await expect(page.getByLabel("Peso (kg)")).toBeVisible();
  await expect(page.getByLabel("Body mass index")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Sentado" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Reciente" })).toBeVisible();
  await expect(page.getByText("No hay observaciones recientes.")).toBeVisible();
  await page.getByLabel("Estatura (cm)").fill("150");
  await page.getByLabel("Peso (kg)").fill("70");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("31.11 kg/m2")).toBeVisible();
  await expect(page.getByText("Obesity", { exact: true })).toBeVisible();
  expect(latestObservationUrls.length).toBeGreaterThan(1);
  expect(latestObservationUrls.every((url) => !new URL(url).searchParams.has("numberOfVisits"))).toBe(true);
  const height = await page.getByLabel("Estatura (cm)").boundingBox();
  const weight = await page.getByLabel("Peso (kg)").boundingBox();
  expect(height && weight && weight.y > height.y + height.height).toBeTruthy();
  const form = await page.locator(".form2-renderer").boundingBox();
  const recent = await page.locator(".registration-latest").boundingBox();
  expect(form && recent && recent.x > form.x + form.width).toBeTruthy();
  const accessibility = await new AxeBuilder({ page }).include("main").analyze();
  expect(accessibility.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? ""))).toEqual([]);
});

test("clinical search defaults to the active queue and keeps All as a distinct Lucene search", async ({ page }) => {
  let sqlRequests = 0;
  let luceneRequest: URL | undefined;
  await page.route("**/openmrs/ws/rest/v1/session**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ authenticated: true, user: { uuid: "user-1", display: "superman" }, sessionLocation: { uuid: "login-location", display: "OPD-1" } }) }));
  await page.route("**/openmrs/ws/rest/v1/user**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: [{ uuid: "user-1", username: "superman", display: "superman", privileges: [{ uuid: "clinical", name: "app:clinical" }], roles: [] }] }) }));
  await page.route("**/openmrs/ws/rest/v1/provider**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: [{ uuid: "provider-1", display: "Super Man", attributes: [] }] }) }));
  await page.route("**/bahmni_config/openmrs/apps/clinical/extension.json", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({
    active: { id: "active", extensionPointId: "org.bahmni.patient.search", type: "config", label: "Active", order: 1, requiredPrivilege: "app:clinical", extensionParams: { searchHandler: "emrapi.sqlSearch.activePatients", translationKey: "MODULE_LABEL_ACTIVE_KEY", forwardUrl: "#/default/patient/{{patientUuid}}/dashboard" } },
    notifications: { id: "notifications", extensionPointId: "org.bahmni.patient.search", type: "config", label: "Notifications", order: 4, requiredPrivilege: "app:clinical", extensionParams: { view: "custom", translationKey: "MODULE_LABEL_NOTIFICATIONS_KEY", templateUrl: "/legacy-notifications.html" } },
    all: { id: "all", extensionPointId: "org.bahmni.patient.search", type: "config", label: "All", order: 5, requiredPrivilege: "app:clinical", extensionParams: { translationKey: "MODULE_LABEL_ALL_KEY", forwardUrl: "#/default/patient/{{patientUuid}}/dashboard" } },
  }) }));
  await page.route("**/implementation_config/openmrs/apps/clinical/extension.json", (route) => route.fulfill({ status: 404 }));
  await page.route("**/bahmni_config/openmrs/apps/clinical/app.json", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ config: { patientSearch: { debounceSearch: false, fetchDelay: 2000, serializeSearch: false } } }) }));
  await page.route("**/implementation_config/openmrs/apps/clinical/app.json", (route) => route.fulfill({ status: 404 }));
  await page.route("**/bahmni_config/openmrs/i18n/clinical/locale_es.json", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ MODULE_LABEL_ACTIVE_KEY: "Activos", MODULE_LABEL_NOTIFICATIONS_KEY: "Notificaciones", MODULE_LABEL_ALL_KEY: "Todos" }) }));
  await page.route("**/implementation_config/openmrs/i18n/clinical/locale_es.json", (route) => route.fulfill({ status: 404 }));
  await page.route("**/bahmni/i18n/clinical/locale_es.json", (route) => route.fulfill({ contentType: "application/json", body: "{}" }));
  await page.route("**/openmrs/ws/rest/v1/bahmnicore/sql**", async (route) => {
    sqlRequests += 1;
    const request = new URL(route.request().url());
    expect(request.searchParams.get("q")).toBe("emrapi.sqlSearch.activePatients");
    expect(request.searchParams.get("location_uuid")).toBe("login-location");
    expect(request.searchParams.get("provider_uuid")).toBe("provider-1");
    await route.fulfill({ contentType: "application/json", body: JSON.stringify([{ uuid: "active-patient", identifier: "RUN*11-1", name: "Ana Activa", activeVisitUuid: "visit-active" }]) });
  });
  await page.route("**/openmrs/ws/rest/v1/bahmni/search/patient/lucene**", async (route) => {
    luceneRequest = new URL(route.request().url());
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ pageOfResults: [{ uuid: "all-patient-1", identifier: "RUN*22-2", name: "Juan Todos" }, { uuid: "all-patient-2", identifier: "RUN*33-3", name: "Juana Todos" }] }) });
  });

  await page.goto("/bahmni/clinical");
  await expect(page.getByRole("tab", { name: /Activos/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Ana Activa")).toBeVisible();
  await expect(page.getByText("RUN*11-1")).toBeVisible();
  await expect(page.getByRole("link", { name: /Ana Activa/ })).toHaveAttribute("href", "/bahmni/clinical/patient/active-patient/dashboard?visitUuid=visit-active");
  expect(sqlRequests).toBe(1);
  await page.getByLabel("Paciente por nombre o identificador").fill("11-1");
  await expect(page.getByText("Ana Activa")).toBeVisible();
  await expect(luceneRequest).toBeUndefined();

  await page.getByRole("tab", { name: "Todos" }).click();
  await page.getByLabel("Paciente por nombre o identificador").fill("jua");
  await page.getByRole("button", { name: "Buscar" }).click();
  await expect(page.getByText("Juan Todos")).toBeVisible();
  const firstCard = await page.getByRole("link", { name: /Juan Todos/ }).boundingBox();
  const secondCard = await page.getByRole("link", { name: /Juana Todos/ }).boundingBox();
  expect(firstCard?.y).toBe(secondCard?.y);
  expect(luceneRequest?.searchParams.get("q")).toBe("jua");
  expect(luceneRequest?.searchParams.get("identifier")).toBe("jua");
  expect(luceneRequest?.searchParams.get("filterOnAllIdentifiers")).toBe("true");
  expect(luceneRequest?.searchParams.has("s")).toBe(false);
  expect(luceneRequest?.searchParams.has("limit")).toBe(false);
  const accessibility = await new AxeBuilder({ page }).include("main").analyze();
  expect(accessibility.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? ""))).toEqual([]);
});

test("new patient loads dynamic HCSBA registration metadata", async ({ page }) => {
  await page.route("**/openmrs/ws/rest/v1/session**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ authenticated: true, user: { uuid: "user-1", display: "superman" }, sessionLocation: { uuid: "location-1", display: "HCSBA" } }) }));
  await page.route("**/openmrs/ws/rest/v1/user**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: [{ uuid: "user-1", username: "superman", display: "superman", privileges: [{ uuid: "priv-1", name: "Add Patients" }], roles: [] }] }) }));
  await page.route("**/bahmni_config/openmrs/apps/registration/app.json", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ config: { showBirthTime: true, isLastNameMandatory: true, defaultIdentifierPrefix: "RUN*", patientInformation: { extra: { title: "Additional Patient Information", expanded: false, attributes: ["email", "givenNameLocal"] } }, patientSearch: { customAttributes: { label: "Teléfono", fields: ["phoneNumber"] }, socialAttributes: { label: "Nombre social", fields: ["givenNameLocal"] } }, relationshipTypeMap: { Doctor: "provider" }, printOptions: [{ translationKey: "REGISTRATION_PRINT_REG_CARD_LOCAL_KEY", templateUrl: "/registration/registrationCardLayout/print_local.html" }] } }) }));
  await page.route("**/implementation_config/openmrs/apps/registration/app.json", (route) => route.fulfill({ status: 404 }));
  await page.route("**/bahmni/i18n/registration/locale_es.json", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ REGISTRATION_LABEL_SAVE: "<u>G</u>uardar paciente traducido", REGISTRATION_TITLE_ADDITIONAL_PATIENT: "Información Adicional del Paciente", REGISTRATION_PRINT_REG_CARD_LOCAL_KEY: "Tarjeta base" }) }));
  await page.route("**/bahmni_config/openmrs/i18n/registration/locale_es.json", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ REGISTRATION_PRINT_REG_CARD_LOCAL_KEY: "Tarjeta local HCSBA" }) }));
  await page.route("**/implementation_config/openmrs/i18n/registration/locale_es.json", (route) => route.fulfill({ status: 404 }));
  await page.route("**/openmrs/ws/rest/v1/idgen/identifiertype**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify([{ uuid: "id-type", name: "Patient Identifier", primary: true, required: true, format: "^RUN\\*[0-9-]+$", formatDescription: "RUN inválido", identifierSources: [{ uuid: "source-cl", name: "CL", prefix: "CL" }, { uuid: "source-run", name: "RUN*", prefix: "RUN*" }] }]) }));
  await page.route("**/openmrs/ws/rest/v1/personattributetype**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: [{ uuid: "phone-type", name: "phoneNumber", format: "java.lang.String", sortWeight: null, concept: null }, { uuid: "email-type", name: "email", format: "java.lang.String", sortWeight: null, concept: null }, { uuid: "social-type", name: "givenNameLocal", format: "java.lang.String", sortWeight: 2, concept: null }] }) }));
  await page.route("**/openmrs/ws/rest/v1/relationshiptype**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: [] }) }));
  await page.route("**/openmrs/module/addresshierarchy/ajax/getOrderedAddressHierarchyLevels.form", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify([{ name: "Región", addressField: "stateProvince" }, { name: "Comuna", addressField: "cityVillage" }]) }));
  await page.route("**/openmrs/ws/rest/v1/idgen", (route) => route.fulfill({ status: 200, contentType: "text/plain", body: "RUN*100" }));
  await page.goto("/bahmni/registration/patient/new");
  await expect(page.getByRole("heading", { name: "Nuevo paciente" })).toBeVisible();
  await expect(page.getByLabel("Fuente o prefijo del identificador", { exact: true })).toHaveValue("source-run");
  await expect(page.getByLabel("Prefijo del identificador", { exact: true })).toHaveText("RUN*");
  await page.getByRole("button", { name: "Generar identificador" }).click();
  await expect(page.getByLabel("Identificador", { exact: true })).toHaveValue("100");
  await expect(page.getByLabel("Fecha de nacimiento", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Hora de nacimiento", { exact: true })).toBeVisible();
  await page.getByLabel("Años", { exact: true }).pressSequentially("30");
  await page.getByLabel("Años", { exact: true }).press("Tab");
  await expect(page.getByLabel("Meses", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Días", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Fecha de nacimiento", { exact: true })).not.toHaveValue("");
  await expect(page.getByRole("checkbox", { name: "Fecha estimada", exact: true })).toBeChecked();
  await expect(page.locator(".actions .p-dropdown-label")).toHaveText("Tarjeta local HCSBA");
  await expect(page.getByRole("button", { name: "Guardar paciente traducido" })).toBeVisible();
  await expect(page.getByText("Otra información", { exact: true })).toBeVisible();
  await expect(page.getByText("Información Adicional del Paciente", { exact: true })).toBeVisible();
  await expect(page.getByText("Atributos configurados", { exact: true })).toHaveCount(0);
  await page.getByText("Información Adicional del Paciente", { exact: true }).click();
  await expect(page.getByLabel("email")).toBeVisible();
  await page.getByLabel("email").fill("persona@hcsba.cl");
  await expect(page.getByLabel("email")).toBeVisible();
  await expect(page.getByLabel("Región")).toBeVisible();
  await expect(page.getByText("HCSBA", { exact: true })).toBeVisible();
  const accessibility = await new AxeBuilder({ page }).include("main").analyze();
  expect(accessibility.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? ""))).toEqual([]);
});

test("registration searches existing patients through the HCSBA Lucene endpoint", async ({ page }) => {
  await page.route("**/openmrs/ws/rest/v1/session**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ authenticated: true, user: { uuid: "user-1", display: "superman" }, sessionLocation: { uuid: "location-1", display: "HCSBA" } }) }));
  await page.route("**/openmrs/ws/rest/v1/user**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: [{ uuid: "user-1", username: "superman", display: "superman", privileges: [{ uuid: "priv-1", name: "View Patients" }], roles: [] }] }) }));
  await page.route("**/bahmni_config/openmrs/apps/registration/app.json", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ config: { patientSearch: { customAttributes: { label: "Teléfono", fields: ["phoneNumber"] }, socialAttributes: { label: "Nombre social", fields: ["givenNameLocal"] } } } }) }));
  await page.route("**/implementation_config/openmrs/apps/registration/app.json", (route) => route.fulfill({ status: 404 }));
  await page.route("**/openmrs/ws/rest/v1/bahmni/search/patient/lucene**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ totalCount: 1, pageOfResults: [{ uuid: "patient-1", identifier: "RUN-1", givenName: "Ana", familyName: "Pérez", gender: "F", age: "36", customAttribute: '{"phoneNumber":"555"}', addressFieldValue: '{"cityVillage":"Santiago"}' }] }) }));
  await page.goto("/bahmni/registration?q=test&page=1");
  await expect(page.getByRole("cell", { name: "Ana Pérez" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "RUN-1" })).toBeVisible();
  await expect(page.getByText("No fue posible consultar pacientes.")).toHaveCount(0);
});
