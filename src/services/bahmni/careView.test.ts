import { afterEach, describe, expect, it, vi } from "vitest";
import { createAdhocMedicationAdministration, createNonMedicationTask, ensureIpdTaskEncounter, getCareWardPatients, getIpdDrugOrderConfig, getIpdTaskProviders, getMedicationTasks, getNonMedicationTasks, getPatientMedicationTasks, getPatientNonMedicationTasks, normalizeCareTasks, searchCarePatients, searchIpdDrugs, updateCareTeamParticipant } from "./careView";

afterEach(() => vi.unstubAllGlobals());

describe("Care View OpenMRS contracts", () => {
  it("maps the admittedPatients envelope returned by the legacy ward endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      admittedPatients: [{
        patientDetails: {
          uuid: "patient",
          person: { preferredName: { givenName: "Ana", familyName: "Pérez" }, gender: "F", age: 37 },
          identifiers: [{ identifier: "RUN*1-2", preferred: true }],
        },
        bedDetails: { bedNumber: "CI-1" },
        visitDetails: { uuid: "visit", startDatetime: 1_780_000_000_000 },
        careTeamDetails: { participants: [{ uuid: "participant", providerUuid: "provider", providerName: "Profesional" }] },
        newTreatments: [{ uuid: "treatment" }],
      }],
      totalPatients: 1,
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const page = await getCareWardPatients("ward", 0, 10);

    expect(page.totalCount).toBe(1);
    expect(page.patients).toEqual([expect.objectContaining({
      uuid: "patient",
      visitUuid: "visit",
      name: "Ana Pérez",
      identifier: "RUN*1-2",
      bedNumber: "CI-1",
      hasNewTreatments: true,
      careTeamParticipants: [expect.objectContaining({ providerUuid: "provider" })],
    })]);
  });

  it("preserves legacy search keys and minimum-search endpoint contract", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [], totalCount: 0 }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await searchCarePatients("ward", "ANA", 10, 20);
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]), "https://hcsba.local");
    expect(url.pathname).toBe("/openmrs/ws/rest/v1/ipd/wards/ward/patients/search");
    expect(url.searchParams.getAll("searchKeys")).toEqual(["bedNumber", "patientIdentifier", "patientName"]);
    expect(url.searchParams.has("searchKeys[]")).toBe(false);
    expect(url.searchParams.get("searchValue")).toBe("ANA");
    expect(url.searchParams.get("offset")).toBe("10");
    expect(url.searchParams.get("limit")).toBe("20");
  });

  it("uses Unix seconds for medication schedules and milliseconds minus one minute for tasks", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const thresholds = { pastLateMinutes: 60, administeredLateMinutes: 60 };
    await getMedicationTasks(["one", "two"], 1_780_000_000_000, 1_780_007_200_000, thresholds);
    await getNonMedicationTasks(["one", "two"], 1_780_000_000_000, 1_780_007_200_000, thresholds);
    const medicationUrl = new URL(String(fetchMock.mock.calls[0]?.[0]), "https://hcsba.local");
    const taskUrl = new URL(String(fetchMock.mock.calls[1]?.[0]), "https://hcsba.local");
    expect(medicationUrl.searchParams.getAll("patientUuids")).toEqual(["one", "two"]);
    expect(medicationUrl.searchParams.get("startTime")).toBe("1780000000");
    expect(medicationUrl.searchParams.get("includePreviousSlot")).toBe("true");
    expect(taskUrl.searchParams.getAll("patientUuids")).toEqual(["one", "two"]);
    expect(taskUrl.searchParams.get("startTime")).toBe("1780000000000");
    expect(taskUrl.searchParams.get("endTime")).toBe("1780007140000");
  });

  it("matches the care-team add and void payloads", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await updateCareTeamParticipant({ patientUuid: "patient", participant: { providerUuid: "provider", startTime: 1, endTime: 2 } });
    await updateCareTeamParticipant({ patientUuid: "patient", participant: { uuid: "participant", voided: true } });
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ patientUuid: "patient", careTeamParticipantsRequest: [{ providerUuid: "provider", startTime: 1, endTime: 2 }] });
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({ patientUuid: "patient", careTeamParticipantsRequest: [{ uuid: "participant", voided: true }] });
  });

  it("normalizes nested task collections without dropping vendor fields", () => {
    const [task] = normalizeCareTasks({ results: [{ patientUuid: "patient", tasks: [{ uuid: "task", name: "Control", startTime: 1_780_000_000_000, status: "REQUESTED", vendorField: true }] }] }, "non-medication", { pastLateMinutes: 60, administeredLateMinutes: 60 });
    expect(task).toMatchObject({ uuid: "task", patientUuid: "patient", name: "Control" });
    expect(task?.extensions.vendorField).toBe(true);
  });

  it("normalizes the real non-medication task contract used by the IPD module", () => {
    const [task] = normalizeCareTasks({
      patientUuid: "patient",
      tasks: [{
        uuid: "task",
        name: "Collect patient history",
        requestedStartTime: 1_780_000_000_000,
        executionEndTime: 1_780_000_900,
        status: "COMPLETED",
        creator: { display: "Super Man" },
      }],
    }, "non-medication", { pastLateMinutes: 60, administeredLateMinutes: 60 });

    expect(task).toMatchObject({
      uuid: "task",
      patientUuid: "patient",
      name: "Collect patient history",
      scheduledTime: 1_780_000_000_000,
      completedTime: 1_780_000_900_000,
      creator: "Super Man",
    });
  });

  it("keeps the outer patient identity and restores clinician-selected time after rollover", () => {
    const tasks = normalizeCareTasks([{
      patientUuid: "real-patient",
      visitUuid: "task-encounter",
      tasks: [{
        uuid: "automatic",
        name: "Record Vitals",
        patientUuid: "task-encounter",
        requestedStartTime: 1_780_000_000_000,
        status: "REQUESTED",
        creator: { display: "daemon" },
      }, {
        uuid: "custom",
        name: "Tomar vitales",
        patientUuid: "task-encounter",
        requestedStartTime: 1_780_000_000_000,
        requestedEndTime: 1_780_003_600_000,
        status: "REQUESTED",
        creator: { display: "superman" },
      }],
    }], "non-medication", { pastLateMinutes: 60, administeredLateMinutes: 60 });

    expect(tasks).toEqual([
      expect.objectContaining({ uuid: "automatic", patientUuid: "real-patient", scheduledTime: 1_780_000_000_000 }),
      expect.objectContaining({ uuid: "custom", patientUuid: "real-patient", scheduledTime: 1_780_003_600_000 }),
    ]);
  });

  it("preserves the legacy one-minute exclusive end boundary for patient task queries", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const thresholds = { pastLateMinutes: 60, administeredLateMinutes: 60 };
    await getPatientMedicationTasks("patient", "visit", 1_780_000_000_000, 1_780_007_200_000, thresholds);
    await getPatientNonMedicationTasks("patient", "visit", 1_780_000_000_000, 1_780_007_200_000, thresholds);
    const medicationUrl = new URL(String(fetchMock.mock.calls[0]?.[0]), "https://hcsba.local");
    const taskUrl = new URL(String(fetchMock.mock.calls[1]?.[0]), "https://hcsba.local");
    expect(medicationUrl.searchParams.get("endTime")).toBe("1780007140");
    expect(taskUrl.searchParams.get("endTime")).toBe("1780007140000");
    expect(taskUrl.searchParams.get("patientUuids")).toBe("patient");
    expect(taskUrl.searchParams.has("visitUuid")).toBe(false);
  });

  it("normalizes medication slots nested inside legacy schedules", () => {
    const [task] = normalizeCareTasks({
      patientUuid: "patient",
      schedules: [{
        slots: [{
          uuid: "slot",
          startTime: 1_780_000_000,
          status: "SCHEDULED",
          order: { uuid: "order", drug: { display: "Paracetamol 500 mg" } },
        }],
      }],
    }, "medication", { pastLateMinutes: 60, administeredLateMinutes: 60 });

    expect(task).toMatchObject({
      uuid: "slot",
      patientUuid: "patient",
      kind: "medication",
      name: "Paracetamol 500 mg",
      scheduledTime: 1_780_000_000_000,
    });
  });

  it("preserves the legacy contracts used to populate the add-task form", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ doseUnits: [{ name: "Comprimido" }], routes: [{ name: "Oral" }] }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ uuid: "drug", name: "Paracetamol 500 mg", strength: "500 mg", dosageForm: { display: "Tablet" } }] }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ uuid: "provider", person: { display: "Super Man" }, retired: false }] }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getIpdDrugOrderConfig()).resolves.toEqual({ doseUnits: ["Comprimido"], routes: ["Oral"] });
    await expect(searchIpdDrugs("para")).resolves.toEqual([{ uuid: "drug", name: "Paracetamol 500 mg", strength: "500 mg", dosageForm: "Tablet" }]);
    await expect(getIpdTaskProviders()).resolves.toEqual([{ uuid: "provider", name: "Super Man" }]);

    const drugUrl = new URL(String(fetchMock.mock.calls[1]?.[0]), "https://hcsba.local");
    expect(drugUrl.pathname).toBe("/openmrs/ws/rest/v1/drug");
    expect(drugUrl.searchParams.get("s")).toBe("ordered");
    const providerUrl = new URL(String(fetchMock.mock.calls[2]?.[0]), "https://hcsba.local");
    expect(providerUrl.searchParams.get("attrName")).toBe("practitioner_type");
    expect(providerUrl.searchParams.get("attrValue")).toBe("Doctor");
  });

  it("matches the legacy create-task payloads and encounter preparation", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ uuid: "consultation" }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ encounterUuid: "encounter" }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ uuid: "administration" }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ uuid: "task" }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(ensureIpdTaskEncounter("patient", "location")).resolves.toBe("encounter");
    const medication = {
      patientUuid: "patient", drugUuid: "drug", dose: 1, doseUnits: "Comprimido", route: "Oral",
      providers: [{ providerUuid: "performer", function: "Performer" as const }, { providerUuid: "requester", function: "Witness" as const }],
      notes: [{ authorUuid: "performer", text: "Indicada" }], status: "completed" as const, administeredDateTime: 1_780_000_000,
    };
    await createAdhocMedicationAdministration(medication);
    const task = { name: "Control", requestedStartTime: 1_780_000_000_000, requestedEndTime: 1_780_000_000_000, patientUuid: "patient", encounterUuid: "encounter", intent: "ORDER" as const, taskType: "Nursing", status: "REQUESTED" as const };
    await createNonMedicationTask(task);

    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({ patientUuid: "patient", locationUuid: "location", encounterTypeUuid: "consultation" });
    expect(JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body))).toEqual(medication);
    expect(JSON.parse(String(fetchMock.mock.calls[3]?.[1]?.body))).toEqual(task);
  });
});
