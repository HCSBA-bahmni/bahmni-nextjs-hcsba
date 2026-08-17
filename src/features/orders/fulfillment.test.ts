import { describe, expect, it, vi } from "vitest";
import { buildOrderObservation, draftFromExistingObservations, fulfillmentConceptNames, fulfillmentFormMembers, persistOrderFulfillment, resolveOrderTypeUuid } from "./fulfillment";
import { BahmniApiError } from "@/services/bahmni/http";

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
  it("hydrates existing text, images and comments and preserves UUIDs for editing", () => {
    const members = [{ uuid: "summary", label: "Summary", datatype: "N/A", conceptClass: "Misc", children: [
      { uuid: "notes", label: "Notes", datatype: "Text", conceptClass: "Misc", children: [] },
      { uuid: "image", label: "Images", datatype: "Complex", conceptClass: "Image", children: [] },
    ] }];
    const observations = [{ uuid: "root", orderUuid: "order", concept: { uuid: "form" }, groupMembers: [{ uuid: "summary-obs", concept: { uuid: "summary" }, groupMembers: [
      { uuid: "notes-obs", concept: { uuid: "notes" }, value: "Previo" },
      { uuid: "image-obs", concept: { uuid: "image" }, value: "patient/old.jpg", comment: "Lateral" },
    ] }] }];
    expect(draftFromExistingObservations(members, observations, "form")).toEqual({ text: { notes: "Previo" }, files: { image: [{ url: "patient/old.jpg", uuid: "image-obs", name: "old.jpg", type: "image", comment: "Lateral" }] } });
    expect(buildOrderObservation({ formConceptUuid: "form", members, orderUuid: "order", textValues: { notes: "Actualizado" }, fileValues: { image: [] }, existingObservations: observations })).toMatchObject({ uuid: "root", groupMembers: [{ uuid: "summary-obs", groupMembers: [
      { uuid: "notes-obs", value: "Actualizado" }, { uuid: "image-obs", value: "patient/old.jpg", voided: true },
    ] }] });
  });

  const persistenceFixture = () => {
    const dependencies = { upload: vi.fn().mockResolvedValue("patient/image.jpg"), cleanup: vi.fn().mockResolvedValue(undefined), findEncounter: vi.fn().mockResolvedValue({ visitUuid: "visit" }), saveEncounter: vi.fn().mockResolvedValue({ encounterUuid: "encounter", visitUuid: "visit" }), writeAudit: vi.fn().mockResolvedValue(undefined) };
    const params: Parameters<typeof persistOrderFulfillment>[0] = {
      patientUuid: "patient", locationUuid: "location", providerUuid: "provider", orderType: "Radiology Order", formConceptUuid: "form",
      members: [{ uuid: "image", label: "Images", datatype: "Complex", conceptClass: "Image", children: [] }],
      orders: [{ id: "order", label: "X-ray", observations: [], hasObservations: false, source: { orderUuid: "order-uuid" } }],
      drafts: { order: { changed: true, text: {}, files: { image: [{ dataUrl: "data:image/jpeg;base64,YWJj", name: "image.jpg", type: "image" as const, comment: "Frontal" }] } } },
    };
    return { dependencies, params };
  };

  it("persists upload, encounter observation and audit in the legacy order", async () => {
    const { dependencies, params } = persistenceFixture();
    await persistOrderFulfillment(params, dependencies);
    expect(dependencies.upload).toHaveBeenCalledOnce();
    expect(dependencies.saveEncounter.mock.calls[0]?.[0]).toMatchObject({ providerUuid: "provider", observations: [{ orderUuid: "order-uuid", groupMembers: [{ value: "patient/image.jpg", orderUuid: "order-uuid" }] }] });
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

  it("stops before uploads and saves when OpenMRS cannot load the existing encounter", async () => {
    const { dependencies, params } = persistenceFixture();
    dependencies.findEncounter.mockRejectedValue(new Error("encounter lookup failed"));
    await expect(persistOrderFulfillment(params, dependencies)).rejects.toThrow("encounter lookup failed");
    expect(dependencies.upload).not.toHaveBeenCalled();
    expect(dependencies.saveEncounter).not.toHaveBeenCalled();
    expect(dependencies.cleanup).not.toHaveBeenCalled();
    expect(dependencies.writeAudit).not.toHaveBeenCalled();
  });

  it("removes uploaded files after a confirmed pre-commit rejection", async () => {
    const { dependencies, params } = persistenceFixture();
    dependencies.saveEncounter.mockRejectedValue(new BahmniApiError(400, "encounter rejected"));
    await expect(persistOrderFulfillment(params, dependencies)).rejects.toThrow("encounter rejected");
    expect(dependencies.cleanup).toHaveBeenCalledWith("patient/image.jpg");
    expect(dependencies.writeAudit).not.toHaveBeenCalled();
  });

  it("reconciles a timeout after commit and never deletes a referenced file", async () => {
    const { dependencies, params } = persistenceFixture();
    dependencies.saveEncounter.mockRejectedValue(new TypeError("network timeout"));
    dependencies.findEncounter
      .mockResolvedValueOnce({ visitUuid: "visit" })
      .mockResolvedValueOnce({ encounterUuid: "reconciled", visitUuid: "visit", observations: [{ orderUuid: "order-uuid", concept: { uuid: "form" }, groupMembers: [{ orderUuid: "order-uuid", concept: { uuid: "image" }, value: "patient/image.jpg" }] }] });
    await expect(persistOrderFulfillment(params, dependencies)).resolves.toMatchObject({ encounterUuid: "reconciled" });
    expect(dependencies.saveEncounter).toHaveBeenCalledOnce();
    expect(dependencies.cleanup).not.toHaveBeenCalled();
  });

  it("preserves uploads when an ambiguous response cannot be reconciled", async () => {
    const { dependencies, params } = persistenceFixture();
    dependencies.saveEncounter.mockResolvedValue({});
    dependencies.findEncounter.mockResolvedValue({ visitUuid: "visit", observations: [] });
    await expect(persistOrderFulfillment(params, dependencies)).rejects.toThrow("incierto");
    expect(dependencies.saveEncounter).toHaveBeenCalledOnce();
    expect(dependencies.cleanup).not.toHaveBeenCalled();
  });

  it("cleans prior uploads when a later upload fails before encounter persistence", async () => {
    const { dependencies, params } = persistenceFixture();
    params.drafts.order!.files.image!.push({ dataUrl: "data:image/jpeg;base64,ZGVm", name: "second.jpg", type: "image", comment: "" });
    dependencies.upload.mockResolvedValueOnce("patient/first.jpg").mockRejectedValueOnce(new Error("second upload failed"));
    await expect(persistOrderFulfillment(params, dependencies)).rejects.toThrow("second upload failed");
    expect(dependencies.saveEncounter).not.toHaveBeenCalled();
    expect(dependencies.cleanup).toHaveBeenCalledWith("patient/first.jpg");
  });

  it("deletes a voided existing image only after the encounter is confirmed", async () => {
    const { dependencies, params } = persistenceFixture();
    params.orders[0]!.observations = [{ uuid: "root", orderUuid: "order-uuid", concept: { uuid: "form" }, groupMembers: [{ uuid: "old-image", orderUuid: "order-uuid", concept: { uuid: "image" }, value: "patient/old.jpg" }] }];
    params.drafts.order = { changed: true, text: {}, files: { image: [] } };
    await persistOrderFulfillment(params, dependencies);
    expect(dependencies.upload).not.toHaveBeenCalled();
    expect(dependencies.saveEncounter.mock.invocationCallOrder[0]).toBeLessThan(dependencies.cleanup.mock.invocationCallOrder[0]!);
    expect(dependencies.cleanup).toHaveBeenCalledWith("patient/old.jpg");
  });
});
