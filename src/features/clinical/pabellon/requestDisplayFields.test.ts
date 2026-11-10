import { describe, expect, it } from "vitest";
import { requestDisplayFields } from "./requestDisplayFields";
describe("request consultation negative messages", () => {
  const destination = () => ({ key: "destination", title: "Prioridad y salida", fields: ["bed", "bed-type", "output-priority", "conditions", "origin-service", "priority-type"].map(key => ({ key, label: key, value: null as string | null })) });
  it("shows the native PDF absence message instead of six empty destination fields", () => {
    const section = destination();
    expect(requestDisplayFields(section, undefined)).toEqual([{ key: "not-defined", label: "", value: "No se definió prioridad de salida del paciente" }]);
    expect(section.fields).toHaveLength(6);
    expect(section.fields.every(field => field.value === null)).toBe(true);
  });
  it("preserves the details of a requested destination bed", () => {
    const section = destination(); section.fields[0]!.value = "RECUPERACION";
    expect(requestDisplayFields(section, undefined)).toEqual(section.fields);
  });
  it("does not hide historical priority details when the destination bed is absent", () => {
    const section = destination(); section.fields[2]!.value = "PRIORIDAD HISTORICA";
    expect(requestDisplayFields(section, undefined)).toEqual(section.fields);
  });
  it("does not assume a negative answer for an incomplete historical projection", () => {
    const section = destination(); section.fields = section.fields.slice(0, 1);
    expect(requestDisplayFields(section, undefined)).toEqual(section.fields);
  });
  it("shows the native PDF message for an explicitly empty blood selection", () => {
    expect(requestDisplayFields({ key: "blood", title: "Sangre", fields: [] }, { "blood-samples": [], "theatres": [], "preoperative-assessments": [] })[0]?.value).toBe("No se solicitaron productos sanguíneos para esta solicitud");
  });
  it("does not infer NO from missing selections or missing values", () => {
    const section = { key: "blood", title: "Sangre", fields: [{ key: "donor", label: "Donantes", value: null }] };
    expect(requestDisplayFields(section, undefined)).toEqual(section.fields);
  });
  it("explains explicit negative answers without modifying the snapshot", () => {
    const section = { key: "blood", title: "Sangre", fields: [{ key: "donor", label: "Donantes", value: "NO" }] };
    expect(requestDisplayFields(section, undefined)[0]?.value).toBe("No se solicitaron donantes");
    expect(section.fields[0]?.value).toBe("NO");
  });
});
