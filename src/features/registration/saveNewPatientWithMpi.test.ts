import { describe, expect, it, vi } from "vitest";
import type { IdentifierType } from "@/services/bahmni/metadata";
import type { PatientFormValues } from "@/types/bahmni";
import { MissingPatientUuidError, saveNewPatientWithMpi } from "./saveNewPatientWithMpi";

const types = [{ uuid: "run-type", name: "RUN" }] as IdentifierType[];
const values = { givenName: "Persona", familyName: "Prueba", gender: "F", attributes: {}, relationships: [], additionalIdentifiers: [{ identifierTypeUuid: "run-type", identifier: "12345678-5" }] } as PatientFormValues;

function deps() {
  const calls: string[] = [];
  return {
    calls,
    saveProfile: vi.fn(async (): Promise<Record<string, unknown>> => { calls.push("profile"); return { uuid: "patient-1" }; }),
    saveMetadata: vi.fn(async () => { calls.push("eis"); }),
    syncMpi: vi.fn(async () => { calls.push("mpi"); return { crid: "crid-1" }; }),
    uploadImage: vi.fn(async () => { calls.push("photo"); }),
    enrollBiometric: vi.fn(async () => { calls.push("biometric"); }),
  };
}

describe("new patient MPI write sequence", () => {
  it("syncs a passport-only chart when the local identity capability is enabled", async () => {
    const services = { ...deps(), localIdentityEnabled: true };
    const passport = { ...values, additionalIdentifiers: [{ identifierTypeUuid: "passport", identifier: "P000123" }] };
    await expect(saveNewPatientWithMpi(passport, false, "integrated", undefined, types, services)).resolves.toEqual({ uuid: "patient-1" });
    expect(services.calls).toEqual(["profile", "eis", "mpi"]);
    expect(services.saveProfile).toHaveBeenCalledTimes(1);
  });
  it("writes the EIS patient once, then metadata, then the CRID link", async () => {
    const services = deps();
    await expect(saveNewPatientWithMpi(values, false, "integrated", "12345678-5", types, services)).resolves.toEqual({ uuid: "patient-1" });
    expect(services.calls).toEqual(["profile", "eis", "mpi"]);
    expect(services.saveProfile).toHaveBeenCalledTimes(1);
  });

  it("does not create when the confirmed RUN changed", async () => {
    const services = deps();
    await expect(saveNewPatientWithMpi(values, false, "integrated", "20347573-K", types, services)).rejects.toThrow("Vuelva a consultar");
    expect(services.calls).toEqual([]);
  });

  it("retains the UUID and stops before MPI when EIS metadata fails", async () => {
    const services = deps();
    services.saveMetadata.mockRejectedValueOnce(new Error("metadata unavailable"));
    await expect(saveNewPatientWithMpi(values, false, "integrated", "12345678-5", types, services)).resolves.toEqual({ uuid: "patient-1", pending: "eis" });
    expect(services.calls).toEqual(["profile"]);
    expect(services.syncMpi).not.toHaveBeenCalled();
  });

  it("retains the UUID and exposes a recoverable pending MPI link", async () => {
    const services = deps();
    services.syncMpi.mockRejectedValueOnce(new Error("index unavailable"));
    await expect(saveNewPatientWithMpi(values, false, "integrated", "12345678-5", types, services)).resolves.toEqual({ uuid: "patient-1", pending: "mpi" });
    expect(services.calls).toEqual(["profile", "eis"]);
    expect(services.saveProfile).toHaveBeenCalledTimes(1);
  });

  it("leaves no-RUN records explicitly pending without calling the RUN-only mediator", async () => {
    const services = deps();
    await expect(saveNewPatientWithMpi({ ...values, additionalIdentifiers: [] }, false, "integrated", undefined, types, services)).resolves.toEqual({ uuid: "patient-1", pending: "no-run" });
    expect(services.syncMpi).not.toHaveBeenCalled();
  });

  it("does not allow a retry when OpenMRS omits the new UUID", async () => {
    const services = deps();
    services.saveProfile.mockResolvedValueOnce({});
    await expect(saveNewPatientWithMpi(values, false, "integrated", "12345678-5", types, services)).rejects.toBeInstanceOf(MissingPatientUuidError);
    expect(services.saveProfile).toHaveBeenCalledTimes(1);
  });
});
