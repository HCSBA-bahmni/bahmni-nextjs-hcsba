import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

interface LegacyInventory {
  modules: Array<{ module: string; states: string[] }>;
  contracts: { endpointConstants: Array<{ name: string; expression: string }>; privileges: string[]; translations: Array<{ path: string; keys: number; malformed: boolean }> };
  legacyTests: Array<{ legacyPath: string; module: string; disposition: string; status: string; targetSuite: string }>;
  totals: { legacyUnitSpecs: number; angularStates: number; configuredApps: number; endpointConstants: number; privileges: number; translationFiles: number };
}

const inventory = JSON.parse(fs.readFileSync(path.join(process.cwd(), "docs", "legacy-inventory.generated.json"), "utf8")) as LegacyInventory;

describe("legacy migration inventory", () => {
  it("tracks every one of the 293 legacy unit specs", () => {
    expect(inventory.totals.legacyUnitSpecs).toBe(293);
    expect(inventory.legacyTests).toHaveLength(293);
    expect(new Set(inventory.legacyTests.map((test) => test.legacyPath)).size).toBe(293);
  });

  it("assigns every legacy spec to an explicit TypeScript suite", () => {
    expect(inventory.legacyTests.every((test) => test.disposition === "port" && test.status === "inventoried" && test.targetSuite.endsWith(".test.ts"))).toBe(true);
  });

  it("covers every routable AngularJS module and configured HCSBA app", () => {
    expect(inventory.totals.angularStates).toBeGreaterThan(20);
    expect(inventory.totals.configuredApps).toBeGreaterThanOrEqual(14);
    expect(inventory.modules.map((module) => module.module)).toEqual(expect.arrayContaining(["home", "registration", "clinical", "adt", "bedmanagement", "document-upload", "orders", "ot", "reports", "admin"]));
  });

  it("inventories endpoint constants, privileges and translation sources without executing legacy code", () => {
    expect(inventory.totals.endpointConstants).toBeGreaterThan(90);
    expect(inventory.totals.translationFiles).toBeGreaterThan(20);
    expect(inventory.contracts.privileges).toContain("app:registration");
    expect(inventory.contracts.translations.some((translation) => translation.keys > 0)).toBe(true);
  });
});
