import { afterEach, describe, expect, it, vi } from "vitest";
import { discardGesNotification, getAppointments, getDashboardDrugOrders, getDashboardOrders, getDiseaseSummaryData, getDispositions, getDrugOrderDetails, getEncountersForEncounterType, getIpdVisitMedications, getObservationEncounterUuid, getObservationFlowSheet, getObservationsByConceptUuid, getPrescribedAndActiveDrugOrders, sendPatientEmail } from "./dashboard";

afterEach(() => vi.unstubAllGlobals());

describe("dashboard legacy contracts", () => {
  it("uses visitWithLocale when a visit is selected", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("[]", { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await getDispositions({ patientUuid: "patient", visitUuid: "visit", locale: "es" });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/bahmnicore/disposition/visitWithLocale?visitUuid=visit&locale=es");
  });

  it("uses patientWithLocale for the patient dashboard disposition history", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("[]", { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await getDispositions({ patientUuid: "patient", numberOfVisits: 3, locale: "es" });
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]), "https://hcsba.local");
    expect(url.pathname).toContain("/bahmnicore/disposition/patientWithLocale");
    expect(url.searchParams.get("numberOfVisits")).toBe("3");
    expect(url.searchParams.has("visitUuid")).toBe(false);
  });

  it("repeats concept parameters exactly like orderService", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("[]", { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await getDashboardOrders({ patientUuid: "patient", conceptNames: ["A", "B"], includeObs: true });
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]), "https://hcsba.local");
    expect(url.searchParams.getAll("concept")).toEqual(["A", "B"]);
    expect(url.searchParams.get("includeObs")).toBe("true");
  });

  it("uses configured SQL names for appointments", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("[]", { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await getAppointments("patient", "upcoming");
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("q=bahmni.sqlGet.upComingAppointments");
  });

  it("preserves repeated pivot and Form 2 flow-sheet parameters", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response("{}", { status: 200, headers: { "content-type": "application/json" } })));
    vi.stubGlobal("fetch", fetchMock);
    await getDiseaseSummaryData({ patientUuid: "patient", config: { obsConcepts: ["Pulse", "Temperature"], latestCount: "5", groupBy: "obstime" } });
    await getObservationFlowSheet({ patientUuid: "patient", config: { formNames: ["Registration Details"], conceptNames: ["Weight"] } });
    const pivot = new URL(String(fetchMock.mock.calls[0]?.[0]), "https://hcsba.local");
    const flow = new URL(String(fetchMock.mock.calls[1]?.[0]), "https://hcsba.local");
    expect(pivot.searchParams.getAll("obsConcepts")).toEqual(["Pulse", "Temperature"]);
    expect(flow.searchParams.getAll("formNames")).toEqual(["Registration Details"]);
  });

  it("flattens the date buckets returned by prescribedAndActive drug orders", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ "2026-08-03": [{ uuid: "drug-1" }], "2026-08-02": [{ uuid: "drug-2" }] }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(getDashboardDrugOrders("patient")).resolves.toEqual([{ uuid: "drug-1" }, { uuid: "drug-2" }]);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("includeActiveVisit=true");
  });

  it("preserves the treatment dashboard prescribedAndActive configuration", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ visitDrugOrders: [], otherActiveDrugOrders: [] }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await getPrescribedAndActiveDrugOrders({ patientUuid: "patient", numberOfVisits: 5, showOtherActive: true, visitUuids: ["v1", "v2"], preferredLocale: "es" });
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]), "https://hcsba.local");
    expect(url.pathname).toContain("/drugOrders/prescribedAndActive");
    expect(url.searchParams.get("numberOfVisits")).toBe("5");
    expect(url.searchParams.get("getOtherActive")).toBe("true");
    expect(url.searchParams.getAll("visitUuids")).toEqual(["v1", "v2"]);
    expect(url.searchParams.get("preferredLocale")).toBe("es");
  });

  it("uses the IPD visit medication contract for the legacy-IPD treatment control", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ipdDrugOrders: [], emergencyMedications: [] }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await getIpdVisitMedications("visit/id");
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]), "https://hcsba.local");
    expect(url.pathname).toBe("/openmrs/ws/rest/v1/ipdVisit/visit%2Fid/medication");
    expect(url.searchParams.get("includes")).toBe("emergencyMedications");
  });

  it("uses the configured observation concept contract for dashboard form sections", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [] }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await getObservationsByConceptUuid({ patientUuid: "patient", conceptUuid: "concept-uuid" });
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]), "https://hcsba.local");
    expect(url.pathname).toContain("/ws/rest/v1/obs");
    expect(url.searchParams.get("patient")).toBe("patient");
    expect(url.searchParams.get("concept")).toBe("concept-uuid");
    expect(url.searchParams.get("v")).toContain("encounterDatetime");
  });

  it("resolves the encounter that owns a bacteriology observation before editing", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ uuid: "obs", encounter: { uuid: "encounter" } }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(getObservationEncounterUuid("obs/id")).resolves.toBe("encounter");
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]), "https://hcsba.local");
    expect(url.pathname).toContain("/obs/obs%2Fid");
    expect(url.searchParams.get("v")).toBe("custom:(uuid,encounter:(uuid))");
  });

  it("sends one typed attachment payload and surfaces semantic email errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ statusLine: { statusCode: 500, reasonPhrase: "mail failed" } }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(sendPatientEmail("patient/id", { mailAttachments: [{ contentType: "application/pdf", name: "orders.pdf", data: "base64" }], subject: "subject", body: "body" })).rejects.toThrow("mail failed");
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/patient/patient%2Fid/send/email");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual(expect.objectContaining({ cc: [], bcc: [], mailAttachments: [expect.objectContaining({ name: "orders.pdf" })] }));
  });

  it("uses the legacy isActive parameter name for drug order details", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("[]", { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await getDrugOrderDetails({ patientUuid: "patient", active: true, includeConceptSet: "All Other Drugs" });
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]), "https://hcsba.local");
    expect(url.searchParams.get("isActive")).toBe("true");
    expect(url.searchParams.has("active")).toBe(false);
  });

  it("requests radiology encounters with nested document observations", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [] }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await getEncountersForEncounterType("patient", "radiology-type");
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]), "https://hcsba.local");
    expect(url.searchParams.get("encounterType")).toBe("radiology-type");
    expect(url.searchParams.get("order")).toBe("desc");
    expect(url.searchParams.get("v")).toContain("groupMembers");
  });

  it("discards a pending GES notification with practitioner and PUT", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    await discardGesNotification("ges/id", "user cookie");
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]), "https://hcsba.local");
    expect(url.pathname).toContain("/ges/ges%2Fid/D");
    expect(url.searchParams.get("practitioner")).toBe("user cookie");
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ method: "PUT", credentials: "include" }));
  });
});
