import { describe, expect, it } from "vitest";
import { isActiveOrScheduledDrugOrder, mergeContinuousDrugOrders, normalizeDrugOrders, normalizeTreatmentSections } from "./drugOrders";

describe("legacy dashboard drug order rules", () => {
  it("keeps active and future scheduled orders and removes stopped/discontinued orders", () => {
    const now = new Date("2026-08-03T12:00:00Z").getTime();
    expect(isActiveOrScheduledDrugOrder({ effectiveStartDate: "2026-08-04", effectiveStopDate: "2026-08-10" }, now)).toBe(true);
    expect(isActiveOrScheduledDrugOrder({ action: "DISCONTINUE" }, now)).toBe(false);
    expect(isActiveOrScheduledDrugOrder({ dateStopped: "2026-08-01" }, now)).toBe(false);
  });

  it("ports administration JSON, dose, route, frequency and chronological ordering", () => {
    const rows = normalizeDrugOrders([
      { uuid: "b", orderNumber: "ORD-2", effectiveStartDate: "2026-08-02", drug: { display: "Drug B" }, dosingInstructions: { dose: 2, doseUnits: { display: "tablet" }, route: { display: "Oral" }, frequency: { display: "Once daily" }, administrationInstructions: JSON.stringify({ instructions: "With food", additionalInstructions: "Seven days" }) } },
      { uuid: "a", orderNumber: "ORD-1", effectiveStartDate: "2026-08-01", drugNonCoded: "Drug A", dosingInstructions: {} },
    ], false);
    expect(rows.map((item) => item.uuid)).toEqual(["a", "b"]);
    expect(rows[1]).toEqual(expect.objectContaining({ name: "Drug B", dose: "2 tablet", route: "Oral", frequency: "Once daily", instructions: "With food", additionalInstructions: "Seven days" }));
  });

  it("distinguishes the planned end from an actual suspension", () => {
    const [row] = normalizeDrugOrders([{
      uuid: "planned",
      effectiveStartDate: "2026-08-04T20:00:00Z",
      effectiveStopDate: "2026-08-24T20:00:00Z",
      drug: { display: "Paracetamol 500 mg" },
      dosingInstructions: {},
    }], false, new Date("2026-08-10T12:00:00Z").getTime());
    expect(row).toMatchObject({ stopDate: undefined, plannedEndDate: "2026-08-24T20:00:00Z", status: "", active: true });
  });

  it("maps legacy IPD wrappers, schedule status and provider details", () => {
    const [row] = normalizeDrugOrders([{
      provider: { name: "Super Man" },
      drugOrderSchedule: { medicationAdministrationStarted: true },
      drugOrder: {
        uuid: "wrapped",
        dateActivated: "2026-08-04T20:00:00Z",
        drug: { display: "Ibuprofen 400 mg" },
        dosingInstructions: { dose: 1, doseUnits: "Comprimido", route: "Oral", frequency: "Four times a day", administrationInstructions: JSON.stringify({ instructions: "As directed" }) },
      },
    }], false);
    expect(row).toMatchObject({ name: "Ibuprofen 400 mg", provider: "Super Man", instructions: "As directed", status: "in-progress", medicationAdministrationStarted: true });
  });

  it("keeps the legacy visit grouping and other-active section", () => {
    const sections = normalizeTreatmentSections({
      visitDrugOrders: [
        { uuid: "old", visit: { uuid: "v1", startDateTime: "2026-08-01" }, drug: { display: "A" }, dosingInstructions: {} },
        { uuid: "new", visit: { uuid: "v2", startDateTime: "2026-08-03" }, drug: { display: "B" }, dosingInstructions: {} },
      ],
      otherActiveDrugOrders: [{ uuid: "active", drug: { display: "C" }, dosingInstructions: {} }],
    });
    expect(sections.map((section) => section.id)).toEqual(["visit-v2", "visit-v1", "other-active"]);
    expect(sections[0]?.orders[0]?.name).toBe("B");
    expect(sections[2]).toMatchObject({ label: "Otros tratamientos activos", otherActive: true });
  });

  it("omits legacy IPD orders stopped before any administration", () => {
    const sections = normalizeTreatmentSections({
      visitDrugOrders: [
        { drugOrder: { uuid: "never-administered", dateStopped: "2026-08-05", visit: { uuid: "v1", startDateTime: "2026-08-01" }, drug: { display: "A" }, dosingInstructions: {} }, drugOrderSchedule: { medicationAdministrationStarted: false } },
        { drugOrder: { uuid: "administered", dateStopped: "2026-08-05", visit: { uuid: "v1", startDateTime: "2026-08-01" }, drug: { display: "B" }, dosingInstructions: {} }, drugOrderSchedule: { medicationAdministrationStarted: true } },
      ],
    }, false, true);
    expect(sections.flatMap((section) => section.orders).map((order) => order.uuid)).toEqual(["administered"]);
  });

  it("limits the legacy IPD treatment table to the current visit", () => {
    const sections = normalizeTreatmentSections({
      visitDrugOrders: [
        { drugOrder: { uuid: "current", visit: { uuid: "visit-current", startDateTime: "2026-08-04T08:00:00Z" }, drug: { display: "Paracetamol" }, dosingInstructions: {} }, provider: { name: "Provider" } },
        { drugOrder: { uuid: "historical", visit: { uuid: "visit-old", startDateTime: "2025-07-14T08:00:00Z" }, drug: { display: "Amoxicillin" }, dosingInstructions: {} }, provider: { name: "Provider" } },
      ],
      otherActiveDrugOrders: [
        { drugOrder: { uuid: "other-visit", visit: { uuid: "visit-old", startDateTime: "2025-07-14T08:00:00Z" }, drug: { display: "Historical active" }, dosingInstructions: {} }, provider: { name: "Provider" } },
      ],
    }, false, true, "visit-current");
    expect(sections.flatMap((section) => section.orders).map((order) => order.uuid)).toEqual(["current"]);
  });

  it("merges adjacent prescriptions with the same posology like legacy", () => {
    const common = { drug: { uuid: "drug", name: "Paracetamol" }, durationUnits: "Days", dosingInstructions: { dose: 1, doseUnits: "Tablet", route: "Oral", frequency: "Once a day" } };
    expect(mergeContinuousDrugOrders([
      { ...common, uuid: "one", duration: 5, effectiveStartDate: "2026-08-01", effectiveStopDate: "2026-08-05" },
      { ...common, uuid: "two", duration: 5, scheduledDate: "2026-08-06", effectiveStartDate: "2026-08-06", effectiveStopDate: "2026-08-10" },
    ])).toEqual([expect.objectContaining({ uuid: "one", duration: 10, effectiveStopDate: "2026-08-10" })]);
  });
});
