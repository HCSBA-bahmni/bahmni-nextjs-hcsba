import { describe, expect, it } from "vitest";
import type { PabellonItem } from "@/services/bahmni/pabellon";
import { requestSnapshotAge } from "./requestSnapshotAge";
const fixture = (birth: string, capture: string, age: string | null = null) => ({ requestSnapshot: { capturedAt: { rawValue: capture } }, request: { sections: [{ key: "patient", fields: [{ key: "age", value: age }, { key: "birth-date", value: birth }] }] } }) as PabellonItem;
describe("Frozen request age", () => {
  it("uses the capture date, never today's date", () => expect(requestSnapshotAge(fixture("2000-01-01T00:00:00Z", "2026-11-05 11:44:00"))).toBe("26 años"));
  it("preserves age explicitly captured in the source", () => expect(requestSnapshotAge(fixture("2000-01-01", "2026-11-05", "25 años"))).toBe("25 años"));
  it("keeps missing or invalid dates blank", () => { expect(requestSnapshotAge(fixture("2000-02-30", "2026-11-05"))).toBe(""); expect(requestSnapshotAge(fixture("2000-01-01", ""))).toBe(""); });
  it("handles a newborn without shifting the calendar date", () => expect(requestSnapshotAge(fixture("2026-11-04", "2026-11-05"))).toBe("0 años, 0 meses y 1 día"));
});
