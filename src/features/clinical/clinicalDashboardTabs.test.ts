import { describe, expect, it } from "vitest";
import type { ClinicalDashboardTab } from "@/config-compat/clinicalConfig";
import { getUnopenedDashboardTabs, getVisibleDashboardTabs } from "./clinicalDashboardTabs";

const tab = (id: string, displayByDefault: boolean): ClinicalDashboardTab => ({ id, translationKey: id, displayByDefault, sections: [], raw: {} });
const tabs = [tab("general", true), tab("trends", false), tab("summary", false)];

describe("clinical dashboard tabs", () => {
  it("initially shows only displayByDefault tabs", () => {
    expect(getVisibleDashboardTabs(tabs, [], "general").map(({ id }) => id)).toEqual(["general"]);
    expect(getUnopenedDashboardTabs(tabs, [], "general").map(({ id }) => id)).toEqual(["trends", "summary"]);
  });

  it("keeps an opened hidden tab visible and removes it from the add menu", () => {
    expect(getVisibleDashboardTabs(tabs, ["trends"], "general").map(({ id }) => id)).toEqual(["general", "trends"]);
    expect(getUnopenedDashboardTabs(tabs, ["trends"], "general").map(({ id }) => id)).toEqual(["summary"]);
  });

  it("always exposes the current URL tab even before local state is restored", () => {
    expect(getVisibleDashboardTabs(tabs, [], "summary").map(({ id }) => id)).toEqual(["general", "summary"]);
  });
});
