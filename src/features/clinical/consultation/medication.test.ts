import { describe, expect, it } from "vitest";
import { buildMedicationHistory, calculateMedicationQuantity, drugSearchOptions, historyOrderToDraft, medicationCatalog, medicationHistoryOrder } from "./medication";
import type { MedicationConfig } from "./types";

const config: MedicationConfig = {
  defaultDurationUnit: "Days",
  defaultInstructions: "As directed",
  hideOrderSet: false,
  durationUnitsFactors: [{ name: "Days", factor: 1 }],
  frequencyDefaultDurationUnitsMap: [],
  autopopulateDurationBasedOnFrequency: [],
  drugFormDefaults: {},
  calculateDoseOnlyOnCurrentVisitValues: false,
  raw: {},
};

describe("legacy medication parity", () => {
  it("combines server metadata with medication.json defaults", () => {
    expect(medicationCatalog({
      doseUnits: [{ name: "Tablet" }], routes: [{ name: "Oral" }], dispensingUnits: ["Tablet"],
      dosingInstructions: [{ name: "With food" }], frequencies: [{ name: "Once daily", frequencyPerDay: 1 }], allowNonCodedDrugs: true,
    }, config)).toEqual(expect.objectContaining({
      doseUnits: ["Tablet"], routes: ["Oral"], durationUnits: ["Days"], dispensingUnits: ["Tablet"],
      dosingInstructions: ["With food"], allowNonCodedDrugs: true,
      frequencies: [{ label: "Once daily", value: "Once daily", frequencyPerDay: 1 }],
    }));
  });

  it("keeps non-coded drugs enabled by legacy default unless configuration forbids them", () => {
    expect(medicationCatalog({}, config).allowNonCodedDrugs).toBe(true);
    expect(medicationCatalog({}, { ...config, raw: { inputOptionsConfig: { allowOnlyCodedDrugs: true } } }).allowNonCodedDrugs).toBe(false);
  });

  it("maps catalog drugs and matching concept synonyms like the legacy autocomplete", () => {
    const drug = { uuid: "drug-1", name: "Paracetamol 650 mg", dosageForm: { display: "Tablet" }, concept: { names: [{ name: "Acetaminophen" }, { name: "Paracetamol" }] } };
    expect(drugSearchOptions([drug], "parac")).toEqual([{ label: "Paracetamol 650 mg (Tablet)", value: "Paracetamol 650 mg (Tablet)", drug }]);
    expect(drugSearchOptions([drug], "acetamin")).toEqual([{ label: "Acetaminophen => Paracetamol 650 mg (Tablet)", value: "Paracetamol 650 mg (Tablet)", drug }]);
  });

  it("calculates uniform dose quantity, duration factors, ceiling and dose units like legacy", () => {
    expect(calculateMedicationQuantity({ dose: 2, doseUnits: "Tablet", frequency: "Once daily", frequencyPerDay: 1, duration: 20, durationFactor: 1 })).toEqual({ quantity: 40, quantityUnits: "Tablet" });
    expect(calculateMedicationQuantity({ dose: 1.5, doseUnits: "Tablet", frequency: "Once daily", frequencyPerDay: 1, duration: 1, durationFactor: 7 })).toEqual({ quantity: 11, quantityUnits: "Tablet" });
    expect(calculateMedicationQuantity({ dose: 2, doseUnits: "Tablet", frequency: "Once daily", duration: 5 })).toEqual({ quantity: null, quantityUnits: "Tablet" });
  });

  it("preserves manually entered quantity and unit", () => {
    expect(calculateMedicationQuantity({ dose: 2, doseUnits: "Tablet", frequency: "Once daily", frequencyPerDay: 1, duration: 20, quantity: 99, quantityUnits: "Box", quantityEnteredManually: true, quantityUnitEnteredManually: true })).toEqual({ quantity: 99, quantityUnits: "Box" });
  });

  it("creates Recent plus descending visit tabs without losing clinical details", () => {
    const now = new Date("2026-08-05T12:00:00Z").getTime();
    const active = [{ uuid: "active", drug: { name: "Amoxicillin" }, effectiveStartDate: "2026-08-01", effectiveStopDate: "2026-08-10", dosingInstructions: { dose: 1, doseUnits: "Tablet", frequency: "Once daily" } }];
    const prescribed = [
      { ...active[0], visit: { startDateTime: "2026-08-01" } },
      { uuid: "old", drugNonCoded: "Iron", effectiveStartDate: "2026-07-01", effectiveStopDate: "2026-07-07", visit: { startDateTime: "2026-07-01" }, dosingInstructions: { administrationInstructions: JSON.stringify({ instructions: "After meals" }) } },
    ];
    const groups = buildMedicationHistory(active, prescribed, "es-CL", now);
    expect(groups.map((group) => group.id)).toEqual(["recent", "visit-2026-08-01", "visit-2026-07-01"]);
    expect(groups[0]?.orders[0]).toEqual(expect.objectContaining({ name: "Amoxicillin", dose: "1 Tablet", frequency: "Once daily", active: true }));
    expect(groups[2]?.orders[0]).toEqual(expect.objectContaining({ name: "Iron", instructions: "After meals", active: false }));
  });

  it("accepts epoch dates returned by the real legacy drug-order contract", () => {
    const start = 1397028261000;
    const stop = 1397633061000;
    const raw = { uuid: "epoch-order", drug: { uuid: "drug", name: "Epoch drug" }, effectiveStartDate: start, effectiveStopDate: stop, visit: { startDateTime: start }, duration: 7, durationUnits: "Days", dosingInstructions: { frequency: "Once daily" } };
    const groups = buildMedicationHistory([raw], [raw], "es-CL", 1397100000000);
    expect(groups[1]).toEqual(expect.objectContaining({ id: `visit-${start}`, label: expect.not.stringMatching(/Sin fecha/) }));
    expect(groups[0]?.orders[0]).toEqual(expect.objectContaining({ startDate: start, stopDate: stop, active: true }));
    expect(historyOrderToDraft(groups[0]!.orders[0]!, "DISCONTINUE", "stop", "2014-04-10").effectiveStartDate).toBe("2014-04-09");
  });

  it("ports refill, revise and discontinue contracts from a history row", () => {
    const history = medicationHistoryOrder({
      uuid: "order-1", drug: { uuid: "drug-1", name: "Amoxicillin" }, effectiveStartDate: "2026-08-01", effectiveStopDate: "2026-08-10",
      duration: 7, durationUnits: "Days", dosingInstructions: { dose: 1, doseUnits: "Tablet", route: "Oral", frequency: "Once daily", quantity: 7, quantityUnits: "Tablet" },
    }, new Date("2026-08-05").getTime());
    expect(historyOrderToDraft(history, "NEW", "new", "2026-08-05")).toEqual(expect.objectContaining({ action: "NEW", previousOrderUuid: undefined, effectiveStartDate: "2026-08-10", drug: expect.objectContaining({ uuid: "drug-1" }) }));
    expect(historyOrderToDraft(history, "REVISE", "revise", "2026-08-05")).toEqual(expect.objectContaining({ action: "REVISE", previousOrderUuid: "order-1", effectiveStartDate: "2026-08-05" }));
    expect(historyOrderToDraft(history, "DISCONTINUE", "stop", "2026-08-05")).toEqual(expect.objectContaining({ action: "DISCONTINUE", previousOrderUuid: "order-1", dateStopped: "2026-08-05" }));
  });
});
