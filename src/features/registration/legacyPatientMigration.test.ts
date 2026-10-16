import { describe, expect, it, vi } from "vitest";
import { BahmniApiError } from "@/services/bahmni/http";
import type { IdentifierType } from "@/services/bahmni/metadata";
import type { PatientFormValues } from "@/types/bahmni";
import { existingInstitutionalIdentifier, generateInstitutionalIdentifier, institutionalIdentifierSource, migrateLegacyPrimaryIdentifier, preMpiRunAddition, runFromLegacyPrimaryIdentifier } from "./legacyPatientMigration";

const types = [
  { uuid: "clinical-type", name: "Patient Identifier", primary: true, identifierSources: [{ uuid: "hcsba-source", name: "Identificador clínico HCSBA", prefix: "HCSBA" }] },
  { uuid: "run-type", name: "RUN", primary: false, identifierSources: [] },
] as IdentifierType[];
const original = { uuid: "patient-1", identifierUuid: "legacy-id", identifier: "RUT*12345678-5", identifierTypeUuid: "clinical-type", locationUuid: "location-1", additionalIdentifiers: [] };
const edited = { ...original, givenName: "Persona", familyName: "Prueba", gender: "F", attributes: {}, relationships: [], additionalIdentifiers: [{ identifierTypeUuid: "run-type", identifier: "12.345.678-5", locationUuid: "location-1" }] } as PatientFormValues;

describe("pre-MPI patient migration", () => {
  it("resolves the configured prefix to the IDGen source name", () => {
    expect(institutionalIdentifierSource(types, "clinical-type", "HCSBA").source).toMatchObject({
      name: "Identificador clínico HCSBA",
      prefix: "HCSBA",
    });
  });

  it("does not retry or hide an IDGen 500 before the patient write", async () => {
    const generate = vi.fn().mockRejectedValue(new BahmniApiError(500, "Internal Server Error"));
    await expect(generateInstitutionalIdentifier(types, "clinical-type", "HCSBA", generate))
      .rejects.toThrow("IDGen no pudo generar la nueva ficha HCSBA (HTTP 500). No se envió la actualización del paciente.");
    expect(generate).toHaveBeenCalledOnce();
    expect(generate).toHaveBeenCalledWith("Identificador clínico HCSBA");
  });

  it("recognizes only a valid RUN that matches the legacy primary identifier", () => {
    expect(runFromLegacyPrimaryIdentifier("CLRUN*12.345.678-5")).toBe("12345678-5");
    expect(preMpiRunAddition(original, edited, types)).toEqual({ run: "12345678-5", legacyIdentifier: "RUT*12345678-5" });
    expect(preMpiRunAddition(original, { ...edited, additionalIdentifiers: [{ identifierTypeUuid: "run-type", identifier: "20347573-K" }] }, types)).toBeUndefined();
    expect(runFromLegacyPrimaryIdentifier("RUT*12345678-0")).toBeUndefined();
  });

  it("generates a preferred HCSBA identifier and preserves the old value as an alias", () => {
    const migrated = migrateLegacyPrimaryIdentifier(original, edited, types, "HCSBA", "HCSBA9001");
    expect(migrated).toMatchObject({ identifier: "HCSBA9001", identifierUuid: undefined, identifierTypeUuid: "clinical-type", identifierSourceUuid: "hcsba-source", identifierPrefix: "HCSBA", identifierSuffix: "9001" });
    expect(migrated.additionalIdentifiers).toEqual(expect.arrayContaining([
      expect.objectContaining({ uuid: "legacy-id", identifier: "RUT*12345678-5", identifierTypeUuid: "clinical-type", voided: false }),
      expect.objectContaining({ identifierTypeUuid: "run-type", identifier: "12.345.678-5" }),
    ]));
  });

  it("promotes an existing HCSBA identifier instead of consuming another IDGen value", () => {
    const withHcsba = { ...edited, additionalIdentifiers: [...(edited.additionalIdentifiers ?? []), { uuid: "hcsba-id", identifier: "HCSBA700", identifierTypeUuid: "clinical-type", locationUuid: "location-1" }] };
    expect(existingInstitutionalIdentifier(withHcsba, types, "HCSBA")?.uuid).toBe("hcsba-id");
    const migrated = migrateLegacyPrimaryIdentifier(original, withHcsba, types, "HCSBA");
    expect(migrated).toMatchObject({ identifierUuid: "hcsba-id", identifier: "HCSBA700" });
    expect(migrated.additionalIdentifiers).not.toEqual(expect.arrayContaining([expect.objectContaining({ uuid: "hcsba-id" })]));
  });
});
