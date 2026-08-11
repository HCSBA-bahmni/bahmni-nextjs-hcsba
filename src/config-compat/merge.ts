export type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Mirrors Bahmni's config overlay: objects merge, arrays and scalar values replace. */
export function mergeConfig<T extends JsonObject>(base: T, override?: JsonObject): T {
  if (!override) return structuredClone(base);
  const result: JsonObject = structuredClone(base);
  for (const [key, value] of Object.entries(override)) {
    const current = result[key];
    result[key] = isObject(current) && isObject(value) ? mergeConfig(current, value) : structuredClone(value);
  }
  return result as T;
}

export function shouldOverrideConfig(config: JsonObject): boolean {
  return config.shouldOverRideConfig === true || config.shouldOverrideConfig === true;
}

export function mergeExtensions(...sources: Array<Record<string, unknown> | undefined>): Record<string, unknown> {
  return sources.reduce<Record<string, unknown>>((all, source) => source ? { ...all, ...source } : all, {});
}
