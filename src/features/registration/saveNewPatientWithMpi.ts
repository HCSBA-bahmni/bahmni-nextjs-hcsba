import { normalizeChileRun } from "@/config-compat/validators";
import type { IdentifierType } from "@/services/bahmni/metadata";
import { runFromForm, type MpiAdmissionMode } from "@/services/mpi/admission";
import type { PatientFormValues } from "@/types/bahmni";

export type PendingRegistrationStep = "eis" | "mpi" | "no-run" | "photo" | "biometric";
export interface NewPatientSaveResult { uuid: string; pending?: PendingRegistrationStep }

export class MissingPatientUuidError extends Error {
  constructor() { super("OpenMRS no devolvió el UUID. Busque el paciente antes de intentar otra alta."); this.name = "MissingPatientUuidError"; }
}

interface SaveDependencies {
  saveProfile(values: PatientFormValues, jumpAccepted: boolean): Promise<Record<string, unknown>>;
  saveMetadata(uuid: string, values: PatientFormValues): Promise<unknown>;
  syncMpi(uuid: string): Promise<unknown>;
  uploadImage(uuid: string, image: string): Promise<unknown>;
  enrollBiometric(uuid: string, image: string): Promise<unknown>;
}

/** The UUID is retained after the first write. A later failure never triggers a second patient creation. */
export async function saveNewPatientWithMpi(
  values: PatientFormValues,
  jumpAccepted: boolean,
  mode: MpiAdmissionMode,
  confirmedRun: string | undefined,
  identifierTypes: IdentifierType[],
  deps: SaveDependencies,
): Promise<NewPatientSaveResult> {
  if (mode === "preview") throw new Error("El laboratorio MPI no permite guardar fichas clínicas.");
  const currentRun = runFromForm(values, identifierTypes);
  if (mode === "integrated" && normalizeChileRun(currentRun ?? "") !== normalizeChileRun(confirmedRun ?? "")) {
    throw new Error("El RUN cambió después de verificar la identidad. Vuelva a consultar el MPI antes de guardar.");
  }
  const saved = await deps.saveProfile(values, jumpAccepted);
  const uuid = String(saved.uuid ?? (saved.patient as { uuid?: string } | undefined)?.uuid ?? "");
  if (!uuid) throw new MissingPatientUuidError();
  try { await deps.saveMetadata(uuid, values); }
  catch { return { uuid, pending: "eis" }; }
  if (mode === "integrated") {
    if (!confirmedRun) return { uuid, pending: "no-run" };
    try { await deps.syncMpi(uuid); }
    catch { return { uuid, pending: "mpi" }; }
  }
  if (values.image) {
    try { await deps.uploadImage(uuid, values.image); }
    catch { return { uuid, pending: "photo" }; }
    if (values.biometricEnrollmentRequested) {
      try { await deps.enrollBiometric(uuid, values.image); }
      catch { return { uuid, pending: "biometric" }; }
    }
  }
  return { uuid };
}
