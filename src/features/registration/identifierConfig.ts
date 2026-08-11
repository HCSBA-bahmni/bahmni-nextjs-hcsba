import type { IdentifierSource, IdentifierType } from "@/services/bahmni/metadata";

export function selectIdentifierSource(identifierType: IdentifierType | undefined, preferredPrefix?: string): IdentifierSource | undefined {
  const sources = identifierType?.identifierSources ?? [];
  return sources.find((source) => source.prefix === preferredPrefix) ?? sources[0];
}

export function composeIdentifier(prefix: string | null | undefined, suffix: string): string {
  const cleanPrefix = prefix ?? "";
  const cleanSuffix = suffix.trim();
  if (!cleanSuffix) return "";
  return cleanSuffix.startsWith(cleanPrefix) ? cleanSuffix : `${cleanPrefix}${cleanSuffix}`;
}

export function identifierSuffix(identifier: string | undefined, prefix: string | null | undefined): string {
  if (!identifier) return "";
  const cleanPrefix = prefix ?? "";
  return cleanPrefix && identifier.startsWith(cleanPrefix) ? identifier.slice(cleanPrefix.length) : identifier;
}

export function validateConfiguredIdentifier(identifierType: IdentifierType | undefined, identifier: string, hasSource: boolean): { valid: boolean; message?: string } {
  if (!identifier && identifierType?.required && !hasSource) return { valid: false, message: "Identificador obligatorio" };
  if (!identifier || !identifierType?.format) return { valid: true };
  try {
    return new RegExp(identifierType.format).test(identifier)
      ? { valid: true }
      : { valid: false, message: identifierType.formatDescription ?? `El identificador no cumple el formato de ${identifierType.display ?? identifierType.name ?? "OpenMRS"}` };
  } catch {
    return { valid: false, message: "La expresión regular configurada en OpenMRS no es válida" };
  }
}
