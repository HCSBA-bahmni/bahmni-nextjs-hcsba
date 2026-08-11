import { describe, expect, it } from "vitest";
import { normalizeConditionHistories } from "./conditions";

describe("normalizeConditionHistories", () => {
  it("selects the latest non-voided condition from each history", () => {
    const result = normalizeConditionHistories([{ conditions: [
      { uuid: "voided", concept: { shortName: "Antigua" }, status: "ACTIVE", onSetDate: "2025-01-01", voided: true },
      { uuid: "active", concept: { shortName: "Hipertensión" }, status: "ACTIVE", onSetDate: "2026-01-01" },
    ] }]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ uuid: "active", display: "Hipertensión", status: "ACTIVE" });
  });

  it("retains the original active onset after a history transition", () => {
    const result = normalizeConditionHistories([{ conditions: [
      { uuid: "active", concept: { name: "Asma" }, status: "ACTIVE", onSetDate: "2024-01-10" },
      { uuid: "history", concept: { name: "Asma" }, status: "HISTORY_OF", onSetDate: "2026-02-20", previousConditionUuid: "active" },
    ] }]);

    expect(result[0]).toMatchObject({ uuid: "history", display: "Asma", value: "HISTORY_OF", activeSince: "2024-01-10" });
  });

  it("hides inactive conditions on the compact dashboard but includes them expanded", () => {
    const histories = [{ conditions: [
      { uuid: "inactive", conditionNonCoded: "Resuelta", status: "INACTIVE", onSetDate: "2026-03-01" },
    ] }];

    expect(normalizeConditionHistories(histories)).toEqual([]);
    expect(normalizeConditionHistories(histories, true)).toHaveLength(1);
  });
});
