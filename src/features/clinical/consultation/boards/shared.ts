import type { ClinicalConceptReference } from "../types";

export const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
export const records = (value: unknown): Record<string, unknown>[] => Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item))) : [];
export const text = (value: unknown): string => typeof value === "string" ? value : "";

export function displayName(value: unknown): string {
  const source = object(value);
  const name = source.name;
  if (typeof name === "string") return name;
  const nested = object(name);
  return text(source.display) || text(source.conceptName) || text(source.matchedName) || text(nested.name) || text(nested.display) || text(source.shortName);
}

export function toConcept(value: unknown): ClinicalConceptReference | undefined {
  const source = object(value);
  const nested = object(source.concept);
  const uuid = text(source.uuid) || text(source.conceptUuid) || text(nested.uuid);
  if (!uuid) return undefined;
  return { ...source, uuid, name: displayName(source) || displayName(nested), display: text(source.display) || undefined, conceptSystem: text(source.conceptSystem) || undefined };
}

export function clientId(prefix: string): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`;
}

export function localDate(value: Date | null | undefined): string {
  if (!value) return "";
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}
