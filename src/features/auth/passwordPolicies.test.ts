import { describe, expect, it } from "vitest";
import { parsePasswordPolicies, passwordPolicyMessages } from "./passwordPolicies";

describe("legacy password policies", () => {
  it("preserves the OpenMRS policy order and configured values", () => {
    const messages = passwordPolicyMessages(parsePasswordPolicies({
      "security.passwordMinimumLength": "12",
      "security.passwordRequiresDigit": "true",
      "security.passwordRequiresNonDigit": "true",
      "security.passwordCannotMatchUsername": "true",
      "security.passwordRequiresUpperAndLowerCase": "true",
      "security.passwordCustomRegex": "^[A-Za-z0-9!]+$",
    }));

    expect(messages).toEqual([
      "No debe coincidir con el nombre de usuario.",
      "Debe tener un mínimo de 12 caracteres.",
      "Debe contener letras mayúsculas y minúsculas.",
      "Debe contener al menos un número.",
      "Debe contener al menos un carácter no numérico.",
      "Debe cumplir la expresión configurada: ^[A-Za-z0-9!]+$",
    ]);
  });

  it("does not invent disabled or malformed policies", () => {
    const policy = parsePasswordPolicies({
      "security.passwordMinimumLength": "invalid",
      "security.passwordRequiresDigit": "false",
      "security.passwordCustomRegex": " ",
    });

    expect(passwordPolicyMessages(policy)).toEqual([]);
    expect(policy.minimumLength).toBeUndefined();
    expect(policy.customRegex).toBeUndefined();
  });
});
