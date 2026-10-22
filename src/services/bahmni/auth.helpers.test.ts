import Cookies from "js-cookie";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getGrantedEncounterProvider, hasPrivilege, parseFavouriteObsTemplates, serializeFavouriteObsTemplates, saveDefaultLocale } from "./auth";
import type { BahmniUser } from "@/types/bahmni";

const user = (privileges: string[]) => ({
  uuid: "user", username: "doctor", privileges: privileges.map((name) => ({ uuid: name, name })), roles: [],
}) as BahmniUser;

describe("OpenMRS effective privileges", () => {
  it("keeps a local language preference without granting user administration to registration", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const admission = user(["app:registration"]);
    await expect(saveDefaultLocale(admission, "es")).resolves.toEqual(admission);
    expect(Cookies.get("bahmni.locale")).toBe("es"); expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
  it("uses privileges instead of role names to grant application access", () => {
    const registrationUser = { ...user(["app:registration"]), roles: [{ name: "HCSBA-Registro-Demo" }] };
    expect(hasPrivilege(registrationUser, "app:registration")).toBe(true);
    expect(hasPrivilege(registrationUser, "app:clinical")).toBe(false);
    expect(hasPrivilege({ ...user([]), roles: [{ name: "Doctor" }] }, "app:clinical")).toBe(false);
  });

  it.each([true, "true"] as const)("does not grant a retired privilege (%s)", (retired) => {
    const retiredUser = { ...user([]), privileges: [{ name: "app:clinical", retired }] };
    expect(hasPrivilege(retiredUser, "app:clinical")).toBe(false);
  });

  it.each([false, "false", undefined] as const)("accepts an active privilege (%s)", (retired) => {
    expect(hasPrivilege({ ...user([]), privileges: [{ name: "app:registration", retired }] }, "app:registration")).toBe(true);
  });

  it("requires all configured privileges and preserves unrestricted extensions", () => {
    expect(hasPrivilege(user(["app:registration"]), ["app:registration", "Add Patients"])).toBe(false);
    expect(hasPrivilege(user(["app:registration", "Add Patients"]), ["app:registration", "Add Patients"])).toBe(true);
    expect(hasPrivilege(user([]))).toBe(true);
    expect(hasPrivilege(null, "app:registration")).toBe(false);
  });
});

describe("legacy granted encounter provider cookie", () => {
  afterEach(() => Cookies.remove("app.clinical.grantProviderAccessData"));

  it("uses the override only with the exact legacy privilege", () => {
    Cookies.set("app.clinical.grantProviderAccessData", JSON.stringify({ uuid: "delegate", value: "Dra. Delegada" }));
    expect(getGrantedEncounterProvider(user([]))).toBeNull();
    expect(getGrantedEncounterProvider(user(["app:clinical:grantProviderAccess"]))).toMatchObject({ uuid: "delegate", display: "Dra. Delegada" });
  });
});

describe("legacy favourite observation templates", () => {
  it("reads the exact ### separated user preference and removes duplicates", () => {
    expect(parseFavouriteObsTemplates("Vitals###Malaria###Vitals")).toEqual(["Vitals", "Malaria"]);
  });

  it("writes the same wire format used by Bahmni AngularJS", () => {
    expect(serializeFavouriteObsTemplates(["History and Examination", "Vitals"])).toBe("History and Examination###Vitals");
  });
});
