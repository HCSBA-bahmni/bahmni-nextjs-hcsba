import { describe, expect, it } from "vitest";
import { parseIpdConfig, parseIpdQueues } from "./ipdConfig";

describe("ipd config", () => {
  it("keeps unknown extensions and orders dashboard sections", () => {
    const config = parseIpdConfig({ config: { defaultVisitType: "IPD", vendorExtension: { enabled: true }, dashboard: { sections: { late: { type: "vitals", displayOrder: 2 }, first: { type: "patientInformation", displayOrder: 0 } } } } });
    expect(config.defaultVisitType).toBe("IPD");
    expect(config.dashboard.sections.map((section) => section.id)).toEqual(["first", "late"]);
    expect(config.extensions.vendorExtension).toEqual({ enabled: true });
  });

  it("respects legacy queue privileges and order", () => {
    const user = { uuid: "u", privileges: [{ uuid: "p", name: "app:adt" }], roles: [] } as never;
    const queues = parseIpdQueues([{ id: "later", extensionPointId: "org.bahmni.patient.search", type: "config", order: 2, requiredPrivilege: "app:adt", extensionParams: { searchHandler: "sql.two" } }, { id: "first", extensionPointId: "org.bahmni.patient.search", type: "config", order: 1, requiredPrivilege: "app:adt", extensionParams: { searchHandler: "sql.one" } }] as never, user);
    expect(queues.map((queue) => queue.id)).toEqual(["first", "later"]);
  });

  it("preserves legacy queue translations and SQL search configuration", () => {
    const user = { uuid: "u", privileges: [{ uuid: "p", name: "app:adt" }], roles: [] } as never;
    const [queue] = parseIpdQueues([{ id: "admit", label: "To Admit", extensionPointId: "org.bahmni.patient.search", type: "config", requiredPrivilege: "app:adt", extensionParams: { searchHandler: "sql.admit", translationKey: "MODULE_LABEL_TO_ADMIT_KEY", additionalParams: "limit=25", searchColumns: ["identifier", "name", "ward"] } }] as never, user);
    expect(queue).toMatchObject({ translationKey: "MODULE_LABEL_TO_ADMIT_KEY", additionalParams: "limit=25", searchColumns: ["identifier", "name", "ward"] });
  });
});
