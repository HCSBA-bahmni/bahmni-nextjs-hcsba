import { describe, expect, it } from "vitest";
import { parseIpdDashboardConfig } from "./ipdDashboardConfig";

describe("parseIpdDashboardConfig", () => {
  it("orders configured controls and retains unknown fields", () => {
    const parsed = parseIpdDashboardConfig({
      sections: [
        { title: "Diagnosis", componentKey: "DG", displayOrder: 2, future: true },
        { title: "Vitals", componentKey: "VT", displayOrder: 1 },
      ],
      futureRoot: { enabled: true },
    });
    expect(parsed.sections.map((section) => section.componentKey)).toEqual(["VT", "DG"]);
    expect(parsed.sections[1]?.extensions.future).toBe(true);
    expect(parsed.extensions.futureRoot).toEqual({ enabled: true });
  });
});
