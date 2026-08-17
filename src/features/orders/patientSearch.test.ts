import { describe, expect, it } from "vitest";
import type { AppExtension, BahmniUser } from "@/types/bahmni";
import { ordersPatientDestination, parseOrdersPatientSearchTabs } from "./patientSearch";

const user = { uuid: "user", privileges: [{ uuid: "orders", name: "app:orders" }], roles: [] } as BahmniUser;
const extension: AppExtension = {
  id: "radiology",
  extensionPointId: "org.bahmni.patient.search",
  type: "config",
  label: "Radiology Order",
  order: 1,
  requiredPrivilege: "app:orders",
  extensionParams: {
    searchHandler: "emrapi.sqlSearch.activePatients",
    display: "Radiology Orders",
    translationKey: "MODULE_LABEL_RADIOLOGY_ORDERS_KEY",
    forwardUrl: "../orders/#/patient/{{patientUuid}}/fulfillment/Radiology Order",
    view: "tabular",
  },
};

describe("legacy orders patient search", () => {
  it("ports the configured queue and derives the order type from its forward URL", () => {
    expect(parseOrdersPatientSearchTabs([extension], user)).toEqual([expect.objectContaining({
      handler: "emrapi.sqlSearch.activePatients",
      label: "Radiology Orders",
      orderType: "Radiology Order",
      searchColumns: ["identifier", "name"],
    })]);
  });

  it("keeps the legacy privilege requirement", () => {
    expect(parseOrdersPatientSearchTabs([extension], { ...user, privileges: [] })).toEqual([]);
  });

  it("builds the fulfillment route without losing spaces in the configured type", () => {
    const tab = parseOrdersPatientSearchTabs([extension], user)[0]!;
    expect(ordersPatientDestination(tab, { uuid: "patient/1" })).toBe("/orders/patient/patient%2F1/fulfillment/Radiology%20Order");
  });
});
