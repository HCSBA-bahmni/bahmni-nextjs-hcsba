export interface AuditLogEntry {
  auditLogId: number;
  userId: string;
  patientId: string;
  eventType: string;
  messageKey: string;
  params?: unknown;
  dateCreated: string | number;
  uuid?: string;
  module: string;
}

export interface AuditLogFilters {
  startFrom: Date;
  username?: string;
  patientId?: string;
}

export interface AuditLogIndexes {
  first: number;
  last: number;
}

export interface AuditLogRequestParams {
  startFrom: string;
  username?: string;
  patientId?: string;
  lastAuditLogId?: number;
  prev?: boolean;
  defaultView?: boolean;
}

export type AuditLogAction = "initial" | "filter" | "next" | "previous" | "default";

interface RawAuditLogEntry {
  auditLogId: number;
  userId?: string | number | null;
  patientId?: string | number | null;
  eventType?: string | null;
  message?: string | null;
  dateCreated: string | number;
  uuid?: string;
  module?: string | null;
}

function present(value: string | undefined): value is string {
  return value !== undefined && value !== "";
}

export function parseAuditLogEntry(entry: RawAuditLogEntry): AuditLogEntry {
  const messageParts = (entry.message ?? "").split("~");
  return {
    auditLogId: entry.auditLogId,
    userId: entry.userId == null ? "" : String(entry.userId),
    patientId: entry.patientId == null ? "" : String(entry.patientId),
    eventType: entry.eventType ?? "",
    messageKey: messageParts[0] ?? "",
    ...(messageParts[1] !== undefined ? { params: JSON.parse(messageParts[1]) as unknown } : {}),
    dateCreated: entry.dateCreated,
    ...(entry.uuid ? { uuid: entry.uuid } : {}),
    module: entry.module ?? "",
  };
}

export function buildAuditLogRequest(
  filters: AuditLogFilters,
  action: AuditLogAction,
  indexes: AuditLogIndexes = { first: 0, last: 0 },
): AuditLogRequestParams {
  const startFrom = filters.startFrom.toISOString();
  if (action === "initial" || action === "default" || (action === "previous" && indexes.first === 0 && indexes.last === 0)) {
    return { startFrom, defaultView: true };
  }
  const base = {
    startFrom,
    ...(present(filters.username) ? { username: filters.username } : {}),
    ...(present(filters.patientId) ? { patientId: filters.patientId } : {}),
  };
  if (action === "next") return { ...base, lastAuditLogId: indexes.last };
  if (action === "previous") return { ...base, lastAuditLogId: indexes.first, prev: true };
  return base;
}

export function auditLogIndexes(entries: AuditLogEntry[], fallback: AuditLogIndexes = { first: 0, last: 0 }): AuditLogIndexes {
  if (entries.length === 0) return fallback;
  return { first: entries[0]!.auditLogId, last: entries[entries.length - 1]!.auditLogId };
}

export function displayEntriesForAction(entries: AuditLogEntry[], action: AuditLogAction): AuditLogEntry[] {
  return action === "initial" || action === "default" ? [...entries].reverse() : entries;
}

export function isFutureAuditLogDay(value: Date, now = new Date()): boolean {
  const selectedDay = new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const currentDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return selectedDay > currentDay;
}
