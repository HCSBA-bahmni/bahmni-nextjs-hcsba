import { validateKnownFormEvents } from "./formAdapters";
import type { ConsultationBoardAdapter, ConsultationBoardSlug, ConsultationDraft } from "./types";
import { isOtherSpecimenType, isSpecimenEmpty } from "./bacteriology";

function observationsValid(draft: ConsultationDraft) {
  for (const form of Object.values(draft.forms)) {
    if (!form.valid) return { valid: false, message: `${form.formName} contiene campos inválidos.` };
    const issues = form.values ? validateKnownFormEvents(form.definition, form.values) : [];
    if (issues[0]) return { valid: false, message: issues[0].message, focusId: issues[0].controlId ? `form2-${form.definition.uuid}-${issues[0].controlId.replace(/[^a-zA-Z0-9_-]/g, "-")}` : undefined };
  }
  return { valid: true };
}

export const ConsultationBoardRegistry: Record<ConsultationBoardSlug, ConsultationBoardAdapter> = {
  observations: { slug: "observations", validate: observationsValid },
  diagnosis: {
    slug: "diagnosis",
    validate(draft) {
      const invalid = draft.diagnoses.find((item) => !item.voided && Boolean(item.pendingAnswer?.trim()) && !item.codedAnswer?.uuid && !item.freeTextAnswer?.trim());
      if (invalid) return { valid: false, message: "Cada diagnóstico debe tener un concepto o descripción." };
      // Legacy compares new diagnoses with other new diagnoses and with diagnoses
      // saved in the current encounter. A diagnosis from a previous encounter is
      // intentionally allowed to be recorded again in the current consultation.
      const diagnosisKeys = draft.diagnoses.filter((item) => !item.voided && !item.historical).map((item) => item.codedAnswer?.uuid ?? item.freeTextAnswer?.trim().toLocaleLowerCase()).filter(Boolean);
      if (new Set(diagnosisKeys).size !== diagnosisKeys.length) return { valid: false, message: "No se permite registrar el mismo diagnóstico más de una vez en la consulta." };
      const invalidCondition = draft.conditions.find((item) => !item.voided && (!item.status || (!item.concept?.uuid && !item.conditionNonCoded?.trim())));
      return invalidCondition ? { valid: false, message: "Cada condición debe tener concepto o texto libre y un estado." } : { valid: true };
    },
  },
  disposition: { slug: "disposition", disabled: (context) => context.mode === "retrospective", validate: () => ({ valid: true }) },
  summary: { slug: "summary", validate: () => ({ valid: true }) },
  orders: {
    slug: "orders", disabled: (context) => context.mode === "retrospective",
    validate(draft) { return draft.orders.some((item) => !item.voided && !item.concept.uuid) ? { valid: false, message: "Todas las órdenes deben tener un concepto." } : { valid: true }; },
  },
  bacteriology: {
    slug: "bacteriology", disabled: (context) => context.mode === "retrospective",
    validate(draft) {
      const invalid = draft.specimens.find((item) => item.dirty && !item.voided && !isSpecimenEmpty(item) && (!item.dateCollected || !item.type?.uuid || (isOtherSpecimenType(item) && !item.typeFreeText?.trim())));
      if (invalid) return { valid: false, message: "Cada muestra requiere fecha, tipo y texto cuando el tipo es Other." };
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const future = draft.specimens.find((item) => !item.voided && item.dateCollected && new Date(`${item.dateCollected}T00:00:00`).getTime() > today.getTime());
      return future ? { valid: false, message: "La fecha de recolección no puede estar en el futuro." } : { valid: true };
    },
  },
  treatment: {
    slug: "treatment",
    validate(draft) {
      const missingDrug = draft.drugOrders.find((item) => item.dirty && item.action !== "DISCONTINUE" && !item.drug && !item.drugNonCoded?.trim());
      if (missingDrug) return { valid: false, message: "Cada tratamiento requiere un medicamento." };
      const incompleteOrder = draft.drugOrders.find((item) => item.dirty && item.action !== "DISCONTINUE" && (!item.frequency || !item.effectiveStartDate || !item.duration || item.duration < 1 || !item.durationUnits || ((item.dose !== undefined && item.dose !== null) && !item.doseUnits)));
      if (incompleteOrder) return { valid: false, message: "Cada tratamiento requiere frecuencia, fecha de inicio, duración y las unidades correspondientes." };
      const invalidStop = draft.drugOrders.find((item) => item.dirty && item.action === "DISCONTINUE" && (!item.dateStopped || (!item.orderReasonConcept?.uuid && !item.orderReasonNonCoded?.trim())));
      return invalidStop ? { valid: false, message: "Cada suspensión requiere fecha y motivo." } : { valid: true };
    },
  },
};

export function validateConsultationDraft(draft: ConsultationDraft, boardOrder: ConsultationBoardSlug[], context: Parameters<ConsultationBoardAdapter["validate"]>[1]) {
  for (const slug of boardOrder) {
    const adapter = ConsultationBoardRegistry[slug];
    if (adapter.disabled?.(context)) continue;
    const validation = adapter.validate(draft, context);
    if (!validation.valid) return { ...validation, board: slug };
  }
  return { valid: true as const };
}
