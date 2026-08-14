import { afterEach, describe, expect, it, vi } from "vitest";
import {
  claimKeycloakLoginRedirect,
  clearKeycloakLoginRedirect,
  clearKeycloakReturnUrl,
  consumeKeycloakReturnUrl,
  getAuthMode,
  isKeycloakLogoutReturn,
  normalizeLocalReturnUrl,
  rememberKeycloakReturnUrl,
} from "./authMode";

afterEach(() => {
  vi.unstubAllEnvs();
  window.sessionStorage.clear();
});

describe("authentication mode", () => {
  it("defaults safely to the OpenMRS login", () => {
    expect(getAuthMode("")).toBe("openmrs");
    expect(getAuthMode("unexpected")).toBe("openmrs");
    expect(getAuthMode("KEYCLOAK")).toBe("keycloak");
  });

  it("accepts only local return URLs and normalizes the Next base path", () => {
    expect(normalizeLocalReturnUrl("/bahmni/clinical/patient/1")).toBe("/clinical/patient/1");
    expect(normalizeLocalReturnUrl("/bedmanagement/care-view")).toBe("/bedmanagement/care-view");
    expect(normalizeLocalReturnUrl("https://attacker.example")).toBe("/home");
    expect(normalizeLocalReturnUrl("//attacker.example")).toBe("/home");
    expect(normalizeLocalReturnUrl("/\\attacker.example")).toBe("/home");
  });

  it("keeps the destination only for the round trip through the identity provider", () => {
    rememberKeycloakReturnUrl("/bahmni/registration/search");
    expect(consumeKeycloakReturnUrl()).toBe("/registration/search");
    expect(consumeKeycloakReturnUrl()).toBe("/home");
  });

  it("clears a stale destination before global logout", () => {
    rememberKeycloakReturnUrl("/bahmni/clinical/patient/1");
    clearKeycloakReturnUrl();
    expect(consumeKeycloakReturnUrl()).toBe("/home");
  });

  it("recognizes only the explicit post-logout marker", () => {
    expect(isKeycloakLogoutReturn("1")).toBe(true);
    expect(isKeycloakLogoutReturn(["1", "0"])).toBe(true);
    expect(isKeycloakLogoutReturn("true")).toBe(false);
    expect(isKeycloakLogoutReturn(undefined)).toBe(false);
  });

  it("allows only one OIDC redirect while the authorization round trip is active", () => {
    expect(claimKeycloakLoginRedirect(1_000)).toBe(true);
    expect(claimKeycloakLoginRedirect(1_001)).toBe(false);
    clearKeycloakLoginRedirect();
    expect(claimKeycloakLoginRedirect(1_002)).toBe(true);
  });

  it("recovers from an abandoned OIDC redirect after its safety window", () => {
    expect(claimKeycloakLoginRedirect(1_000)).toBe(true);
    expect(claimKeycloakLoginRedirect(61_001)).toBe(true);
  });
});
