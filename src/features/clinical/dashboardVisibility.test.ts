import { describe, expect, it } from "vitest";
import { isDashboardControlVisible } from "./dashboardVisibility";

describe("dashboard integration visibility", () => {
  it.each(["ipsReact", "ipsIcvpReact"])("hides %s while OpenHIM is disabled", (type) => {
    expect(isDashboardControlVisible(type, { ipsEnabled: false })).toBe(false);
  });

  it.each(["ipsReact", "ipsIcvpReact"])("restores %s through the deployment switch", (type) => {
    expect(isDashboardControlVisible(type, { ipsEnabled: true })).toBe(true);
  });

  it("does not affect ordinary clinical controls", () => {
    expect(isDashboardControlVisible("programs", { ipsEnabled: false })).toBe(true);
  });
});
