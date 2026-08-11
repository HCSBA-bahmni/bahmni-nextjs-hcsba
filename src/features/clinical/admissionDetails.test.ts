import { describe, expect, it } from "vitest";
import { normalizeAdmissionDetails } from "./admissionDetails";

describe("normalizeAdmissionDetails", () => {
  it("preserves the legacy ward, bed, provider, notes and days-admitted contract", () => {
    expect(normalizeAdmissionDetails({
      admissionDetails: { date: "2026-08-01T10:00:00Z", notes: "Ingreso", provider: "Super Man" },
      dischargeDetails: { date: "2026-08-03T11:00:00Z", notes: "Alta", provider: "Super Man" },
    }, [{ wardName: "Medicina", bedNumber: "M-12" }])).toEqual({
      ward: "Medicina",
      bed: "M-12",
      admission: { date: "2026-08-01T10:00:00Z", notes: "Ingreso", provider: "Super Man" },
      discharge: { date: "2026-08-03T11:00:00Z", notes: "Alta", provider: "Super Man" },
      daysAdmitted: 3,
    });
  });

  it("unwraps the OpenMRS bedDetailsFromVisit list response", () => {
    expect(normalizeAdmissionDetails(
      { admissionDetails: { date: "2026-08-05T10:00:00.000-04:00", provider: "Super Man" } },
      { results: [{ bedNumber: "O-S-1-1", physicalLocation: { parentLocation: { name: "ONCO" } } }] },
    )).toMatchObject({ ward: "ONCO", bed: "O-S-1-1", admission: { provider: "Super Man" } });
  });
});
