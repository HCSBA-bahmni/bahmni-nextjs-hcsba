import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.beforeEach(async ({ page }) => {
  await page.route("**/openmrs/ws/rest/v1/location**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: [{ uuid: "login-location", display: "OPD-1" }] }) }));
});

const boards = {
  observations: { id: "observations", extensionPointId: "org.bahmni.clinical.consultation.board", type: "link", label: "Observaciones", url: "concept-set-group/observations", order: 1 },
  diagnosis: { id: "diagnosis", extensionPointId: "org.bahmni.clinical.consultation.board", type: "link", label: "Diagnóstico", url: "diagnosis", order: 2 },
  disposition: { id: "disposition", extensionPointId: "org.bahmni.clinical.consultation.board", type: "link", label: "Disposición", url: "disposition", order: 3 },
  summary: { id: "summary", extensionPointId: "org.bahmni.clinical.consultation.board", type: "link", label: "Resumen", url: "consultation", order: 4 },
  orders: { id: "orders", extensionPointId: "org.bahmni.clinical.consultation.board", type: "link", label: "Órdenes", url: "orders", order: 5 },
  bacteriology: { id: "bacteriology", extensionPointId: "org.bahmni.clinical.consultation.board", type: "link", label: "Bacteriología", url: "bacteriology", order: 6 },
  treatment: { id: "treatment", extensionPointId: "org.bahmni.clinical.consultation.board", type: "link", label: "Tratamiento", url: "treatment", order: 7, extensionParams: { sections: { allergies: { type: "allergies", displayOrder: 2 } } } },
};
const observationForms = {
  history: { id: "history", extensionPointId: "org.bahmni.clinical.conceptSetGroup.observations", type: "link", label: "History and Examination", order: 1, extensionParams: { formName: "History and Examination", default: true } },
  vitals: { id: "vitals", extensionPointId: "org.bahmni.clinical.conceptSetGroup.observations", type: "link", label: "Vitals", order: 2, extensionParams: { formName: "Vitals", default: true } },
};

test("consultation renders configured boards and saves the unified legacy encounter contract", async ({ page }) => {
  test.setTimeout(120_000);
  let encounterPayload: Record<string, unknown> | undefined;
  let persistedEncounter: Record<string, unknown> | undefined;
  let encounterSaveCount = 0;
  let encounterReadBackCount = 0;
  let activeMedicationRequestCount = 0;
  const conditionsPayloads: unknown[] = [];
  let favouriteObsTemplates = "";
  let preferencePayload: Record<string, unknown> | undefined;
  await page.route("**/openmrs/ws/rest/v1/session**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ authenticated: true, user: { uuid: "user-1", display: "superman" }, sessionLocation: { uuid: "login-location", display: "OPD-1" } }) }));
  await page.route("**/openmrs/ws/rest/v1/user**", async (route) => {
    const user = { uuid: "user-1", username: "superman", display: "superman", privileges: [{ uuid: "clinical", name: "app:clinical" }], roles: [], userProperties: { defaultLocale: "es", favouriteObsTemplates } };
    if (route.request().method() === "POST") {
      preferencePayload = route.request().postDataJSON() as Record<string, unknown>;
      favouriteObsTemplates = String((preferencePayload.userProperties as Record<string, unknown>).favouriteObsTemplates ?? "");
      user.userProperties.favouriteObsTemplates = favouriteObsTemplates;
      return route.fulfill({ contentType: "application/json", body: JSON.stringify(user) });
    }
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: [user] }) });
  });
  await page.route("**/openmrs/ws/rest/v1/provider**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: [{ uuid: "provider-1", display: "Super Man", attributes: [] }] }) }));
  await page.route("**/openmrs/ws/rest/v1/patientprofile/patient-consultation**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ patient: { identifiers: [{ identifier: "RUN*11-1" }], person: { gender: "F", age: 36, names: [{ givenName: "Ana", familyName: "Pérez" }], attributes: [{ attributeType: { name: "email", display: "Correo" }, value: "synthetic@example.invalid" }] } } }) }));
  await page.route("**/openmrs/ws/rest/v1/visit**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: [{ uuid: "visit-1", startDatetime: "2026-08-04T10:00:00.000Z", stopDatetime: null, visitType: { uuid: "opd", display: "OPD" }, location: { uuid: "visit-location", display: "Consulta" }, encounters: [] }] }) }));
  await page.route("**/openmrs/ws/rest/v1/bahmnicore/visitLocation/login-location", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ uuid: "visit-location", display: "Consulta" }) }));
  await page.route("**/bahmni_config/openmrs/apps/clinical/app.json", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ config: { allowConsultationWhenNoOpenVisit: true, defaultVisitType: "OPD", visitTypeForRetrospectiveEntries: "Special OPD", diagnosisStatus: "Inactive", enableLabOrderOptions: ["Urgent", "NeedsPrint"], enableRadiologyOrderOptions: ["Urgent", "NeedsPrint"], orderTypeClassMap: { "Lab Samples": ["LabSet", "LabTest"], "Radiology Orders": ["Radiology"] }, otherInvestigationsMap: {} } }) }));
  await page.route("**/bahmni_config/openmrs/apps/clinical/medication.json", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ tabConfig: { allMedicationTabConfig: { inputOptionsConfig: { defaultDurationUnit: "Days", defaultInstructions: "As directed", durationUnitsFactors: [{ name: "Days", factor: 1 }], drugFormDefaults: { Tablet: { doseUnits: "Tablet", route: "Oral" } } } } } }) }));
  await page.route("**/bahmni_config/openmrs/apps/clinical/extension.json", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ ...boards, ...observationForms }) }));
  await page.route("**/implementation_config/openmrs/apps/clinical/*.json", (route) => route.fulfill({ status: 404 }));
  await page.route("**/bahmni/i18n/clinical/locale_es.json", (route) => route.fulfill({ contentType: "application/json", body: "{}" }));
  await page.route("**/bahmni_config/openmrs/i18n/clinical/locale_es.json", (route) => route.fulfill({ contentType: "application/json", body: "{}" }));
  await page.route("**/implementation_config/openmrs/i18n/clinical/locale_es.json", (route) => route.fulfill({ status: 404 }));
  await page.route("**/openmrs/ws/rest/v1/entitymapping**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: [{ mappings: [{ uuid: "consultation-type", display: "Consultation" }] }] }) }));
  await page.route("**/openmrs/ws/rest/v1/bahmnicore/bahmniencounter/find", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify(persistedEncounter ?? { encounterUuid: null, observations: [], orders: [], drugOrders: [{ uuid: "drug-order-1", drug: { uuid: "drug-1", name: "Medicamento sintético" }, dosingInstructions: { dose: 1, doseUnits: "Tablet", route: "Oral", frequency: "Once daily", duration: 5, durationUnits: "Days" }, instructions: "As directed" }] }) }));
  await page.route("**/openmrs/ws/rest/v1/encounter**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: persistedEncounter ? [{ uuid: "encounter-1", encounterDatetime: "2026-08-04T10:00:00.000Z", visit: { uuid: "visit-1" } }] : [] }) }));
  await page.route("**/openmrs/ws/rest/v1/bahmnicore/config/drugOrders", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ doseUnits: [{ name: "Tablet" }], routes: [{ name: "Oral" }], durationUnits: [{ name: "Days" }], dispensingUnits: [{ name: "Tablet" }], dosingInstructions: [{ name: "As directed" }], frequencies: [{ name: "Once daily", frequencyPerDay: 1 }], allowNonCodedDrugs: false }) }));
  await page.route("**/openmrs/ws/rest/v1/drug**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: [{ uuid: "paracetamol-650", name: "Paracetamol 650 mg", dosageForm: { display: "Tablet" }, concept: { uuid: "paracetamol", name: { name: "Paracetamol" }, names: [{ name: "Paracetamol" }, { name: "Acetaminophen" }] } }] }) }));
  await page.route("**/openmrs/ws/rest/v1/bahmnicore/drugOrders**", (route) => {
    const active = route.request().url().includes("/active");
    if (active) activeMedicationRequestCount += 1;
    const order = { uuid: "active-drug-order", drug: { uuid: "amoxicillin", name: "Amoxicillin 500 mg" }, effectiveStartDate: new Date("2026-08-02T10:00:00.000Z").getTime(), effectiveStopDate: new Date("2026-08-29T10:00:00.000Z").getTime(), provider: { name: "Super Man" }, visit: { startDateTime: new Date("2026-08-02T10:00:00.000Z").getTime() }, duration: 27, durationUnits: "Days", dosingInstructions: { dose: 1, doseUnits: "Tablet", route: "Oral", frequency: "Once daily", quantity: 27, quantityUnits: "Tablet", administrationInstructions: JSON.stringify({ instructions: "As directed" }) } };
    const newlySaved = encounterSaveCount >= 3 ? [{ ...order, uuid: "saved-paracetamol-order", drug: { uuid: "paracetamol-650", name: "Paracetamol 650 mg" }, effectiveStartDate: new Date("2026-08-05T10:00:00.000Z").getTime(), effectiveStopDate: new Date("2026-08-15T10:00:00.000Z").getTime(), duration: 10, dosingInstructions: { ...order.dosingInstructions, dose: 2, frequency: "Twice daily", quantity: 99 } }] : [];
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(active ? [order, ...newlySaved] : [order, ...newlySaved, { ...order, uuid: "old-drug-order", effectiveStartDate: new Date("2026-07-11T10:00:00.000Z").getTime(), effectiveStopDate: new Date("2026-07-18T10:00:00.000Z").getTime(), visit: { startDateTime: new Date("2026-07-11T10:00:00.000Z").getTime() } }]) });
  });
  await page.route("**/openmrs/ws/fhir2/R4/AllergyIntolerance**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ resourceType: "Bundle", entry: [{ resource: { resourceType: "AllergyIntolerance", id: "allergy-1", code: { coding: [{ display: "Chocolate" }] }, reaction: [{ substance: { coding: [{ display: "Chocolate" }] }, manifestation: [{ coding: [{ display: "Anemia" }] }], severity: "moderate" }] } }] }) }));
  await page.route("**/openmrs/ws/rest/v1/bahmnicore/diagnosis/search**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify([
    { encounterUuid: "past-encounter", existingObs: "past-diagnosis-obs", codedAnswer: { uuid: "280137006", name: "Anemia" }, certainty: "CONFIRMED", order: "PRIMARY", diagnosisDateTime: "2025-06-01T10:00:00.000Z", providers: [{ name: "Synthetic Provider" }] },
  ]) }));
  await page.route("**/openmrs/ws/rest/emrapi/conditionhistory**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify([
    { conditions: [{ uuid: "active-condition", concept: { uuid: "hypertension", name: "Hipertensión" }, status: "ACTIVE", onSetDate: "2025-01-01", additionalDetail: "Control periódico", creator: { display: "Synthetic Provider" } }] },
  ]) }));
  await page.route("**/openmrs/ws/rest/v1/concept**", (route) => {
    const name = new URL(route.request().url()).searchParams.get("name") ?? "Concept";
    if (name === "BACTERIOLOGY CONCEPT SET") return route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: [{
      uuid: "bacteriology-set", name: { name: "BACTERIOLOGY CONCEPT SET" }, setMembers: [
        { uuid: "sample-source", name: { name: "Specimen Sample Source" }, answers: [
          { uuid: "blood", name: { name: "Blood Specimen" }, names: [{ name: "Blood", conceptNameType: "SHORT" }] },
          { uuid: "blood", name: { name: "Blood Specimen" }, names: [{ name: "Blood", conceptNameType: "SHORT" }] },
          { uuid: "urine", name: { name: "Urine" } },
        ] },
        { uuid: "attributes", name: { name: "Bacteriology Additional Attributes" }, conceptClass: { name: "Bacteriology Attributes" }, setMembers: [
          { uuid: "consultation-note", name: { name: "Consultation Note" }, datatype: { name: "Text" } },
        ] },
        { uuid: "results", name: { name: "Bacteriology Results" }, conceptClass: { name: "Bacteriology Results" }, setMembers: [
          { uuid: "smear", name: { name: "Bacteriology Smear microscopy test results" }, setMembers: [
            { uuid: "smear-result", name: { name: "Bacteriology Smear result" }, datatype: { name: "Coded" }, answers: [
              { uuid: "scanty-1-3", name: { name: "Scanty 1-3" } },
              { uuid: "scanty-4-9", name: { name: "Scanty 4-9" } },
              { uuid: "not-read", name: { name: "Not read" } },
              { uuid: "negative", name: { name: "Negative" } },
            ] },
            { uuid: "smear-id", name: { name: "Bacteriology Smear test lab ID number" }, names: [{ name: "Smear test lab ID number", conceptNameType: "SHORT" }], datatype: { name: "Numeric" } },
            { uuid: "other-symptom", name: { name: "Bacteriology Diagnosed with other Symptom" }, names: [{ name: "Diagnosed with other Symptom", conceptNameType: "SHORT" }], datatype: { name: "Boolean" } },
            { uuid: "afb-date", name: { name: "Bacteriology Date of AFB smear" }, names: [{ name: "Date of AFB smear", conceptNameType: "SHORT" }], datatype: { name: "Datetime" } },
          ] },
          { uuid: "xpert", name: { name: "Bacteriology Xpert test results" }, names: [{ name: "Xpert test results", conceptNameType: "SHORT" }], setMembers: [
            { uuid: "xpert-date", name: { name: "Bacteriology Date of Xpert test" }, names: [{ name: "Date of Xpert test done", conceptNameType: "SHORT" }], datatype: { name: "Date" } },
            { uuid: "xpert-id", name: { name: "Bacteriology Xpert test ID number" }, names: [{ name: "Xpert test ID number", conceptNameType: "SHORT" }], datatype: { name: "Text" } },
            { uuid: "xpert-result", name: { name: "Bacteriology Xpert MTB result" }, names: [{ name: "Xpert MTB result", conceptNameType: "SHORT" }], datatype: { name: "Coded" }, answers: [
              { uuid: "acd", name: { name: "ACD - Active Case Detection" } },
              { uuid: "pcd", name: { name: "PCD - Passive Case Detection" } },
            ] },
          ] },
        ] },
      ],
    }] }) });
    if (name === "All Orderables") return route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: [{
      uuid: "all-orderables", name: { name: "All Orderables" }, set: true, setMembers: [
        { uuid: "lab-template", name: { name: "Lab Samples" }, names: [{ name: "Laboratory", conceptNameType: "SHORT", locale: "en" }, { name: "Lab Samples", conceptNameType: "FULLY_SPECIFIED", locale: "en" }], set: true, setMembers: [
          { uuid: "blood-category", name: { name: "Blood" }, names: [{ name: "Blood", conceptNameType: "FULLY_SPECIFIED" }], set: true, setMembers: [
            { uuid: "cbc-panel", name: { name: "Complete blood count" }, names: [{ name: "CBC", conceptNameType: "SHORT" }], conceptClass: { uuid: "lab-set", name: "LabSet", description: "Panels" }, set: true, setMembers: [{ uuid: "hemoglobin", name: { name: "Hemoglobin" }, conceptClass: { name: "LabTest" }, setMembers: [] }] },
            { uuid: "hemoglobin", name: { name: "Hemoglobin" }, names: [{ name: "Haemoglobin", conceptNameType: "SYNONYM" }], conceptClass: { uuid: "lab-test", name: "LabTest", description: "Lab tests" }, setMembers: [] },
            { uuid: "glucose", name: { name: "Glucose" }, names: [{ name: "Blood sugar", conceptNameType: "SYNONYM" }], conceptClass: { uuid: "lab-test", name: "LabTest", description: "Lab tests" }, setMembers: [] },
          ] },
          { uuid: "urine-category", name: { name: "Urine" }, names: [{ name: "Urine", conceptNameType: "FULLY_SPECIFIED" }], set: true, setMembers: [] },
        ] },
        { uuid: "radiology-template", name: { name: "Radiology Orders" }, names: [{ name: "Radiology", conceptNameType: "SHORT", locale: "en" }, { name: "Radiology Orders", conceptNameType: "FULLY_SPECIFIED", locale: "en" }], set: true, setMembers: [] },
      ],
    }] }) });
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ results: [{ uuid: `${name.replace(/\s/g, "-")}-uuid`, name: { name } }] }) });
  });
  await page.route("**/openmrs/ws/rest/v1/bahmni/terminologies/concepts**", (route) => {
    const term = new URL(route.request().url()).searchParams.get("term") ?? "";
    const concepts = term.toLocaleLowerCase().includes("diab")
      ? [{ conceptName: "coma debido a diabetes mellitus", conceptUuid: "420662003", matchedName: "coma diabético", conceptSystem: "http://snomed.info/sct" }]
      : [{ conceptName: "anemia", conceptUuid: "280137006", matchedName: "anemia", conceptSystem: "http://snomed.info/sct" }];
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(concepts) });
  });
  await page.route("**/openmrs/ws/rest/v1/bahmnicore/sql/globalproperty**", (route) => route.fulfill({ contentType: "application/json", body: "\"false\"" }));
  await page.route("**/openmrs/ws/rest/v1/bahmniie/form/latestPublishedForms**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify([
    { formName: "History and Examination", formUuid: "history-form", formVersion: 4 },
    { formName: "Vitals", formUuid: "vitals-form", formVersion: 2 },
  ]) }));
  await page.route("**/openmrs/ws/rest/v1/form/*", (route) => {
    const history = route.request().url().includes("history-form");
    const definition = history ? { name: "History and Examination", uuid: "history-form", controls: [
      { type: "label", id: 23, value: "Seleccione Other generic para registrar texto libre", translationKey: "HELP_23", properties: { location: { row: 0, column: 0 } } },
      { type: "obsGroupControl", id: 25, label: { value: "Chief Complaint Record" }, properties: { addMore: true, location: { row: 1, column: 0 } }, concept: { uuid: "group", name: "Chief Complaint Record", datatype: "N/A" }, controls: [
        { type: "obsControl", id: 26, label: { value: "Chief Complaint" }, properties: { autoComplete: true }, concept: { uuid: "complaint", name: "Chief Complaint Coded", datatype: "Coded", answers: [{ uuid: "other", displayString: "Other generic" }] } },
        { type: "obsControl", id: 27, label: { value: "Chief complaint (text)" }, concept: { uuid: "free", name: "Chief complaint (text)", datatype: "Text" } },
        { type: "obsControl", id: 28, label: { value: "Units" }, concept: { uuid: "units", name: "Units", datatype: "Coded", answers: [{ uuid: "hours", displayString: "Hours" }, { uuid: "days", displayString: "Days" }, { uuid: "weeks", displayString: "Weeks" }] } },
      ] },
    ] } : { name: "Vitals", uuid: "vitals-form", controls: [{ type: "obsControl", id: 1, label: { value: "Pulse" }, concept: { uuid: "pulse", name: "Pulse", datatype: "Numeric", description: { value: "Frecuencia del pulso medida con oxímetro periférico." } } }] };
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ resources: [{ value: JSON.stringify(definition) }] }) });
  });
  await page.route("**/openmrs/ws/rest/v1/bahmniie/form/translations**", (route) => route.fulfill({ contentType: "application/json", body: "{}" }));
  await page.route("**/openmrs/ws/rest/v1/bahmnicore/bahmniencounter", async (route) => {
    encounterSaveCount += 1;
    encounterPayload = route.request().postDataJSON() as Record<string, unknown>;
    const codedDrugWithRedundantConcept = (encounterPayload.drugOrders as Array<Record<string, unknown>> | undefined)?.some((order) => Boolean(order.drug) && Object.hasOwn(order, "concept"));
    if (codedDrugWithRedundantConcept) return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: { message: "Coded drug orders must derive their concept from drug." } }) });
    const extensions = encounterPayload.extensions as Record<string, unknown> | undefined;
    const observationHasObjectConceptClass = (value: unknown): boolean => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return false;
      const observation = value as Record<string, unknown>;
      const concept = observation.concept as Record<string, unknown> | undefined;
      return Boolean(concept?.conceptClass && typeof concept.conceptClass === "object")
        || (Array.isArray(observation.groupMembers) && observation.groupMembers.some(observationHasObjectConceptClass));
    };
    const invalidBacteriologyConcept = (extensions?.mdrtbSpecimen as Array<Record<string, unknown>> | undefined)?.some((specimen) => observationHasObjectConceptClass((specimen.report as Record<string, unknown> | undefined)?.results));
    if (invalidBacteriologyConcept) return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: { message: "Bacteriology conceptClass must not be a REST object." } }) });
    const persistObservation = (value: unknown, path: string): unknown => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return value;
      const observation = value as Record<string, unknown>;
      return {
        ...observation,
        ...(observation.concept ? { uuid: observation.uuid ?? `saved-obs-${path}` } : {}),
        ...(Array.isArray(observation.groupMembers) ? { groupMembers: observation.groupMembers.map((member, memberIndex) => persistObservation(member, `${path}-${memberIndex}`)) } : {}),
      };
    };
    const specimens = (extensions?.mdrtbSpecimen as Array<Record<string, unknown>> | undefined)?.flatMap((specimen, index) => {
      if (specimen.voided === true) return [];
      const sample = specimen.sample as Record<string, unknown> | undefined;
      const report = specimen.report as Record<string, unknown> | undefined;
      return [{
        ...specimen,
        uuid: specimen.uuid ?? `saved-specimen-${index}`,
        dateCollected: typeof specimen.dateCollected === "string" ? Date.parse(`${specimen.dateCollected}T00:00:00.000Z`) : specimen.dateCollected,
        ...(sample ? { sample: { ...sample, additionalAttributes: persistObservation(sample.additionalAttributes, `${index}-attributes`) } } : {}),
        ...(report ? { report: { ...report, results: persistObservation(report.results, `${index}-results`) } } : {}),
      }];
    });
    persistedEncounter = { ...encounterPayload, encounterUuid: "encounter-1", ...(extensions ? { extensions: { ...extensions, mdrtbSpecimen: specimens ?? [] } } : {}) };
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ encounterUuid: "encounter-1" }) });
  });
  await page.route("**/openmrs/ws/rest/v1/bahmnicore/bahmniencounter/encounter-1**", async (route) => {
    encounterReadBackCount += 1;
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(persistedEncounter ?? { encounterUuid: "encounter-1", observations: [], orders: [], drugOrders: [] }) });
  });
  await page.route("**/openmrs/ws/rest/emrapi/condition", async (route) => {
    const payload = route.request().postDataJSON() as Array<Record<string, unknown>>;
    conditionsPayloads.push(payload);
    const containsUnqualifiedTerminologyCode = payload.some((condition) => (condition.concept as Record<string, unknown> | undefined)?.uuid === "420662003");
    if (containsUnqualifiedTerminologyCode) return route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: { message: "Concept not found" } }) });
    await route.fulfill({ contentType: "application/json", body: "[]" });
  });
  await page.route("**/openmrs/ws/rest/v1/auditlog", (route) => route.fulfill({ status: 204 }));

  await page.goto("/bahmni/clinical/patient/patient-consultation/consultation/summary?visitUuid=visit-1");
  await expect(page.getByRole("heading", { name: "Ana Pérez" })).toBeVisible();
  const boardNavigation = page.getByRole("navigation", { name: "Tableros de consulta" });
  await expect(boardNavigation.getByRole("button")).toHaveCount(7);
  await expect(page.getByRole("heading", { name: "Resumen de la consulta" })).toHaveCount(0);
  await expect(page.getByText("Anemia", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Hipertensión", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Notas de Consulta" })).toBeVisible();
  const accessibility = await new AxeBuilder({ page }).include("main").analyze();
  expect(accessibility.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? ""))).toEqual([]);
  await boardNavigation.getByRole("button", { name: "Diagnóstico" }).click();
  await expect(page.getByRole("button", { name: "Primario" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Secundario" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirmado" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Sospechado" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Inactive" })).toBeVisible();
  await page.getByRole("button", { name: "Añadir comentarios" }).click();
  await expect(page.getByRole("textbox", { name: "Comentarios" })).toBeVisible();
  await page.getByRole("button", { name: "Ocultar comentarios" }).click();
  await expect(page.getByRole("textbox", { name: "Comentarios" })).toHaveCount(0);
  const conditionInput = page.getByRole("combobox", { name: "Condición" });
  await conditionInput.fill("diab");
  const conditionResult = page.getByRole("option").filter({ hasText: "coma diabético" });
  await expect(conditionResult).toHaveCount(1);
  await expect(conditionResult).toBeVisible();
  await conditionResult.click();
  await expect(conditionInput).toHaveValue("coma diabético");
  const addConditionButton = page.locator(".consultation-condition-entry").getByRole("button", { name: "Agregar" });
  await expect(addConditionButton).toBeEnabled();
  await addConditionButton.click();
  await expect(page.locator(".consultation-condition-lists").getByText("coma diabético", { exact: true })).toBeVisible();
  const diagnosisInputs = page.locator('input[id^="diagnosis-"]');
  await expect(diagnosisInputs).toHaveCount(1);
  await diagnosisInputs.fill("anem");
  await expect(diagnosisInputs).toHaveCount(1);
  const diagnosisResult = page.getByRole("option").filter({ hasText: "anemia" });
  await expect(diagnosisResult).toHaveCount(1);
  await expect(diagnosisResult).toBeVisible();
  await diagnosisResult.click();
  await expect(diagnosisInputs).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Activo", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Añadir detalle adicional" }).click();
  await expect(page.getByRole("textbox", { name: "Detalle adicional" })).toBeVisible();
  await page.getByRole("button", { name: "Ocultar detalle adicional" }).click();
  await expect(page.getByRole("textbox", { name: "Detalle adicional" })).toHaveCount(0);
  await expect(page.getByText("Diagnósticos anteriores")).toBeVisible();
  await page.getByText("Diagnósticos anteriores").click();
  await expect(page.getByText("Anemia", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Condiciones activas" })).toBeVisible();
  await expect(page.getByText("Hipertensión", { exact: true })).toBeVisible();
  await expect(page.getByText(/01 ene 2025/i)).toBeVisible();
  await expect(page.locator(".consultation-condition-actions").getByRole("button", { name: "Historial de" })).toHaveCount(2);
  await expect(page.locator(".consultation-condition-actions").getByRole("button", { name: "Inactivo" })).toHaveCount(2);
  await boardNavigation.getByRole("button", { name: "Resumen" }).click();
  await page.getByRole("button", { name: "Guardar y continuar" }).click();
  await expect(page.getByText("Anemia", { exact: true })).toBeVisible();
  await expect(page.getByText("Hipertensión", { exact: true })).toHaveCount(0);
  await page.getByLabel("Notas de Consulta").fill("Control clínico estable");
  await page.locator(".consultation-patient-header").getByRole("button", { name: "Guardar" }).click();
  await expect.poll(() => encounterSaveCount).toBe(2);
  await expect(page.getByText("Consulta guardada.")).toBeVisible();
  expect(encounterPayload).toMatchObject({ patientUuid: "patient-consultation", visitUuid: "visit-1", locationUuid: "login-location", encounterTypeUuid: "consultation-type", providers: [{ uuid: "provider-1" }] });
  expect(encounterPayload).toHaveProperty("observations.0.value", "Control clínico estable");
  expect(conditionsPayloads).toEqual(expect.arrayContaining([expect.arrayContaining([
    expect.objectContaining({ uuid: "active-condition", patientUuid: "patient-consultation", concept: expect.objectContaining({ uuid: "hypertension" }), status: "ACTIVE", onSetDate: "2025-01-01", additionalDetail: "Control periódico" }),
    expect.objectContaining({ patientUuid: "patient-consultation", concept: { uuid: "http://snomed.info/sct/420662003", name: "coma diabético" }, status: "ACTIVE" }),
  ])]));
  await boardNavigation.getByRole("button", { name: "Observaciones" }).click();
  await expect(page.getByRole("navigation", { name: "Formularios abiertos" }).getByRole("button")).toHaveCount(2);
  await expect(page.getByRole("heading", { name: "History and Examination" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Expandir todas las secciones de History and Examination" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Contraer todas las secciones de History and Examination" })).toBeVisible();
  await page.getByRole("button", { name: "Fijar History and Examination" }).click();
  await expect(page.getByRole("button", { name: "Desfijar History and Examination" })).toBeVisible();
  expect(preferencePayload).toMatchObject({ uuid: "user-1", userProperties: { favouriteObsTemplates: "History and Examination" } });
  await expect(page.getByRole("navigation", { name: "Formularios abiertos" }).getByLabel("Fijado")).toBeVisible();
  await page.getByRole("button", { name: "Contraer todas las secciones de History and Examination" }).click();
  await expect(page.getByText("Chief Complaint", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Expandir todas las secciones de History and Examination" }).click();
  const formNavigation = page.getByRole("navigation", { name: "Formularios abiertos" });
  await formNavigation.getByRole("button", { name: "Vitals" }).click();
  await page.getByRole("img", { name: /Ayuda para Pulse/ }).hover();
  await expect(page.getByText("Frecuencia del pulso medida con oxímetro periférico.")).toBeVisible();
  await expect(page.locator(".form2-help")).toHaveCount(0);
  await formNavigation.getByRole("button", { name: "History and Examination" }).click();
  await expect(page.getByText("Seleccione Other generic para registrar texto libre")).toBeVisible();
  await expect(page.getByLabel("Chief complaint (text)")).toHaveCount(0);
  const unitsField = page.locator(".form2-field").filter({ has: page.getByText("Units", { exact: true }) });
  await expect(unitsField.locator(".p-dropdown")).toHaveCount(0);
  await expect(unitsField.getByRole("button")).toHaveCount(3);
  await unitsField.getByRole("button", { name: "Hours" }).click();
  await expect(unitsField.getByRole("button", { name: "Hours" })).toHaveClass(/p-highlight/);
  await page.locator(".form2-field").filter({ has: page.getByText("Chief Complaint", { exact: true }) }).locator(".p-dropdown").click();
  await page.getByRole("option", { name: "Other generic" }).click();
  await expect(page.getByLabel("Chief complaint (text)")).toBeVisible();
  await page.getByLabel("Chief complaint (text)").fill("Synthetic complaint detail");
  await boardNavigation.getByRole("button", { name: "Órdenes" }).click();
  await page.getByRole("button", { name: "Continuar sin guardar" }).click();
  await expect(page.getByRole("button", { name: "Laboratory" })).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("navigation", { name: "Categorías de Laboratory" }).getByRole("button")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "CBC", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Hemoglobin", exact: true }).click();
  await expect(page.getByRole("button", { name: "Quitar Hemoglobin" })).toBeVisible();
  await page.getByRole("button", { name: "CBC", exact: true }).click();
  await expect(page.getByRole("button", { name: "Quitar Hemoglobin" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Quitar CBC" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Hemoglobin", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Hemoglobin", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Marcar urgente CBC" }).click();
  await expect(page.getByRole("button", { name: "Quitar urgencia de CBC" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Notas de CBC" }).click();
  await page.getByRole("textbox", { name: "Nota de la orden" }).fill("Procesar durante la visita");
  await page.getByRole("button", { name: "Necesita impresora" }).click();
  await page.getByRole("button", { name: "Aceptar", exact: true }).click();
  await expect(page.getByRole("button", { name: "Notas de CBC" })).toHaveClass(/has-notes/);
  await page.getByLabel("Buscar").fill("gluc");
  await expect(page.getByRole("button", { name: "Glucose", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "CBC", exact: true })).toHaveCount(0);
  await boardNavigation.getByRole("button", { name: "Tratamiento" }).click();
  await page.getByRole("button", { name: "Continuar sin guardar" }).click();
  await expect(page.getByRole("heading", { name: /Ordenar medicamento/ })).toBeVisible();
  await page.locator("#medication-name").fill("parac");
  const medicationResult = page.getByRole("option", { name: "Paracetamol 650 mg (Tablet)" });
  await expect(medicationResult).toBeVisible();
  await medicationResult.click();
  await expect(page.locator("#medication-name")).toHaveValue("Paracetamol 650 mg");
  await page.locator("#medication-dose").fill("2");
  await page.locator("#medication-frequency").focus();
  await page.locator("#medication-frequency").press("Space");
  await expect(page.getByRole("option", { name: "Once daily" })).toBeVisible();
  await page.getByRole("option", { name: "Once daily" }).click();
  await expect(page.locator("#medication-frequency")).toHaveValue("Once daily");
  await page.locator("#medication-duration").fill("20");
  await page.locator("#medication-duration").press("Tab");
  await expect(page.locator("#medication-dose")).toHaveValue("2");
  await expect(page.locator("#medication-dose-unit")).toHaveValue("Tablet");
  await expect(page.locator("#medication-duration")).toHaveValue("20");
  await expect(page.locator("#medication-duration-unit")).toHaveValue("Days");
  await expect(page.locator("#medication-quantity")).toHaveValue("40");
  await expect(page.locator("#medication-quantity-unit")).toHaveValue("Tablet");
  await page.locator("#medication-quantity").fill("99");
  await page.locator("#medication-quantity").press("Tab");
  await page.locator("#medication-duration").fill("10");
  await page.locator("#medication-duration").press("Tab");
  await expect(page.locator("#medication-quantity")).toHaveValue("99");
  await page.locator(".medication-editor-actions").getByRole("button", { name: "A\u00f1adir", exact: true }).click();
  await expect(page.getByRole("heading", { name: "\u00d3rdenes seleccionadas" })).toBeVisible();
  await expect(page.getByText("Paracetamol 650 mg", { exact: true })).toBeVisible();
  await page.locator(".consultation-patient-header").getByRole("button", { name: "Guardar" }).click();
  await expect.poll(() => encounterSaveCount).toBe(3);
  const savedDrugOrder = (encounterPayload?.drugOrders as Array<Record<string, unknown>>).find((order) => (order.drug as Record<string, unknown>)?.uuid === "paracetamol-650");
  expect(savedDrugOrder).toMatchObject({
    drug: { uuid: "paracetamol-650", name: "Paracetamol 650 mg" },
    duration: 10,
    durationUnits: "Days",
    scheduledDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    dosingInstructions: expect.objectContaining({ asNeeded: false, quantity: 99, quantityUnits: "Tablet" }),
  });
  expect(savedDrugOrder).not.toHaveProperty("concept");
  expect(savedDrugOrder).not.toHaveProperty("effectiveStartDate");
  await expect.poll(() => activeMedicationRequestCount).toBeGreaterThanOrEqual(2);
  await expect(page.locator(".medication-history-row").filter({ hasText: "Paracetamol 650 mg" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Alergias" })).toBeVisible();
  await expect(page.getByText("Chocolate", { exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Reciente" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Amoxicillin 500 mg", { exact: true })).toBeVisible();
  await expect(page.locator(".medication-status--active .p-tag-value").first()).toHaveCSS("color", "rgb(255, 255, 255)");
  await page.getByRole("tab", { name: "11 jul 2026" }).click();
  await expect(page.locator(".medication-status--finished .p-tag-value").first()).toHaveCSS("color", "rgb(255, 255, 255)");
  await page.getByRole("tab", { name: "Reciente" }).click();
  const medicationAccessibility = await new AxeBuilder({ page }).include(".medication-status").analyze();
  expect(medicationAccessibility.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? ""))).toEqual([]);
  await expect(page.getByRole("button", { name: "Receta PDF" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Enviar receta" })).toHaveCount(0);
  await boardNavigation.getByRole("button", { name: "Bacteriología" }).click();
  await expect(page.getByRole("heading", { name: "Detalles de la muestra" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Blood", exact: true })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Urine", exact: true })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Urine", exact: true })).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(page.getByRole("button", { name: "Urine", exact: true })).toHaveCSS("color", "rgb(21, 91, 181)");
  await page.getByRole("button", { name: "Blood", exact: true }).click();
  await expect(page.getByRole("button", { name: "Blood", exact: true })).toHaveCSS("background-color", "rgb(23, 98, 189)");
  await expect(page.getByRole("button", { name: "Blood", exact: true })).toHaveCSS("color", "rgb(255, 255, 255)");
  const collectionDate = page.getByLabel("Fecha de recolección de la muestra");
  await collectionDate.click();
  await page.getByRole("gridcell", { name: "05/08/2026", exact: true }).click();
  await expect(collectionDate).toHaveValue("05/08/2026");
  await page.getByLabel("ID de muestra").fill("sample-e2e");
  await page.getByRole("textbox", { name: "Consultation Note", exact: true }).fill("Muestra prioritaria");
  await expect(page.getByText("Bacteriology Results", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Scanty 1-3" })).toHaveCount(0);
  await page.getByText("Bacteriology Smear microscopy test results", { exact: true }).click();
  await expect(page.getByRole("button", { name: "Scanty 1-3" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Scanty 4-9" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Not read" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Negative" })).toBeVisible();
  await page.getByRole("button", { name: "Scanty 1-3" }).click();
  await page.getByRole("button", { name: "Sí", exact: true }).click();
  await expect(page.getByLabel("Hora de Date of AFB smear")).toHaveAttribute("type", "time");
  await page.getByText("Xpert test results", { exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Xpert test ID number", exact: true })).toHaveJSProperty("tagName", "TEXTAREA");
  await expect(page.getByRole("button", { name: "ACD - Active Case Detection" })).toBeVisible();
  await page.locator(".consultation-patient-header").getByRole("button", { name: "Guardar" }).click();
  await expect.poll(() => encounterSaveCount).toBe(4);
  await expect.poll(() => encounterReadBackCount).toBeGreaterThanOrEqual(4);
  expect(encounterPayload).toHaveProperty("extensions.mdrtbSpecimen.0.type.uuid", "blood");
  expect(encounterPayload).toHaveProperty("extensions.mdrtbSpecimen.0.identifier", "sample-e2e");
  expect(encounterPayload).toHaveProperty("extensions.mdrtbSpecimen.0.sample.additionalAttributes.groupMembers.0.value", "Muestra prioritaria");
  expect(encounterPayload).toHaveProperty("extensions.mdrtbSpecimen.0.report.results.groupMembers.0.groupMembers.0.value.uuid", "scanty-1-3");
  await expect(page.getByRole("heading", { name: "Muestras guardadas" })).toBeVisible();
  await expect(page.getByText("#sample-e2e", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Detalles de la muestra" })).toBeVisible();
  await page.getByRole("button", { name: "Editar Blood" }).click();
  const existingSpecimenEditor = page.locator(".bacteriology-editor").filter({ has: page.locator('input[value="sample-e2e"]') });
  await existingSpecimenEditor.getByLabel("ID de muestra").fill("sample-e2e-updated");
  await page.locator(".consultation-patient-header").getByRole("button", { name: "Guardar" }).click();
  await expect.poll(() => encounterSaveCount).toBe(5);
  await expect.poll(() => encounterReadBackCount).toBeGreaterThanOrEqual(5);
  await expect(page.getByText("#sample-e2e-updated", { exact: true })).toBeVisible();
  await expect(page.locator('.bacteriology-editor input[value="sample-e2e-updated"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Anular Blood" }).click();
  await page.getByRole("dialog", { name: "Anular muestra" }).getByRole("button", { name: "Continuar" }).click();
  await page.locator(".consultation-patient-header").getByRole("button", { name: "Guardar" }).click();
  await expect.poll(() => encounterSaveCount).toBe(6);
  await expect.poll(() => encounterReadBackCount).toBeGreaterThanOrEqual(6);
  expect(encounterPayload).toHaveProperty("extensions.mdrtbSpecimen.0.uuid", "saved-specimen-0");
  expect(encounterPayload).toHaveProperty("extensions.mdrtbSpecimen.0.voided", true);
  expect(encounterPayload).toHaveProperty("extensions.mdrtbSpecimen.0.dateCollected", "2026-08-05");
  expect(encounterPayload).toHaveProperty("extensions.mdrtbSpecimen.0.sample.additionalAttributes.voided", true);
  expect(encounterPayload).toHaveProperty("extensions.mdrtbSpecimen.0.report.results.voided", true);
  expect(encounterPayload).not.toHaveProperty("extensions.mdrtbSpecimen.0.sample.additionalAttributes.value");
  await expect(page.getByRole("heading", { name: "Muestras guardadas" })).toHaveCount(0);
  await boardNavigation.getByRole("button", { name: "Tratamiento" }).click();
  await page.locator(".medication-history-row").filter({ hasText: "Amoxicillin 500 mg" }).getByRole("button", { name: "Rellenar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Órdenes seleccionadas" })).toBeVisible();
});
