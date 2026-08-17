import { describe, expect, it, vi } from "vitest";
import { buildOrderObservation, fulfillmentConceptNames, fulfillmentFormMembers, persistOrderFulfillment, resolveOrderTypeUuid } from "./fulfillment";

describe("legacy order fulfillment configuration", () => {
  it("resolves the order type by the exact legacy display name", () => {
    const types = [{ uuid: "lab", display: "Lab Order" }, { uuid: "radiology", display: "Radiology Order" }];
    expect(resolveOrderTypeUuid(types, "Radiology Order")).toBe("radiology");
    expect(resolveOrderTypeUuid(types, "radiology order")).toBeUndefined();
  });
  it("uses the direct members of the configured fulfillment concept set", () => {
    expect(fulfillmentConceptNames({ setMembers: [{ uuid: "notes", name: { name: "Radiology Notes" } }, { uuid: "result", name: { display: "Radiology Result" } }] })).toEqual(["Radiology Notes", "Radiology Result"]);
  });
  it("preserves datatype and concept class instead of guessing controls from labels", () => {
    expect(fulfillmentFormMembers({ setMembers: [
      { uuid: "notes", name: { display: "Radiology Notes" }, datatype: { name: "Text" }, conceptClass: { name: "Finding" } },
      { uuid: "image", name: { display: "Image" }, datatype: { name: "Complex" }, conceptClass: { name: "Image" } },
    ] })).toEqual([
      { uuid: "notes", label: "Radiology Notes", datatype: "Text", conceptClass: "Finding", children: [] },
      { uuid: "image", label: "Image", datatype: "Complex", conceptClass: "Image", children: [] },
    ]);
  });
  it("builds the nested legacy observation tree and assigns orderUuid recursively", () => {
    const result = buildOrderObservation({
      formConceptUuid: "form", orderUuid: "order", textValues: { notes: "Informe" },
      fileValues: { image: [{ url: "patient/file.jpg", comment: "Frontal" }] },
      members: [{ uuid: "summary", label: "Summary", datatype: "N/A", conceptClass: "Misc", children: [
        { uuid: "notes", label: "Notes", datatype: "Text", conceptClass: "Misc", children: [] },
        { uuid: "image", label: "Images", datatype: "Complex", conceptClass: "Image", children: [] },
      ] }],
    });
    expect(result).toEqual({ concept: { uuid: "form" }, orderUuid: "order", groupMembers: [{ concept: { uuid: "summary" }, orderUuid: "order", groupMembers: [
      { concept: { uuid: "notes" }, value: "Informe", orderUuid: "order" },
      { concept: { uuid: "image" }, value: "patient/file.jpg", comment: "Frontal", orderUuid: "order" },
    ] }] });
  });

  const persistenceFixture = () => {
    const dependencies = { upload: vi.fn().mockResolvedValue("patient/image.jpg"), cleanup: vi.fn().mockResolvedValue(undefined), findEncounter: vi.fn().mockResolvedValue({ visitUuid: "visit" }), saveEncounter: vi.fn().mockResolvedValue({ encounterUuid: "encounter", visitUuid: "visit" }), writeAudit: vi.fn().mockResolvedValue(undefined) };
    const params: Parameters<typeof persistOrderFulfillment>[0] = {
      patientUuid: "patient", locationUuid: "location", providerUuid: "provider", orderType: "Radiology Order", formConceptUuid: "form",
      members: [{ uuid: "image", label: "Images", datatype: "Complex", conceptClass: "Image", children: [] }],
      orders: [{ id: "order", label: "X-ray", observations: [], hasObservations: false, source: { orderUuid: "order-uuid" } }],
      drafts: { order: { text: {}, files: { image: [{ dataUrl: "data:image/jpeg;base64,YWJj", name: "image.jpg", type: "image" as const, comment: "Frontal" }] } } },
    };
    return { dependencies, params };
  };

  it("persists upload, encounter observation and audit in the legacy order", async () => {
    const { dependencies, params } = persistenceFixture();
    await persistOrderFulfillment(params, dependencies);
    expect(dependencies.upload).toHaveBeenCalledOnce();
    expect(dependencies.saveEncounter.mock.calls[0]?.[0].observations[0]).toMatchObject({ orderUuid: "order-uuid", groupMembers: [{ value: "patient/image.jpg", orderUuid: "order-uuid" }] });
    expect(dependencies.writeAudit).toHaveBeenCalledWith("EDIT_ENCOUNTER", expect.stringContaining("encounter"), "patient", "MODULE_LABEL_ORDERS_KEY");
    expect(dependencies.cleanup).not.toHaveBeenCalled();
  });

  it("does not upload when the form is cancelled or abandoned without content", async () => {
    const { dependencies, params } = persistenceFixture();
    params.drafts = {};
    await expect(persistOrderFulfillment(params, dependencies)).rejects.toThrow("Debe ingresar");
    expect(dependencies.upload).not.toHaveBeenCalled();
    expect(dependencies.saveEncounter).not.toHaveBeenCalled();
  });

  it("does not attempt encounter persistence when upload fails", async () => {
    const { dependencies, params } = persistenceFixture();
    dependencies.upload.mockRejectedValue(new Error("upload failed"));
    await expect(persistOrderFulfillment(params, dependencies)).rejects.toThrow("upload failed");
    expect(dependencies.saveEncounter).not.toHaveBeenCalled();
    expect(dependencies.cleanup).not.toHaveBeenCalled();
  });

  it("removes uploaded files when encounter persistence fails", async () => {
    const { dependencies, params } = persistenceFixture();
    dependencies.saveEncounter.mockRejectedValue(new Error("encounter failed"));
    await expect(persistOrderFulfillment(params, dependencies)).rejects.toThrow("encounter failed");
    expect(dependencies.cleanup).toHaveBeenCalledWith("patient/image.jpg");
    expect(dependencies.writeAudit).not.toHaveBeenCalled();
  });
});
