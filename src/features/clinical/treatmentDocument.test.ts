import { describe, expect, it } from "vitest";
import { treatmentDocument } from "./treatmentDocument";

describe("treatment prescription document", () => {
  it("includes the visit, patient and complete posology", () => {
    const document = treatmentDocument({ id: "visit", label: "Visita", date: "2026-08-06", otherActive: false, orders: [{ uuid: "drug", name: "Paracetamol", dose: "1 Comprimido", quantity: "10 Comprimido", route: "Oral", frequency: "Cada 8 horas", drugForm: "", duration: "10 Days", instructions: "Con alimentos", additionalInstructions: "No alcohol", provider: "Super Man", active: true, status: "", stopReason: "", asNeeded: false, immediately: false, emergency: false, medicationAdministrationStarted: false, orderNumber: 1, raw: {} }] }, { uuid: "patient", identifier: "CLRUN*1", name: "Juan", gender: "M", address: "", image: "", attributes: [], relationships: [] }, "HCSBA", "es-CL");
    expect(JSON.stringify(document.content)).toContain("Paracetamol");
    expect(JSON.stringify(document.content)).toContain("Cada 8 horas");
    expect(JSON.stringify(document.content)).toContain("CLRUN*1");
  });
});
