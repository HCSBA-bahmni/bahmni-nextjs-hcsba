import Cookies from "js-cookie";
import { z } from "zod";
import { locationSchema, providerSchema, sessionSchema, userSchema, type BahmniLocation, type BahmniProvider, type BahmniSession, type BahmniUser } from "@/types/bahmni";
import { abortPendingBahmniRequests as abortPendingRequests, BahmniApiError, bahmniRequest, bahmniRequestWithResponse, basicAuthorization, queryString } from "./http";

const resourceList = <T extends z.ZodTypeAny>(item: T) => z.object({ results: z.array(item) }).loose();
const passwordPolicyPropertiesSchema = z.record(z.string(), z.string());
const USER_COOKIE = "bahmni.user";
const LOCATION_COOKIE = "bahmni.user.location";
const LOCALE_COOKIE = "bahmni.locale";
const PROVIDER_LOCATIONS_STORAGE = "loginLocations";
const RETROSPECTIVE_COOKIE = "bahmni.clinical.retrospectiveEncounterDate";
const GRANTED_PROVIDER_COOKIE = "app.clinical.grantProviderAccessData";

export class MissingProviderError extends Error {
  constructor() {
    super("El usuario no tiene un proveedor activo configurado.");
    this.name = "MissingProviderError";
  }
}

export interface AuthenticatedContext {
  session: BahmniSession;
  user: BahmniUser;
  provider: BahmniProvider;
  loginLocations: BahmniLocation[];
  location: BahmniLocation | null;
  restoredLocation: boolean;
}

export async function getSession(): Promise<BahmniSession> {
  return bahmniRequest("/ws/rest/v1/session?v=custom:(uuid)", { schema: sessionSchema, cache: "no-store" });
}

export async function login(username: string, password: string, otp?: string, resendOTP = false): Promise<BahmniSession | undefined> {
  const response = await bahmniRequestWithResponse(`/ws/rest/v1/session${queryString({ v: "custom:(uuid)", resendOTP: resendOTP || undefined })}`, {
    headers: { Authorization: basicAuthorization(username, password, otp) },
    schema: sessionSchema.optional(),
    skipUnauthorizedEvent: true,
    cache: "no-store",
  });
  // The HCSBA OTP extension signals a successful first factor exclusively
  // with HTTP 204. Core OpenMRS instead answers invalid credentials with
  // HTTP 200 and { authenticated: false }; that response must never open the
  // verification-code step.
  if (response.status === 204) return undefined;
  if (!response.data?.authenticated) {
    throw new BahmniApiError(401, "Invalid username or password", response.data);
  }
  return response.data;
}

export function clearAuthenticationCookies(): void {
  Cookies.remove(USER_COOKIE, { path: "/" });
  Cookies.remove(RETROSPECTIVE_COOKIE, { path: "/" });
  Cookies.remove(GRANTED_PROVIDER_COOKIE, { path: "/" });
  // Legacy intentionally keeps the location cookie for seven days.
}

export function abortPendingBahmniRequests(): void {
  abortPendingRequests();
}

export async function logout(): Promise<string | null> {
  try {
    const response = await bahmniRequestWithResponse<unknown>("/ws/rest/v1/session?v=custom:(uuid)", {
      method: "DELETE",
      skipUnauthorizedEvent: true,
      cache: "no-store",
    });
    return response.headers.get("Location");
  } finally {
    clearAuthenticationCookies();
  }
}

export function clearRootSessionCookie(): void {
  // Legacy removes only an erroneous root-scoped cookie. The real OpenMRS
  // JSESSIONID is scoped to /openmrs and remains available to this session.
  Cookies.remove("JSESSIONID", { path: "/" });
}

export function persistLocale(locale: string): void {
  Cookies.set(LOCALE_COOKIE, locale, { path: "/", sameSite: "lax", expires: 7 });
  if (typeof window !== "undefined") window.localStorage.setItem("NG_TRANSLATE_LANG_KEY", locale);
}

export function getPersistedLocale(fallback = "es"): string {
  return Cookies.get(LOCALE_COOKIE)
    ?? (typeof window !== "undefined" ? window.localStorage.getItem("NG_TRANSLATE_LANG_KEY") : null)
    ?? fallback;
}

export function persistLocation(location: BahmniLocation): void {
  const name = location.name ?? location.display;
  Cookies.set(LOCATION_COOKIE, JSON.stringify({ uuid: location.uuid, name }), { path: "/", sameSite: "lax", expires: 7 });
}

export function getPersistedLocation(): BahmniLocation | null {
  const raw = Cookies.get(LOCATION_COOKIE);
  if (!raw) return null;
  try {
    const stored = JSON.parse(raw) as Record<string, unknown>;
    const name = typeof stored.name === "string" ? stored.name : typeof stored.display === "string" ? stored.display : undefined;
    const parsed = locationSchema.safeParse({ ...stored, name, display: name });
    if (parsed.success) return parsed.data;
  } catch {
    // Invalid legacy cookie is removed below.
  }
  Cookies.remove(LOCATION_COOKIE, { path: "/" });
  return null;
}

