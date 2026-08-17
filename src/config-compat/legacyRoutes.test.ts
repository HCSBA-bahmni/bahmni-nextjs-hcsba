import { describe, expect, it } from "vitest";
import { resolveExtensionUrl, resolveLegacyIcon, resolveLegacyRoute, resolveLoginDestination, sanitizeReturnUrl } from "./legacyRoutes";

describe("legacy bookmarks", () => {
  it.each([
    ["/bahmni/home/index.html", "#/login", "/login"],
    ["/bahmni/registration/index.html", "#/patient/new", "/registration/patient/new"],
    ["/bahmni/registration/index.html", "#/patient/abc/visit", "/registration/patient/abc/visit"],
    ["/bahmni/bedmanagement/index.html", "#/bedManagement/bed/42", "/bedmanagement/bed/42"],
    ["/bahmni/bedmanagement/index.html", "#/bedManagement/patient/p1", "/bedmanagement/patient/p1"],
    ["/bahmni/bedmanagement/index.html", "#/patient/p1/visit/v1/dashboard", "/bedmanagement/patient/p1/visit/v1/dashboard"],
    ["/bahmni/adt/index.html", "#/patient/p1/visit/v1/", "/adt/patient/p1/visit/v1"],
    ["/bahmni/orders/index.html", "#/search", "/orders"],
    ["/bahmni/orders/index.html", "#/patient/p1/fulfillment/Radiology Order", "/orders/patient/p1/fulfillment/Radiology%20Order"],
  ])("maps %s%s", (path, hash, expected) => expect(resolveLegacyRoute(path, hash)).toBe(expected));
});

describe("dashboard navigation", () => {
  it.each([
    ["../registration/index.html", "/bahmni/registration", "next"],
    ["../clinical/#/programs/patient/search", "/bahmni/clinical/programs", "next"],
    ["../clinical/index.html#/default/patient/search", "/bahmni/clinical", "next"],
    ["../bedmanagement/#/bedManagement", "/bahmni/bedmanagement/manage", "next"],
    ["../adt/#/patient/p1/visit/v1/", "/bahmni/adt/patient/p1/visit/v1", "next"],
    ["../orders/#/search", "/bahmni/orders", "next"],
    ["../../appointments", "/bahmni/appointments/summary", "next"],
    ["/bahmni/appointments", "/bahmni/appointments", "next"],
    ["/implementer-interface", "/implementer-interface", "service"],
  ])("resolves %s", (input, href, kind) => expect(resolveExtensionUrl(input)).toEqual({ href, kind }));

  it("keeps explicit external URLs", () => expect(resolveExtensionUrl("https://example.org/app")).toEqual({ href: "https://example.org/app", kind: "external" }));
  it("maps Font Awesome and Bahmni icons", () => {
    expect(resolveLegacyIcon("fa-user")).toBe("pi pi-user");
    expect(resolveLegacyIcon("icon-bahmni-radiology")).toBe("pi pi-images");
    expect(resolveLegacyIcon("fa fa-calendar")).toBe("pi pi-calendar");
  });
});

describe("return URL safety", () => {
  it("normalizes a basePath URL for the Next router", () => expect(sanitizeReturnUrl("/bahmni/registration")).toBe("/registration"));
  it.each(["https://evil.example", "//evil.example", "/\\evil.example"])("rejects %s", (input) => expect(sanitizeReturnUrl(input)).toBe("/home"));
  it("allows an external login return only from the configured whitelist", () => {
    expect(resolveLoginDestination("https://reports.hcsba.cl/app", ["https://reports.hcsba.cl"], "https://bahmni.hcsba.cl")).toEqual({ href: "https://reports.hcsba.cl/app", external: true });
    expect(resolveLoginDestination("https://reports.hcsba.cl.evil.test/app", ["https://reports.hcsba.cl"], "https://bahmni.hcsba.cl")).toEqual({ href: "/home", external: false });
  });
});

describe("legacy fallbacks", () => {
  it("maps the home dashboard", () => expect(resolveLegacyRoute("/bahmni/home/index.html", "#/dashboard")).toBe("/home"));
  it("maps the clinical patient dashboard", () => expect(resolveLegacyRoute("/bahmni/clinical/index.html", "#/default/patient/p1/dashboard")).toBe("/clinical/patient/p1/dashboard"));
  it("maps the legacy program patient search", () => expect(resolveLegacyRoute("/bahmni/clinical/index.html", "#/programs/patient/search")).toBe("/clinical/programs"));
  it("maps the legacy program patient detail", () => expect(resolveLegacyRoute("/bahmni/clinical/index.html", "#/programs/patient/p1/consultationContext")).toBe("/clinical/programs/patient/p1"));
  it("maps the Care View patient dashboard and preserves its source", () => expect(resolveLegacyRoute("/bahmni/clinical/index.html", "#/default/patient/p1/dashboard/visit/ipd/v1?source=careViewDashboard")).toBe("/clinical/patient/p1/dashboard/visit/ipd/v1?source=careViewDashboard"));
  it("maps a legacy clinical visit", () => expect(resolveLegacyRoute("/bahmni/clinical/index.html", "#/default/patient/p1/dashboard/visit/v1/summary")).toBe("/clinical/patient/p1/visit/v1"));
  it("maps a legacy consultation board with its context", () => expect(resolveLegacyRoute("/bahmni/clinical/index.html", "#/programs/patient/p1/treatment?encounterUuid=e1&enrollment=pg1")).toBe("/clinical/patient/p1/consultation/treatment?encounterUuid=e1&enrollment=pg1&configName=programs"));
  it("maps registration search", () => expect(resolveLegacyRoute("/bahmni/registration/index.html", "#/search")).toBe("/registration"));
});
