import { z } from "zod";
import { bahmniRequest } from "./http";

const record = z.object({}).loose();
const results = z.object({ results: z.array(record) }).loose();

export type ProgramDefinition = z.infer<typeof record>;
export type ProgramAttributeType = z.infer<typeof record>;

export async function getProgramDefinitions(): Promise<ProgramDefinition[]> {
  const response = await bahmniRequest("/ws/rest/v1/program?v=default", { schema: results });
  return response.results.filter((program) => program.retired !== true);
}

export async function getProgramAttributeTypes(): Promise<ProgramAttributeType[]> {
  // Keep the same projection consumed by the legacy AttributeTypeMapper. The
  // answer set is nested under `concept`, not at the top level.
  const response = await bahmniRequest("/ws/rest/v1/programattributetype?v=custom:(uuid,name,description,datatypeClassname,datatypeConfig,concept)", { schema: results });
  return response.results.filter((attribute) => attribute.retired !== true);
}

export interface ProgramEnrollmentInput {
  patientUuid: string;
  programUuid: string;
  dateEnrolled: string;
  stateUuid?: string;
  attributes: Array<{ attributeType: { uuid: string }; value: string; hydratedObject?: string }>;
}

export async function enrollPatientInProgram(input: ProgramEnrollmentInput): Promise<ProgramDefinition> {
  return await bahmniRequest("/ws/rest/v1/bahmniprogramenrollment", {
    method: "POST",
    body: JSON.stringify({
      patient: input.patientUuid,
      program: input.programUuid,
      dateEnrolled: input.dateEnrolled,
      ...(input.stateUuid ? { states: [{ state: input.stateUuid, startDate: input.dateEnrolled }] } : {}),
      attributes: input.attributes,
    }),
    schema: record,
  });
}

export interface ProgramEnrollmentUpdateInput {
  dateEnrolled: string;
  states: Array<Record<string, unknown>>;
  dateCompleted: string | null;
  outcome: string | null;
  attributes: Array<Record<string, unknown>>;
  voided?: boolean;
  voidReason?: string;
}

/** Mirrors the legacy PatientProgramMapper update contract. */
export async function updatePatientProgram(enrollmentUuid: string, input: ProgramEnrollmentUpdateInput): Promise<ProgramDefinition> {
  return await bahmniRequest(`/ws/rest/v1/bahmniprogramenrollment/${encodeURIComponent(enrollmentUuid)}`, {
    method: "POST",
    body: JSON.stringify(input),
    schema: record,
  });
}

/** Removes the currently active state using Bahmni's legacy program-enrollment endpoint. */
export async function removePatientProgramState(enrollmentUuid: string, stateUuid: string): Promise<void> {
  await bahmniRequest(`/ws/rest/v1/programenrollment/${encodeURIComponent(enrollmentUuid)}/state/${encodeURIComponent(stateUuid)}`, {
    method: "DELETE",
    body: JSON.stringify({ "!purge": "", reason: "User deleted the state." }),
  });
}
