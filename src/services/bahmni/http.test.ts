import { afterEach, describe, expect, it, vi } from "vitest";
import { BahmniApiError, bahmniRequest, getBahmniErrorTechnicalDetails } from "./http";

afterEach(() => vi.restoreAllMocks());

describe("getBahmniErrorTechnicalDetails", () => {
  it("exposes only the HTTP status and OpenMRS error code", () => {
    const error = new BahmniApiError(500, "Internal Server Error", {
      error: {
        message: "Internal Server Error",
        code: "org.openmrs.module.Example:42",
        detail: "stack containing request values",
      },
    });

    expect(getBahmniErrorTechnicalDetails(error)).toEqual({
      status: 500,
      code: "org.openmrs.module.Example:42",
    });
  });

  it("extracts only the root exception class and stack location", () => {
    const error = new BahmniApiError(500, "Internal Server Error", {
      error: {
        message: "Internal Server Error",
        detail: [
          "java.lang.RuntimeException: request data must not be shown",
          "\tat org.openmrs.web.Controller.save(Controller.java:10)",
          "Caused by: java.lang.IllegalArgumentException: clinical value must not be shown",
          "\tat org.openmrs.module.Mapper.map(Mapper.java:42)",
        ].join("\n"),
      },
    });

    expect(getBahmniErrorTechnicalDetails(error)).toEqual({
      status: 500,
      exceptionType: "java.lang.IllegalArgumentException",
      origin: "org.openmrs.module.Mapper.map(Mapper.java:42)",
    });
  });

  it("does not expose arbitrary errors", () => {
    expect(getBahmniErrorTechnicalDetails(new Error("secret"))).toEqual({});
  });
});

describe("bahmniRequest response compatibility", () => {
  it("preserves plain text when HCSBA declares an invalid JSON content type", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("Consultation", { status: 200, headers: { "Content-Type": "application/json" } }));
    await expect(bahmniRequest("/ws/rest/v1/bahmnicore/sql/globalproperty?property=bahmni.encounterType.default")).resolves.toBe("Consultation");
  });

  it("still parses valid JSON responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response('{"authenticated":true}', { status: 200, headers: { "Content-Type": "application/json" } }));
    await expect(bahmniRequest("/ws/rest/v1/session")).resolves.toEqual({ authenticated: true });
  });
});
