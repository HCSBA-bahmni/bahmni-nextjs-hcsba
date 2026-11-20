import { describe, expect, it } from "vitest";
import type { PabellonItem } from "@/services/bahmni/pabellon";
import type { PabellonCatalogueOption } from "@/services/bahmni/pabellonCatalogues";
import { requestPDFData } from "./requestPdfFromSnapshot";
const option = (id: string): PabellonCatalogueOption => ({ sourceId: id, code: id, system: "urn:qa", display: "QA " + id, active: true, relations: [] });
const masters = { assessments: [option("7"), option("1")], samples: [option("1")], theatres: [option("1")] };
const item = () => ({ id: "1", requestSnapshot: { status: "available", version: 1 }, request: { requestNumber: "QA", catalogueSelections: { "preoperative-assessments": ["1"], "blood-samples": [], theatres: ["1"] }, sections: [
  { key: "patient", fields: [{ key: "names", label: "Nombres", value: "FROZEN QA" }, { key: "identification", label: "N° ficha", value: "QA-123" }, { key: "second-surname", label: "Apellido materno", value: null }] },
  { key: "hospitalization", fields: [{ key: "hospitalized", value: "NO" }, { key: "prior-hospitalization", value: "NO" }, { key: "admission", value: null }] },
  { key: "surgery", fields: [{ key: "laterality", value: "SI" }, { key: "laterality-type", value: "Bilateral" }, { key: "procedures", value: "2004006 - QA" }] },
 ] } }) as unknown as PabellonItem;
describe("Canonical request PDF mapping", () => {
  it("uses frozen values, preserves blank legacy admission and sorts checkbox masters as native Pabellón", () => {
    const data = requestPDFData(item(), masters);
    expect(data.nombres_paciente).toBe("FROZEN QA"); expect(data.identificacion_paciente).toBe("QA-123"); expect(data.tipo_identificacion_paciente).toBe("ficha");
    expect(data.apellido_materno).toBe(""); expect(data.servicio_ingreso).toBe(""); expect(data.tipo_lateralidad).toBe("Bilateral");
    expect(data.mantenedor_ev_preoperatorias.map(v => v.id)).toEqual([1, 7]); expect(data.ev_preoperatorias).toEqual([1]); expect(data.producto_sanguineo_validacion).toBe(false);
  });
  it("refuses to silently drop a historical selection absent from the presentation master", () => {
    expect(() => requestPDFData(item(), { ...masters, assessments: [] })).toThrow(/código histórico/);
  });
  it("cannot generate a PDF from the old abbreviated request projection", () => {
    const value = item(); value.request!.sections = undefined; expect(() => requestPDFData(value, masters)).toThrow(/detalle completo/);
  });
});
