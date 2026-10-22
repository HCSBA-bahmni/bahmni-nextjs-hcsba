import { z } from "zod";
import { formatChileRun, normalizeChileRun, validateChileRun } from "@/config-compat/validators";
import type { IdentifierType } from "@/services/bahmni/metadata";
import type { PatientFormValues } from "@/types/bahmni";

const identifierSchema = z.object({ system: z.string().optional(), value: z.string().optional() }).loose();
const nameSchema = z.object({
  use: z.string().optional(), family: z.string().optional(), given: z.array(z.string()).optional(),
  _family: z.object({ extension: z.array(z.object({ url: z.string().optional(), valueString: z.string().optional() }).loose()).optional() }).loose().optional(),
}).loose();
const patientSchema = z.object({
  resourceType: z.literal("Patient"), id: z.string().optional(), identifier: z.array(identifierSchema).optional(),
  name: z.array(nameSchema).optional(), gender: z.string().optional(), birthDate: z.string().optional(),
}).loose();
const bundleSchema = z.object({
  resourceType: z.literal("Bundle"),
  entry: z.array(z.object({ resource: patientSchema }).loose()).optional(),
  total: z.number().optional(),
  link: z.array(z.object({ relation: z.string() }).loose()).optional(),
}).loose();
const legacyPatientSearchSchema = z.object({
  results: z.array(z.object({
    uuid: z.string(),
    identifiers: z.array(z.object({ identifier: z.string(), voided: z.boolean().optional() }).loose()).optional(),
  }).loose()),
  links: z.array(z.object({ rel: z.string() }).loose()).optional(),
}).loose();
const syncSchema = z.object({ resultado: z.string(), crid: z.string().optional(), vinculado: z.boolean().optional(), caseId: z.string().optional(), preferredUuid: z.string().optional() }).loose();

export type MpiPatient = z.infer<typeof patientSchema>;
export type MpiAdmissionMode = "off" | "preview" | "integrated";
export type MpiOutcome = "match-unique" | "no-match" | "ambiguous";
export interface MpiLookup {
  outcome: MpiOutcome;
  patients: MpiPatient[];
  source?: string;
  syncedAt?: string;
  stale: boolean;
  crid?: string;
  correlationId?: string;
}

export class MpiAdmissionError extends Error {
  constructor(message: string, public readonly status?: number) { super(message); this.name = "MpiAdmissionError"; }
}

export const mpiAdmissionMode: MpiAdmissionMode = ["preview", "integrated"].includes(process.env.NEXT_PUBLIC_MPI_ADMISSION_MODE ?? "")
  ? process.env.NEXT_PUBLIC_MPI_ADMISSION_MODE as MpiAdmissionMode : "off";

// The gateway is same-origin and owns the OpenHIM credential. Never put an OpenHIM password here.
const gatewayBase = process.env.NEXT_PUBLIC_MPI_ADMISSION_BASE ?? "/openmrs/mpi-admission-gateway";
export function gatewayPath(path: string): string {
  if (!gatewayBase.startsWith("/") || gatewayBase.startsWith("//") || gatewayBase.includes("..")) {
    throw new MpiAdmissionError("La ruta del gateway MPI debe ser del mismo origen.");
  }
  return `${gatewayBase.replace(/\/$/, "")}${path}`;
}

export function mpiDemoHref(): string {
  return gatewayPath("/demo.html");
}

async function fhirBundle(response: Response): Promise<MpiPatient[]> {
  const payload: unknown = await response.json().catch(() => undefined);
  const parsed = bundleSchema.safeParse(payload);
  if (!parsed.success) throw new MpiAdmissionError("La respuesta FHIR de identidad no tiene el formato esperado.");
  const entries = parsed.data.entry ?? [];
  if ((parsed.data.total ?? entries.length) > entries.length || parsed.data.link?.some((link) => link.relation === "next")) {
    throw new MpiAdmissionError("La búsqueda devolvió más fichas de las que se pueden revisar. Resuelva la identidad antes del alta.");
  }
  return entries.map((entry) => entry.resource);
}