export async function updateSessionLocation(location: BahmniLocation, locale?: string): Promise<BahmniSession> {
  const session = await bahmniRequest("/ws/rest/v1/session", {
    method: "POST",
    body: JSON.stringify({ sessionLocation: location.uuid, locale }),
    schema: sessionSchema,
  });
  persistLocation(location);
  if (locale) persistLocale(locale);
  return session;
}

export function persistCurrentUser(user: BahmniUser, fallbackUsername?: string): void {
  const username = user.username ?? fallbackUsername ?? user.display;
  // Angular's $cookieStore always JSON-decodes this cookie. A plain username
  // makes legacy applications fail during bootstrap with a JSON parse error.
  if (username) Cookies.set(USER_COOKIE, JSON.stringify(username), { path: "/", sameSite: "lax", expires: 7 });
}

export function getPersistedUsername(): string | null {
  const stored = Cookies.get(USER_COOKIE);
  if (!stored) return null;
  try {
    const parsed: unknown = JSON.parse(stored);
    return typeof parsed === "string" ? parsed : null;
  } catch {
    return stored;
  }
}

export async function getCurrentUser(username?: string): Promise<BahmniUser> {
  const response = await bahmniRequest(`/ws/rest/v1/user${queryString({
    username,
    v: "custom:(username,uuid,person:(uuid,),privileges:(uuid,name,retired),roles:(uuid,name,retired),userProperties)",
  })}`, { schema: resourceList(userSchema), cache: "no-store" });
  const user = response.results[0];
  if (!user) throw new Error("OpenMRS no devolvió el usuario autenticado");
  // AngularJS and legacy microfrontends expect a username string here.
  persistCurrentUser(user, username);
  return user;
}

export function parseFavouriteObsTemplates(value?: string): string[] {
  if (!value) return [];
  return [...new Set(value.split("###").map((name) => name.trim()).filter(Boolean))];
}

export function serializeFavouriteObsTemplates(names: Iterable<string>): string {
  return [...new Set([...names].map((name) => name.trim()).filter(Boolean))].join("###");
}

export async function saveUserProperties(userUuid: string, userProperties: Record<string, string>): Promise<BahmniUser> {
  return bahmniRequest(`/ws/rest/v1/user/${encodeURIComponent(userUuid)}`, {
    method: "POST",
    body: JSON.stringify({ uuid: userUuid, userProperties }),
    schema: userSchema,
  });
}

export async function saveDefaultLocale(user: BahmniUser, locale: string): Promise<BahmniUser> {
  persistLocale(locale);
  if (user.userProperties?.defaultLocale === locale) return user;
  return saveUserProperties(user.uuid, { ...(user.userProperties ?? {}), defaultLocale: locale });
}

export async function getLoginLocations(): Promise<BahmniLocation[]> {
  const response = await bahmniRequest(`/ws/rest/v1/location${queryString({ s: "byTags", tags: "Login Location", v: "default", operator: "ALL" })}`, { schema: resourceList(locationSchema) });
  return response.results;
}

export async function getProviderForUser(userUuid: string): Promise<BahmniProvider | null> {
  const response = await bahmniRequest(`/ws/rest/v1/provider${queryString({ user: userUuid, v: "custom:(uuid,display,retired,attributes)" })}`, { schema: resourceList(providerSchema), cache: "no-store" });
  return response.results.find((provider) => provider.retired !== true && provider.retired !== "true") ?? null;
}

export function providerLoginLocations(provider: BahmniProvider | null): BahmniLocation[] {
  return (provider?.attributes ?? [])
    .filter((attribute) => (attribute.attributeType.display ?? attribute.attributeType.name) === "Login Locations")
    .flatMap((attribute) => {
      if (typeof attribute.value !== "object" || attribute.value === null || !("uuid" in attribute.value)) return [];
      const value = attribute.value as Record<string, unknown>;
      const display = typeof value.display === "string" ? value.display : typeof value.name === "string" ? value.name : undefined;
      const parsed = locationSchema.safeParse({ ...value, display, name: value.name ?? display });
      return parsed.success ? [parsed.data] : [];
    });
}

export function resolveLoginLocations(allLocations: BahmniLocation[], provider: BahmniProvider): BahmniLocation[] {
  const assigned = providerLoginLocations(provider);
  const source = assigned.length ? assigned : allLocations;
  return [...new Map(source.map((location) => [location.uuid, location])).values()]
    .sort((left, right) => (left.display ?? left.name ?? "").localeCompare(right.display ?? right.name ?? ""));
}

