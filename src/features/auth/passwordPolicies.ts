export interface PasswordPolicyConfig {
  cannotMatchUsername: boolean;
  minimumLength?: number;
  requiresUpperAndLowerCase: boolean;
  requiresDigit: boolean;
  requiresNonDigit: boolean;
  customRegex?: string;
}

export function parsePasswordPolicies(properties: Record<string, string>): PasswordPolicyConfig {
  const minimum = Number(properties["security.passwordMinimumLength"]);
  const customRegex = properties["security.passwordCustomRegex"]?.trim();
  return {
    cannotMatchUsername: properties["security.passwordCannotMatchUsername"] === "true",
    ...(Number.isInteger(minimum) && minimum > 0 ? { minimumLength: minimum } : {}),
    requiresUpperAndLowerCase: properties["security.passwordRequiresUpperAndLowerCase"] === "true",
    requiresDigit: properties["security.passwordRequiresDigit"] === "true",
    requiresNonDigit: properties["security.passwordRequiresNonDigit"] === "true",
    ...(customRegex ? { customRegex } : {}),
  };
}

export function passwordPolicyMessages(policy: PasswordPolicyConfig): string[] {
  return [
    ...(policy.cannotMatchUsername ? ["No debe coincidir con el nombre de usuario."] : []),
    ...(policy.minimumLength ? [`Debe tener un mínimo de ${policy.minimumLength} caracteres.`] : []),
    ...(policy.requiresUpperAndLowerCase ? ["Debe contener letras mayúsculas y minúsculas."] : []),
    ...(policy.requiresDigit ? ["Debe contener al menos un número."] : []),
    ...(policy.requiresNonDigit ? ["Debe contener al menos un carácter no numérico."] : []),
    ...(policy.customRegex ? [`Debe cumplir la expresión configurada: ${policy.customRegex}`] : []),
  ];
}