export async function lookupLocalPatientByRun(run: string, signal?: AbortSignal): Promise<MpiPatient[]> {
  const response = await fetch(`/openmrs/ws/fhir2/R4/Patient?identifier=${encodeURIComponent(formatChileRun(run))}`, {
    credentials: "include", headers: { Accept: "application/fhir+json" }, signal,
  });
  if (!response.ok) throw new MpiAdmissionError("No se pudo comprobar si la ficha ya existe en OpenMRS.", response.status);
  const patients = await fhirBundle(response);
  // Some FHIR servers perform a broad identifier search. Only a matching RUN is decisive.
  const exact = patients.filter((patient) => patient.identifier?.some((identifier) => normalizeChileRun(identifier.value ?? "") === normalizeChileRun(run)));
  if (exact.length !== patients.length) throw new MpiAdmissionError("OpenMRS devolvió fichas que no se pueden verificar por RUN. Revise la búsqueda local antes de continuar.");
  if (exact.length) return exact;

  // FHIR2 indexes exact identifiers. Older OpenMRS records can hold a valid RUN
  // inside a malformed primary value such as CLRUN*12345678-5; search REST as
  // a conservative duplicate guard until those records have been reconciled.
  const legacyResponse = await fetch(`/openmrs/ws/rest/v1/patient?q=${encodeURIComponent(formatChileRun(run))}&v=full&limit=100`, {
    credentials: "include", headers: { Accept: "application/json" }, signal,
  });
  if (!legacyResponse.ok) throw new MpiAdmissionError("No se pudo revisar los identificadores heredados de OpenMRS.", legacyResponse.status);
  const legacy = legacyPatientSearchSchema.safeParse(await legacyResponse.json().catch(() => undefined));
  if (!legacy.success) throw new MpiAdmissionError("La búsqueda heredada de OpenMRS no se pudo verificar.");
  if (legacy.data.results.length >= 100 || legacy.data.links?.some((link) => link.rel === "next")) {
    throw new MpiAdmissionError("La búsqueda heredada tiene más resultados de los que se pueden revisar. Resuelva la identidad antes del alta.");
  }
  const needle = normalizeChileRun(run);
  const matched = legacy.data.results.filter((patient) => patient.identifiers?.some((identifier) => {
    if (identifier.voided) return false;
    const value = identifier.identifier.trim().toUpperCase();
    if (normalizeChileRun(value) === needle) return true;
    const composite = /^(?:CL)?(?:RUN|RUT)\*([0-9.]+-?[0-9K])$/.exec(value);
    const candidate = composite?.[1];
    return Boolean(candidate && validateChileRun(candidate) && normalizeChileRun(candidate) === needle);
  }));
  if (matched.length !== legacy.data.results.length) {
    throw new MpiAdmissionError("OpenMRS encontró posibles fichas heredadas que no se pueden verificar automáticamente. Revise la búsqueda local antes del alta.");
  }
  return Promise.all(matched.map(async ({ uuid }) => {
    const detailResponse = await fetch(`/openmrs/ws/fhir2/R4/Patient/${encodeURIComponent(uuid)}`, {
      credentials: "include", headers: { Accept: "application/fhir+json" }, signal,
    });
    if (!detailResponse.ok) throw new MpiAdmissionError("No se pudo abrir la ficha heredada de OpenMRS.", detailResponse.status);
    const detail = patientSchema.safeParse(await detailResponse.json().catch(() => undefined));
    if (!detail.success || detail.data.id !== uuid) throw new MpiAdmissionError("La ficha heredada de OpenMRS no se pudo verificar.");
    return detail.data;
  }));
}

export async function lookupMpiPatientByRun(run: string, signal?: AbortSignal, forceRefresh = false): Promise<MpiLookup> {
  const response = await fetch(gatewayPath(`/fhir/Patient?identifier=${encodeURIComponent(formatChileRun(run))}${forceRefresh ? "&_refresh=true" : ""}`), {
    credentials: "include", headers: { Accept: "application/fhir+json" }, signal,
  });
  if (!response.ok) throw new MpiAdmissionError(
    response.status === 401 || response.status === 403 ? "No tiene acceso al canal de admisión MPI." : "No fue posible consultar el MPI.",
    response.status,
  );
  const patients = await fhirBundle(response);
  const outcome = response.headers.get("X-MPI-Outcome");
  if (response.headers.get("X-MPI-Purpose") !== "admision") {
    throw new MpiAdmissionError("La consulta no fue autorizada como admisión; no se puede crear una ficha.");
  }
  const source = response.headers.get("X-MPI-Source");
  if (source !== "local" && source !== "minsal") throw new MpiAdmissionError("El MPI no informó el origen de los datos.");
  if (outcome !== "match-unique" && outcome !== "no-match" && outcome !== "ambiguous") {
    throw new MpiAdmissionError("El MPI no informó un resultado de identidad verificable.");
  }
  if ((outcome === "match-unique" && patients.length !== 1) || (outcome === "no-match" && patients.length !== 0) || (outcome === "ambiguous" && patients.length < 2)) {
    throw new MpiAdmissionError("El resultado del MPI no coincide con sus pacientes devueltos.");
  }
  return {
    outcome, patients, stale: response.headers.get("X-MPI-Stale") === "true",
    source,
    syncedAt: response.headers.get("X-MPI-Synced-At") ?? undefined,
    crid: response.headers.get("X-MPI-CRID") ?? undefined,
    correlationId: response.headers.get("X-Correlation-Id") ?? undefined,
  };
}