export function persistProviderLoginLocations(provider: BahmniProvider): void {
  if (typeof window === "undefined") return;
  const assigned = providerLoginLocations(provider).map((location) => ({ uuid: location.uuid, display: location.display ?? location.name }));
  if (assigned.length) window.localStorage.setItem(PROVIDER_LOCATIONS_STORAGE, JSON.stringify(assigned));
  else window.localStorage.removeItem(PROVIDER_LOCATIONS_STORAGE);
}

export async function loadAuthenticatedContext(current: BahmniSession, options: { username?: string; locale?: string; restoreLocation?: boolean } = {}): Promise<AuthenticatedContext> {
  if (!current.authenticated) throw new Error("La sesión de OpenMRS no está autenticada.");
  const user = await getCurrentUser(options.username ?? current.user?.display);
  const provider = await getProviderForUser(user.uuid);
  if (!provider) throw new MissingProviderError();
  persistProviderLoginLocations(provider);
  const [allLocations, savedUser] = await Promise.all([
    getLoginLocations(),
    options.locale ? saveDefaultLocale(user, options.locale) : Promise.resolve(user),
  ]);
  const loginLocations = resolveLoginLocations(allLocations, provider);
  let session = current;
  let location = current.sessionLocation ? locationSchema.parse(current.sessionLocation) : null;
  let restoredLocation = false;
  if (location) {
    location = loginLocations.find((candidate) => candidate.uuid === location?.uuid) ?? location;
    persistLocation(location);
  }
  if (!location && options.restoreLocation !== false) {
    const remembered = getPersistedLocation();
    const allowed = remembered ? loginLocations.find((candidate) => candidate.uuid === remembered.uuid) : undefined;
    if (allowed) {
      session = await updateSessionLocation(allowed, options.locale ?? getPersistedLocale(savedUser.userProperties?.defaultLocale ?? "es"));
      location = session.sessionLocation ? locationSchema.parse(session.sessionLocation) : allowed;
      restoredLocation = true;
    } else if (remembered) {
      Cookies.remove(LOCATION_COOKIE, { path: "/" });
    }
  }
  return { session, user: savedUser, provider, loginLocations, location, restoredLocation };
}

async function getGlobalProperty(property: string): Promise<string> {
  const value = await bahmniRequest<unknown>(`/ws/rest/v1/bahmnicore/sql/globalproperty${queryString({ property })}`);
  return typeof value === "string" ? value : String(value ?? "");
}

export async function rememberProviderContext(providerUuid: string, path: string): Promise<void> {
  if (!/^\/(?!\/)/.test(path)) return;
  const rawMinutes = await getGlobalProperty("bahmni.contextCookieExpirationTimeInMinutes").catch(() => "0");
  const minutes = Number(rawMinutes);
  if (!Number.isFinite(minutes) || minutes <= 0) return;
  Cookies.set(providerUuid, path, { path: "/", sameSite: "lax", expires: new Date(Date.now() + minutes * 60_000) });
}

export function getRememberedProviderContext(providerUuid: string): string | null {
  const value = Cookies.get(providerUuid);
  return value && /^\/(?!\/)/.test(value) ? value : null;
}

export async function getQuickLogoutComboKey(): Promise<string> {
  const value = await getGlobalProperty("bahmni.quickLogoutComboKey").catch(() => "");
  return value.trim() || "Escape";
}

export async function getAllowedLocaleCodes(): Promise<string[]> {
  const value = await getGlobalProperty("locale.allowed.list").catch(() => "");
  return value.split(",").map((locale) => locale.trim()).filter(Boolean);
}

export async function getPasswordPolicies(): Promise<Record<string, string>> {
  return bahmniRequest("/ws/rest/v1/bahmnicore/globalProperty/passwordPolicyProperties", {
    schema: passwordPolicyPropertiesSchema,
    cache: "no-store",
  });
}

export function hasPrivilege(user: BahmniUser | null, required?: string | string[]): boolean {
  if (!required || (Array.isArray(required) && required.length === 0)) return true;
  const privileges = new Set(user?.privileges.map((privilege) => privilege.name ?? privilege.display).filter(Boolean));
  const requiredList = Array.isArray(required) ? required : [required];
  return requiredList.every((privilege) => privileges.has(privilege));
}

export function getGrantedEncounterProvider(user: BahmniUser | null): BahmniProvider | null {
  if (!hasPrivilege(user, "app:clinical:grantProviderAccess")) return null;
  const raw = Cookies.get(GRANTED_PROVIDER_COOKIE);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const candidate = { ...parsed, display: parsed.display ?? parsed.value, attributes: parsed.attributes ?? [] };
    const result = providerSchema.safeParse(candidate);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export async function changePassword(oldPassword: string, newPassword: string): Promise<void> {
  await bahmniRequest("/ws/rest/v1/password", { method: "POST", body: JSON.stringify({ oldPassword, newPassword }) });
}
