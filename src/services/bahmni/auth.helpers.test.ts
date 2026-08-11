import Cookies from "js-cookie";
import { afterEach, describe, expect, it } from "vitest";
import { getGrantedEncounterProvider, parseFavouriteObsTemplates, serializeFavouriteObsTemplates } from "./auth";
import type { BahmniUser } from "@/types/bahmni";

const user = (privileges: string[]) => ({
  uuid: "user", username: "doctor", privileges: privileges.map((name) => ({ uuid: name, name })), roles: [],
}) as BahmniUser;

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
