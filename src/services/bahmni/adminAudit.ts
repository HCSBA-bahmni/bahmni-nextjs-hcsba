import { z } from "zod";
import { parseAuditLogEntry, type AuditLogEntry, type AuditLogRequestParams } from "@/features/admin/auditLog";
import { bahmniRequest, queryString } from "./http";

const auditLogEntrySchema = z.object({
  auditLogId: z.number(),
  userId: z.union([z.string(), z.number()]).nullish(),
  patientId: z.union([z.string(), z.number()]).nullish(),
  eventType: z.string().nullish(),
  message: z.string().nullish(),
  dateCreated: z.union([z.string(), z.number()]),
  uuid: z.string().optional(),
  module: z.string().nullish(),
}).loose();

const auditLogResponseSchema = z.array(auditLogEntrySchema);

export async function getAuditLogs(params: AuditLogRequestParams): Promise<AuditLogEntry[]> {
  const response = await bahmniRequest(`/ws/rest/v1/auditlog${queryString({ ...params })}`, { schema: auditLogResponseSchema });
  return response.map(parseAuditLogEntry);
}
