import { describe, expect, it } from "vitest";
import type { Reference, Visit } from "@/types/bahmni";
import { visitsAtEffectiveLocation } from "./visitLocation";

const visit = (uuid: string, locationUuid: string): Visit => ({ uuid, startDatetime: "2026-08-13T08:00:00.000Z", location: { uuid: locationUuid } });
const location = (uuid: string): Reference => ({ uuid });

describe("visitsAtEffectiveLocation", () => {
  it("matches a child login location through its effective visit location", () => {
    expect(visitsAtEffectiveLocation([visit("opd", "opd-child")], [location("hospital")], "hospital").map(({ uuid }) => uuid)).toEqual(["opd"]);
  });

  it("reveals duplicate active visits that resolve to the same visit location", () => {
    expect(visitsAtEffectiveLocation(
      [visit("ipd", "hospital"), visit("opd", "opd-child")],
      [location("hospital"), location("hospital")],
      "hospital",
    ).map(({ uuid }) => uuid)).toEqual(["ipd", "opd"]);
  });

  it("falls back to the source location when no mapping exists", () => {
    expect(visitsAtEffectiveLocation([visit("ipd", "hospital")], [null], "hospital")).toHaveLength(1);
  });
});
