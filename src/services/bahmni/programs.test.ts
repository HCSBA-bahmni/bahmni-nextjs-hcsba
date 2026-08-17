import { afterEach, describe, expect, it, vi } from "vitest";
import { enrollPatientInProgram, getProgramAttributeTypes, getProgramDefinitions, removePatientProgramState, updatePatientProgram } from "./programs";

afterEach(() => vi.unstubAllGlobals());

describe("program management contracts", () => {
  it("loads only available program definitions", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [{ uuid: "active" }, { uuid: "retired", retired: true }] }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getProgramDefinitions()).resolves.toEqual([{ uuid: "active" }]);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("/openmrs/ws/rest/v1/program?v=default");
  });

  it("loads configurable enrollment attributes", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [{ uuid: "attribute" }] }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await getProgramAttributeTypes();
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/openmrs/ws/rest/v1/programattributetype?v=custom:");
  });

  it("sends the legacy-compatible enrollment payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ uuid: "enrollment" }), { status: 201, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await enrollPatientInProgram({ patientUuid: "patient", programUuid: "program", dateEnrolled: "2026-08-14T00:00:00.000-0400", stateUuid: "state", attributes: [{ attributeType: { uuid: "attribute" }, value: "value" }] });
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("/openmrs/ws/rest/v1/bahmniprogramenrollment");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "POST", body: JSON.stringify({ patient: "patient", program: "program", dateEnrolled: "2026-08-14T00:00:00.000-0400", states: [{ state: "state", startDate: "2026-08-14T00:00:00.000-0400" }], attributes: [{ attributeType: { uuid: "attribute" }, value: "value" }] }) });
  });

  it("updates an active program through the legacy enrollment endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ uuid: "enrollment" }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await updatePatientProgram("enrollment uuid", { dateEnrolled: "2026-08-14T00:00:00.000-0400", states: [], dateCompleted: null, outcome: null, attributes: [] });
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("/openmrs/ws/rest/v1/bahmniprogramenrollment/enrollment%20uuid");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "POST", body: JSON.stringify({ dateEnrolled: "2026-08-14T00:00:00.000-0400", states: [], dateCompleted: null, outcome: null, attributes: [] }) });
  });

  it("uses the same update contract to void a program with an audit reason", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ uuid: "enrollment" }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await updatePatientProgram("enrollment", { dateEnrolled: "2026-08-14T00:00:00.000-0400", states: [], dateCompleted: null, outcome: null, attributes: [], voided: true, voidReason: "Registro duplicado" });
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ body: JSON.stringify({ dateEnrolled: "2026-08-14T00:00:00.000-0400", states: [], dateCompleted: null, outcome: null, attributes: [], voided: true, voidReason: "Registro duplicado" }) });
  });

  it("removes the current state using the legacy program-enrollment state endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await removePatientProgramState("enrollment", "state");
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("/openmrs/ws/rest/v1/programenrollment/enrollment/state/state");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "DELETE", body: JSON.stringify({ "!purge": "", reason: "User deleted the state." }) });
  });
});
