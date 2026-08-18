import Cookies from "js-cookie";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  changePassword,
  getPasswordPolicies,
  getProviderForUser,
  getPersistedUsername,
  getCurrentUser,
  login,
  loadAuthenticatedContext,
  logout,
  persistCurrentUser,
  persistLocation,
  resolveLoginLocations,
  MissingProviderError,
} from "./auth";
import type { BahmniProvider, BahmniSession, BahmniUser } from "@/types/bahmni";

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { "Content-Type": "application/json" },
});

const user: BahmniUser = { uuid: "user-1", username: "doctor", display: "Dra. Uno", privileges: [], roles: [], userProperties: {} };
const provider: BahmniProvider = { uuid: "provider-1", display: "Dra. Uno", attributes: [] };
const session: BahmniSession = { authenticated: true, user: { uuid: "user-1", display: "doctor" }, sessionLocation: null };

afterEach(() => {
  vi.restoreAllMocks();
  Cookies.remove("bahmni.user", { path: "/" });
  Cookies.remove("bahmni.user.location", { path: "/" });
  Cookies.remove("app.clinical.grantProviderAccessData", { path: "/" });
  window.localStorage.clear();
});

describe("legacy authentication persistence", () => {
  it("loads the exact Bahmni password policy contract", async () => {
    const properties = { "security.passwordMinimumLength": "8", "security.passwordRequiresDigit": "true" };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(json(properties));

    await expect(getPasswordPolicies()).resolves.toEqual(properties);
    expect(new URL(String(fetchMock.mock.calls[0]?.[0]), window.location.origin).pathname)
      .toBe("/openmrs/ws/rest/v1/bahmnicore/globalProperty/passwordPolicyProperties");
  });

  it("submits the legacy OpenMRS password payload without adding fields", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(undefined, { status: 204 }));

    await changePassword("anterior", "nueva");

    const request = fetchMock.mock.calls[0];
    expect(new URL(String(request?.[0]), window.location.origin).pathname).toBe("/openmrs/ws/rest/v1/password");
    expect(request?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ oldPassword: "anterior", newPassword: "nueva" }),
    });
  });

  it("does not interpret OpenMRS authenticated false as an OTP challenge", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ authenticated: false }));

    await expect(login("doctor", "incorrecta")).rejects.toMatchObject({ status: 401 });
  });

  it("interprets only the HCSBA 204 first-factor response as an OTP challenge", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(undefined, { status: 204 }));

    await expect(login("doctor", "correcta")).resolves.toBeUndefined();
  });

  it("stores the JSON string expected by AngularJS cookieStore", () => {
    persistCurrentUser(user);
    expect(Cookies.get("bahmni.user")).toBe(JSON.stringify("doctor"));
    expect(getPersistedUsername()).toBe("doctor");
  });

  it("accepts privileges and roles without UUID while requesting UUIDs when available", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ results: [{
      ...user,
      privileges: [{ name: "app:clinical", retired: false }],
      roles: [{ name: "Clinical" }],
    }] }));

    await expect(getCurrentUser("doctor")).resolves.toMatchObject({
      privileges: [{ name: "app:clinical" }],
      roles: [{ name: "Clinical" }],
    });
    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]), window.location.origin);
    expect(requestUrl.searchParams.get("v")).toContain("privileges:(uuid,name,retired)");
    expect(requestUrl.searchParams.get("v")).toContain("roles:(uuid,name,retired)");
  });

  it("keeps the last login location when the server session is destroyed", async () => {
    persistLocation({ uuid: "location-1", display: "Urgencia" });
    Cookies.set("bahmni.user", "doctor", { path: "/" });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(undefined, { status: 204, headers: { Location: "https://sso.example/logout" } }));

    await expect(logout()).resolves.toBe("https://sso.example/logout");

    expect(Cookies.get("bahmni.user")).toBeUndefined();
    expect(JSON.parse(Cookies.get("bahmni.user.location") ?? "{}")).toEqual({ uuid: "location-1", name: "Urgencia" });
  });
});

describe("provider and location context", () => {
  it("rejects an authenticated account without an active Provider", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json({ results: [user] }))
      .mockResolvedValueOnce(json({ results: [] }));

    await expect(loadAuthenticatedContext(session)).rejects.toBeInstanceOf(MissingProviderError);
  });

  it("ignores retired providers and uses the first active provider", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ results: [
      { uuid: "retired", display: "Retirado", retired: true, attributes: [] },
      { uuid: "active", display: "Activo", retired: false, attributes: [] },
    ] }));

    await expect(getProviderForUser("user-1")).resolves.toMatchObject({ uuid: "active" });
  });

  it("restricts login locations to the provider Login Locations attributes", () => {
    const assignedProvider = {
      ...provider,
      attributes: [{ attributeType: { uuid: "type", display: "Login Locations" }, value: { uuid: "assigned", name: "Pabellón" } }],
    } as BahmniProvider;
    expect(resolveLoginLocations([
      { uuid: "all-1", display: "Urgencia" },
      { uuid: "all-2", display: "Hospitalización" },
    ], assignedProvider)).toEqual([{ uuid: "assigned", name: "Pabellón", display: "Pabellón" }]);
  });

  it("restores a remembered allowed location into the authoritative OpenMRS session", async () => {
    persistLocation({ uuid: "location-1", display: "Urgencia" });
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json({ results: [user] }))
      .mockResolvedValueOnce(json({ results: [provider] }))
      .mockResolvedValueOnce(json({ results: [{ uuid: "location-1", display: "Urgencia" }] }))
      .mockResolvedValueOnce(json({ ...session, sessionLocation: { uuid: "location-1", display: "Urgencia" } }));

    const context = await loadAuthenticatedContext(session);

    expect(context.restoredLocation).toBe(true);
    expect(context.location).toMatchObject({ uuid: "location-1" });
    const sessionPost = fetchMock.mock.calls.find((call) => String(call[0]).endsWith("/ws/rest/v1/session") && (call[1] as RequestInit | undefined)?.method === "POST");
    expect(sessionPost).toBeDefined();
    expect(JSON.parse(String((sessionPost?.[1] as RequestInit).body))).toMatchObject({ sessionLocation: "location-1" });
  });

  it("discards a remembered location that is no longer assigned to the provider", async () => {
    persistLocation({ uuid: "old-location", display: "Anterior" });
    const assignedProvider = {
      ...provider,
      attributes: [{ attributeType: { uuid: "type", display: "Login Locations" }, value: { uuid: "allowed-location", name: "Actual" } }],
    } as BahmniProvider;
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json({ results: [user] }))
      .mockResolvedValueOnce(json({ results: [assignedProvider] }))
      .mockResolvedValueOnce(json({ results: [
        { uuid: "old-location", display: "Anterior" },
        { uuid: "allowed-location", display: "Actual" },
      ] }));

    const context = await loadAuthenticatedContext(session);

    expect(context.restoredLocation).toBe(false);
    expect(context.location).toBeNull();
    expect(Cookies.get("bahmni.user.location")).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