export async function lookupMpiIdentityForAdmission(run: string, signal?: AbortSignal): Promise<MpiLookup> {
  let lookup = await lookupMpiPatientByRun(run, signal);
  if (lookup.outcome === "no-match" && lookup.source === "local" && !lookup.stale) {
    lookup = await lookupMpiPatientByRun(run, signal, true);
  }
  return lookup;
}

export async function syncPatientWithMpi(patientUuid: string, review?: import("./localIdentity").IdentityReview): Promise<{ crid?: string }> {
  const response = await fetch(gatewayPath(`/_sync/${encodeURIComponent(patientUuid)}`), {
    method: "POST", credentials: "include", headers: { Accept: "application/json", ...(review ? { "Content-Type": "application/json" } : {}) },
    ...(review ? { body: JSON.stringify({ review }) } : {}),
  });
  if (!response.ok) throw new MpiAdmissionError("La ficha se guardó, pero no se pudo sincronizar con el MPI.", response.status);
  const result = syncSchema.safeParse(await response.json().catch(() => undefined));
  if (result.success && result.data.resultado === "revision-pendiente" && typeof result.data.caseId === "string") return {};
  const verifiedConsolidation = result.success && result.data.resultado === "consolidacion-verificada"
    && result.data.preferredUuid === patientUuid && Boolean(result.data.caseId);
  if (!result.success || (!["creado", "actualizado"].includes(result.data.resultado) && !verifiedConsolidation) || !result.data.crid || result.data.vinculado !== true) {
    throw new MpiAdmissionError("La ficha se guardó, pero su vínculo CRID sigue pendiente.");
  }
  return { crid: result.data.crid };
}

function officialName(patient: MpiPatient) { return patient.name?.find((name) => name.use !== "usual") ?? patient.name?.[0]; }

export function mpiPatientDisplay(patient: MpiPatient): { name: string; gender: string; birthDate: string } {
  const name = officialName(patient);
  return {
    name: [...(name?.given ?? []), name?.family, name?._family?.extension?.find((entry) => entry.url?.endsWith("/SegundoApellido"))?.valueString].filter(Boolean).join(" "),
    gender: { male: "Masculino", female: "Femenino", other: "Otro", unknown: "No informado" }[patient.gender ?? ""] ?? "No informado",
    birthDate: patient.birthDate ?? "No informada",
  };
}

export function mpiPatientFormSeed(patient: MpiPatient | undefined, run: string | undefined, identifierTypes: IdentifierType[]): Partial<PatientFormValues> {
  const name = patient ? officialName(patient) : undefined;
  const runType = identifierTypes.find((type) => (type.name ?? type.display) === "RUN");
  const secondFamily = name?._family?.extension?.find((entry) => entry.url?.endsWith("/SegundoApellido"))?.valueString;
  const gender = { male: "M", female: "F", other: "O", unknown: "U" }[patient?.gender ?? ""];
  return {
    givenName: name?.given?.join(" ") ?? "",
    familyName: name?.family ?? "",
    familyName2: secondFamily ?? "",
    gender: gender ?? "",
    birthDate: patient?.birthDate,
    ...(run && runType ? { additionalIdentifiers: [{ identifierTypeUuid: runType.uuid, identifier: formatChileRun(run) }] } : {}),
  };
}

export function runFromForm(values: Partial<PatientFormValues>, identifierTypes: IdentifierType[]): string | undefined {
  const primary = identifierTypes.find((type) => type.uuid === values.identifierTypeUuid);
  if ((primary?.name ?? primary?.display) === "RUN" && values.identifier) return formatChileRun(values.identifier);
  const additional = values.additionalIdentifiers?.find((item) => item.voided !== true && (identifierTypes.find((type) => type.uuid === item.identifierTypeUuid)?.name ?? identifierTypes.find((type) => type.uuid === item.identifierTypeUuid)?.display) === "RUN");
  return additional?.identifier ? formatChileRun(additional.identifier) : undefined;
}

export function hasRunChanged(original: Partial<PatientFormValues>, edited: Partial<PatientFormValues>, identifierTypes: IdentifierType[]): boolean {
  return normalizeChileRun(runFromForm(original, identifierTypes) ?? "") !== normalizeChileRun(runFromForm(edited, identifierTypes) ?? "");
}
