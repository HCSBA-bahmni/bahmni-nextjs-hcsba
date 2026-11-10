import type { PabellonItem } from "@/services/bahmni/pabellon";
import { formatPabellonDate } from "./pabellonDates";
type Section = NonNullable<NonNullable<PabellonItem["request"]>["sections"]>[number];
/** Presentation only: no inference from missing historical values. */
export function requestDisplayFields(section: Section, selections: NonNullable<PabellonItem["request"]>["catalogueSelections"]) {
  if (section.key === "destination") {
    const expected = ["bed", "bed-type", "output-priority", "conditions", "origin-service", "priority-type"];
    const completeProjection = expected.every(key => section.fields.some(field => field.key === key));
    const hasDetails = section.fields.some(field => Boolean(field.value?.trim()));
    // The native model stores the destination relation, not an independent
    // persisted YES/NO. Describe absent priority; do not manufacture a NO.
    if (completeProjection && !hasDetails) {
      return [{ key: "not-defined", label: "", value: "No se definió prioridad de salida del paciente" }];
    }
  }
  if (section.key === "blood" && selections?.["blood-samples"]?.length === 0) {
    return [{ key: "not-requested", label: "Productos sanguíneos", value: "No se solicitaron productos sanguíneos para esta solicitud" }];
  }
  return section.fields.map(field => {
    if (section.key === "patient" && field.key === "birth-date") return { ...field, value: formatPabellonDate(field.value) };
    const negative = field.value?.trim().toUpperCase() === "NO";
    if (section.key === "blood" && field.key === "donor" && negative) return { ...field, value: "No se solicitaron donantes" };
    if (section.key === "surgery" && field.key === "laterality" && negative) return { ...field, value: "No requiere lateralidad" };
    if (section.key === "hospitalization" && field.key === "prior-hospitalization" && negative) return { ...field, value: "Paciente ambulatorio" };
    return field;
  });
}
