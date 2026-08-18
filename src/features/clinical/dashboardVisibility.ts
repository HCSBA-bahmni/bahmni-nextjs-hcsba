const ipsControlTypes = new Set(["ipsReact", "ipsIcvpReact"]);

export interface DashboardIntegrationFlags {
  ipsEnabled: boolean;
}

/**
 * Keeps OpenHIM-backed controls dormant until their deployment switch is
 * explicitly enabled. The configuration remains parsed, so reactivation does
 * not require editing HCSBA dashboard.json or rebuilding the control registry.
 */
export function isDashboardControlVisible(type: string, flags: DashboardIntegrationFlags): boolean {
  return !ipsControlTypes.has(type) || flags.ipsEnabled;
}
