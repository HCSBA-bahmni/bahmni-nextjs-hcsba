import { describe, expect, it } from "vitest";
import { baseConsultationVisit, consultationMode, encounterVisitUuid } from "./mode";
import type { Visit } from "@/types/bahmni";

const visits: Visit[] = [
  { uuid: "active", startDatetime: "2026-08-04", stopDatetime: null, location: { uuid: "location" } },
  { uuid: "closed", startDatetime: "2026-07-01", stopDatetime: "2026-07-02", location: { uuid: "location" } },
];

describe("consultation modes", () => {
  it("never inherits the active visit for a retrospective entry", () => {
    expect(baseConsultationVisit({ visits, visitLocationUuid: "location", retrospectiveDate: "2026-08-01" })).toBeUndefined();
    expect(consultationMode({ retrospectiveDate: "2026-08-01", visitUuid: "active" })).toBe("retrospective");
  });
  it("resolves a historical visit from the persisted encounter instead of the active visit", () => {
    expect(baseConsultationVisit({ visits, visitLocationUuid: "location", encounterUuid: "encounter" })).toBeUndefined();
    expect(encounterVisitUuid({ visit: { uuid: "closed" } })).toBe("closed");
  });
  it("uses the requested visit and otherwise the active visit for normal consultation", () => {
    expect(baseConsultationVisit({ visits, requestedVisitUuid: "closed", visitLocationUuid: "location" })?.uuid).toBe("closed");
    expect(baseConsultationVisit({ visits, visitLocationUuid: "location" })?.uuid).toBe("active");
  });
});
