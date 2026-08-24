import { afterEach, describe, expect, it, vi } from "vitest";
import { getPatientIdentifierMetadata, savePatientIdentifierMetadata } from "./identifierMetadata";

afterEach(() => vi.unstubAllGlobals());

const values = {
  givenName: "Ana",
  familyName: "Pérez",
  gender: "F",
  attributes: {},
  relationships: [],
  additionalIdentifiers: [{
    identifier: "12345678-5",
    identifierTypeUuid: "run-type",
    metadata: { typeCode: "1", use: "official", issuerCountryCode: "152" },
  }],
};

const native = { identifierUuid: "run-id", identifierTypeUuid: "run-type", value: "12345678-5", voided: false };
const persisted = { ...native, typeCode: "1", use: "official", issuerCountryCode: "152" };

describe("EIS identifier metadata contract", () => {
  it("accepts the numeric Java date representation returned by older OpenMRS mappers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([{ ...persisted, validFrom: 1767225600000 }]), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getPatientIdentifierMetadata("patient-1")).resolves.toEqual([
      expect.objectContaining({ validFrom: "2026-01-01T00:00:00.000Z" }),
    ]);
  });

  it("resolves the native identifier UUID before posting metadata", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([native]), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify([persisted]), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(savePatientIdentifierMetadata("patient-1", values)).resolves.toEqual([expect.objectContaining({ identifierUuid: "run-id", typeCode: "1" })]);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/openmrs/ws/rest/v1/eisidentity/identifier-metadata?patientUuid=patient-1");
    const body = JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit).body));
    expect(body).toEqual({ patientUuid: "patient-1", identifiers: [{ identifierUuid: "run-id", identifierTypeUuid: "run-type", value: "12345678-5", voided: false, typeCode: "1", use: "official", issuerCountryCode: "152" }] });
  });

  it("reconciles an ambiguous POST by reading back without retrying the write", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([native]), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: "timeout" }), { status: 500, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify([persisted]), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(savePatientIdentifierMetadata("patient-1", values)).resolves.toEqual([expect.objectContaining({ typeCode: "1" })]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });

  it("reports a partial clinical write when reconciliation cannot confirm metadata", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([native]), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: "failed" }), { status: 500, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify([native]), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(savePatientIdentifierMetadata("patient-1", values)).rejects.toThrow("paciente quedó guardado");
  });
});
