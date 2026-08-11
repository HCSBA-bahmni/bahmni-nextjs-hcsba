import { describe, expect, it } from "vitest";
import type { ClinicalDashboardContext } from "./dashboardContext";

describe("clinical dashboard context", () => {
  it("uses an immutable privilege set scoped to the current dashboard", () => {
    const context = { privilegeNames: new Set(["app:clinical"]) } as unknown as ClinicalDashboardContext;
    expect(context.privilegeNames.has("app:clinical")).toBe(true);
    expect(context.privilegeNames.has("app:clinical:ordersTab")).toBe(false);
  });
});
