import { describe, expect, it } from "vitest";
import { formatChileRun, runConfiguredValidator, validateChileRun } from "./validators";

describe("validation adapters", () => {
  it("validates and formats Chilean RUN values with one to eight body digits", () => {
    expect(validateChileRun("12.345.678-5")).toBe(true);
    expect(validateChileRun("12.345.678-9")).toBe(false);
    expect(validateChileRun("6-K")).toBe(true);
    expect(validateChileRun("0-0")).toBe(false);
    expect(formatChileRun("12.345.678-5")).toBe("12345678-5");
    expect(formatChileRun("00000006 k")).toBe("6-K");
  });

  it("fails closed for remote validators", () => {
    expect(runConfiguredValidator("evalRemoteJs", "x")).toEqual({ valid: false, message: "Validador no soportado: evalRemoteJs" });
  });
});

describe("configured field rules", () => {
  it("enforces required fields", () => expect(runConfiguredValidator("required", " ").valid).toBe(false));
  it("uses configured regular expressions", () => expect(runConfiguredValidator("regex", "ana@example.org", { pattern: "^[^@]+@[^@]+$" }).valid).toBe(true));
  it("enforces minimum length", () => expect(runConfiguredValidator("minLength", "abc", { length: 4 }).valid).toBe(false));
  it("accepts a RUN with K verifier", () => expect(validateChileRun("1.000.005-K")).toBe(true));
});
