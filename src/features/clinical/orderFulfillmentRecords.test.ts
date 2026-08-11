import { describe, expect, it } from "vitest";
import { normalizeOrderFulfillmentRecords, orderConceptLabel } from "./orderFulfillmentRecords";

describe("dashboard order fulfillment records", () => {
  it("preserves the legacy order.concept label before conceptName", () => {
    expect(orderConceptLabel({ concept: "Blood grouping test", conceptName: "Determinación de grupo sanguíneo" }, "es-CL"))
      .toBe("Blood grouping test");
  });

  it("uses the configured locale and then the published short name for concept objects", () => {
    expect(orderConceptLabel({ concept: { names: [{ locale: "es", display: "Grupo sanguíneo" }], shortName: "Blood group" } }, "es-CL"))
      .toBe("Grupo sanguíneo");
    expect(orderConceptLabel({ concept: { shortName: "Blood group", name: "Blood grouping test" } }, "es-CL"))
      .toBe("Blood group");
  });

  it("keeps provider, date and fulfillment observations from the Bahmni orders contract", () => {
    const [order] = normalizeOrderFulfillmentRecords([{
      orderUuid: "order-1",
      concept: "Absolute eosinophil count test",
      orderDate: "2026-01-18T09:45:00.000-03:00",
      provider: "Super Man",
      bahmniObservations: [{ uuid: "obs-1", concept: { name: "Resultado" }, value: "Normal" }],
    }], "es-CL");

    expect(order).toMatchObject({
      id: "order-1",
      label: "Absolute eosinophil count test",
      provider: "Super Man",
      hasObservations: true,
      observations: [{ uuid: "obs-1", value: "Normal" }],
    });
  });
});
