import { describe, expect, it } from "vitest";
import type { PabellonItem } from "@/services/bahmni/pabellon";
import type { Visit } from "@/types/bahmni";
import { groupPabellonVisits } from "./pabellonVisitGroups";

const visit = (uuid: string, startDatetime: string, stopDatetime: string | null): Visit => ({ uuid, startDatetime, stopDatetime });
const item = (id: string, visitUuid?: string) => ({ id, ...(visitUuid ? { care: { visitUuid, provenance: "verified-link" } } : {}) }) as PabellonItem;
describe("Pabellón groups by explicit visit", () => {
  it("puts current first, historical newest next and unlinked last; creates no empty visits", () => {
    const current = visit("current", "2026-11-09T10:00:00Z", null);
    const visits = [visit("old", "2026-11-01T10:00:00Z", "2026-11-02T10:00:00Z"), current, visit("recent", "2026-11-04T10:00:00Z", "2026-11-05T10:00:00Z"), visit("empty", "2026-11-13T10:00:00Z", "2026-11-13T12:00:00Z")];
    const groups = groupPabellonVisits([item("5"), item("4", "old"), item("3", "current"), item("2", "recent"), item("1", "current")], visits, current);
    expect(groups.map(group => group.key)).toEqual(["current", "recent", "old", "unlinked"]);
    expect(groups[0]!.items.map(row => row.id)).toEqual(["3", "1"]);
    expect(groups[0]!.current).toBe(true);
  });
  it("never infers membership or hides visits whose native metadata is missing", () => {
    const groups = groupPabellonVisits([item("1"), item("2", "unknown")], []);
    expect(groups.map(group => group.key)).toEqual(["unknown", "unlinked"]);
    expect(groupPabellonVisits([], [])).toEqual([]);
  });
  it("does not mark an old selected visit as current when an active one exists", () => {
    const old = visit("old", "2026-11-01", "2026-11-02");
    expect(groupPabellonVisits([item("1", "old"), item("2", "active")], [old, visit("active", "2026-11-10", null)], old)[0]!.key).toBe("active");
  });
});
