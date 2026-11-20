import { describe, expect, it } from "vitest";
import { bedPabellonLabel } from "./BedPabellonAccess";
import type { PabellonPage } from "@/services/bahmni/pabellon";
import { bedsBackHref, patientBedsHref } from "@/features/clinical/navigationLinks";
const page = (items: unknown[]) => ({ items }) as PabellonPage;
describe("Bed surgical actions", () => {
  it("does not treat unavailable history as empty", () => expect(bedPabellonLabel()).toBe("Pabellón"));
  it("offers a new request only for confirmed empty history", () => expect(bedPabellonLabel(page([]))).toBe("Solicitar pabellón"));
  it("does not mention newborns for ineligible cases", () => expect(bedPabellonLabel(page([{ newborns: { eligible: false, records: [] } }]))).toBe("Ver solicitudes"));
  it("mentions newborns only for eligibility or existing records", () => {
    expect(bedPabellonLabel(page([{ newborns: { eligible: true, records: [] } }]))).toContain("recién nacidos");
    expect(bedPabellonLabel(page([{ newborns: { eligible: false, records: [{}] } }]))).toContain("recién nacidos");
  });
  it("carries the clinical visit and tab to beds and returns to the same patient", () => {
    expect(patientBedsHref("p", "v", "general")).toBe("/bedmanagement/patient/p?source=clinical&visitUuid=v&clinicalTab=general");
    expect(bedsBackHref("p", "clinical", "v", "general")).toBe("/clinical/patient/p/dashboard?visitUuid=v&tab=general");
  });
  it("returns direct bed entry to the patient selector, never an arbitrary URL", () => {
    expect(bedsBackHref("p", undefined, "v")).toBe("/bedmanagement");
    expect(bedsBackHref("p", "https://other.example")).toBe("/bedmanagement");
  });
});
