export interface ValidationResult { valid: boolean; message?: string }
export type FieldValidator = (value: unknown, options?: Record<string, unknown>) => ValidationResult;

const validators: Record<string, FieldValidator> = {
  required: (value) => ({ valid: value !== undefined && value !== null && String(value).trim() !== "", message: "Campo obligatorio" }),
  regex: (value, options) => {
    const pattern = typeof options?.pattern === "string" ? options.pattern : "";
    const valid = !pattern || new RegExp(pattern).test(String(value ?? ""));
    return { valid, message: typeof options?.message === "string" ? options.message : "Formato inválido" };
  },
  chileRun: (value) => ({ valid: validateChileRun(String(value ?? "")), message: "RUN inválido" }),
  minLength: (value, options) => ({ valid: String(value ?? "").length >= Number(options?.length ?? 0), message: `Mínimo ${String(options?.length ?? 0)} caracteres` }),
};

export function validateChileRun(raw: string): boolean {
  const normalized = raw.replace(/\./g, "").replace(/-/g, "").toUpperCase();
  if (!/^\d{7,8}[\dK]$/.test(normalized)) return false;
  const body = normalized.slice(0, -1); let sum = 0; let multiplier = 2;
  for (let index = body.length - 1; index >= 0; index--) { sum += Number(body[index]) * multiplier; multiplier = multiplier === 7 ? 2 : multiplier + 1; }
  const remainder = 11 - (sum % 11); const expected = remainder === 11 ? "0" : remainder === 10 ? "K" : String(remainder);
  return normalized.at(-1) === expected;
}

export function runConfiguredValidator(name: string, value: unknown, options?: Record<string, unknown>): ValidationResult {
  const validator = validators[name];
  return validator ? validator(value, options) : { valid: false, message: `Validador no soportado: ${name}` };
}

export const supportedValidators = Object.freeze(Object.keys(validators));
