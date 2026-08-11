import type { ClinicalDashboardTab } from "@/config-compat/clinicalConfig";

export function getVisibleDashboardTabs(tabs: ClinicalDashboardTab[], openedTabIds: string[], currentTabId?: string) {
  const opened = new Set(openedTabIds);
  return tabs.filter((tab) => tab.displayByDefault || opened.has(tab.id) || tab.id === currentTabId);
}

export function getUnopenedDashboardTabs(tabs: ClinicalDashboardTab[], openedTabIds: string[], currentTabId?: string) {
  const visible = new Set(getVisibleDashboardTabs(tabs, openedTabIds, currentTabId).map((tab) => tab.id));
  return tabs.filter((tab) => !visible.has(tab.id));
}
