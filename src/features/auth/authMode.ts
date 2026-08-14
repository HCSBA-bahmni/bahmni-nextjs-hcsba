export type AuthMode = "openmrs" | "keycloak";

const KEYCLOAK_RETURN_URL = "bahmni.auth.keycloak.returnUrl";
const KEYCLOAK_LOGIN_STARTED_AT = "bahmni.auth.keycloak.loginStartedAt";
const KEYCLOAK_LOGIN_REDIRECT_TTL_MS = 60_000;

export function getAuthMode(value = process.env.NEXT_PUBLIC_AUTH_MODE): AuthMode {
  return value?.trim().toLowerCase() === "keycloak" ? "keycloak" : "openmrs";
}

export function isKeycloakAuth(): boolean {
  return getAuthMode() === "keycloak";
}

export function normalizeLocalReturnUrl(value: string | string[] | undefined): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("\\")) return "/home";
  if (candidate === "/bahmni") return "/home";
  return candidate.startsWith("/bahmni/") ? candidate.slice("/bahmni".length) : candidate;
}

export function rememberKeycloakReturnUrl(value: string | string[] | undefined): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(KEYCLOAK_RETURN_URL, normalizeLocalReturnUrl(value));
}

export function consumeKeycloakReturnUrl(): string {
  if (typeof window === "undefined") return "/home";
  const value = normalizeLocalReturnUrl(window.sessionStorage.getItem(KEYCLOAK_RETURN_URL) ?? undefined);
  window.sessionStorage.removeItem(KEYCLOAK_RETURN_URL);
  return value;
}

export function clearKeycloakReturnUrl(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(KEYCLOAK_RETURN_URL);
}

export function claimKeycloakLoginRedirect(now = Date.now()): boolean {
  if (typeof window === "undefined") return false;
  const startedAt = Number(window.sessionStorage.getItem(KEYCLOAK_LOGIN_STARTED_AT));
  if (Number.isFinite(startedAt) && startedAt > 0 && now - startedAt < KEYCLOAK_LOGIN_REDIRECT_TTL_MS) return false;
  window.sessionStorage.setItem(KEYCLOAK_LOGIN_STARTED_AT, String(now));
  return true;
}

export function clearKeycloakLoginRedirect(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(KEYCLOAK_LOGIN_STARTED_AT);
}

export function isKeycloakLogoutReturn(value: string | string[] | undefined): boolean {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate === "1";
}

export function keycloakLoginUrl(): string {
  return "/openmrs/oauth2login";
}

export function keycloakLogoutUrl(): string {
  return "/openmrs/oauth2logout";
}
