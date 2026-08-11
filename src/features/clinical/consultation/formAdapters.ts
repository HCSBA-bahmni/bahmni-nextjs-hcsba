import { flattenFormControls, hasForm2Value, type Form2Control, type Form2Definition, type Form2Values } from "@/features/forms/form2";

export interface FormAdapterIssue { controlId?: string; message: string }
export interface FormEventAdapter { formName: string; validate(definition: Form2Definition, values: Form2Values): FormAdapterIssue[] }

function answerName(definition: Form2Definition, controlId: string, value: unknown): string | undefined {
  const control = flattenFormControls(definition.controls).find((candidate) => candidate.id === controlId);
  const answer = control?.concept?.answers.find((candidate) => candidate.uuid === value);
  return typeof answer?.name === "string" ? answer.name : answer?.name?.name ?? answer?.name?.display ?? answer?.displayString;
}

function matchingValueKeys(values: Form2Values, control: Form2Control): string[] {
  return Object.keys(values).filter((key) => key === control.id || new RegExp(`(?:^|/)${control.id}-\\d+$`).test(key));
}

function siblingKey(control: Form2Control | undefined, sourceKey: string, sourceId: string): string {
  if (!control) return "";
  if (sourceKey === sourceId || !sourceKey.includes("/")) return control.id;
  return `${sourceKey.slice(0, sourceKey.lastIndexOf("/"))}/${control.id}-0`;
}

function historyAndExaminationAdapter(): FormEventAdapter {
  return {
    formName: "History and Examination",
    validate(definition, values) {
      const controls = flattenFormControls(definition.controls);
      const issues: FormAdapterIssue[] = [];
      const validateComplaint = (complaint: Form2Control, duration: Form2Control | undefined, unit: Form2Control | undefined, freeText: Form2Control | undefined, durationRequired: boolean) => {
        const keys = matchingValueKeys(values, complaint);
        (keys.length ? keys : [complaint.id]).forEach((complaintKey) => {
          const complaintValue = values[complaintKey];
          const durationKey = siblingKey(duration, complaintKey, complaint.id);
          const unitKey = siblingKey(unit, complaintKey, complaint.id);
          const freeTextKey = siblingKey(freeText, complaintKey, complaint.id);
          if (durationRequired && hasForm2Value(complaintValue) && duration && !hasForm2Value(values[durationKey])) issues.push({ controlId: durationKey, message: "El motivo de consulta requiere duración." });
          if (durationRequired && hasForm2Value(complaintValue) && unit && !hasForm2Value(values[unitKey])) issues.push({ controlId: unitKey, message: "El motivo de consulta requiere unidad de duración." });
          if (!hasForm2Value(complaintValue) && duration && hasForm2Value(values[durationKey])) issues.push({ controlId: complaintKey, message: "No se puede registrar duración sin un motivo de consulta." });
          if (answerName(definition, complaint.id, complaintValue)?.toLocaleLowerCase() === "other generic" && freeText && !hasForm2Value(values[freeTextKey])) issues.push({ controlId: freeTextKey, message: "Other generic requiere una descripción libre." });
        });
      };

      const configuredGroups = controls.filter((control) => typeof control.properties.codedConceptName === "string" && typeof control.properties.nonCodedConceptName === "string");
      configuredGroups.forEach((group) => {
        const members = flattenFormControls(group.controls);
        const complaint = members.find((control) => control.concept?.name === String(group.properties.codedConceptName));
        const freeText = members.find((control) => control.concept?.name === String(group.properties.nonCodedConceptName));
        if (!complaint) return;
        const duration = members.find((control) => control.concept?.conceptClass === "Duration" || /duration/i.test(control.concept?.name ?? "") && !/unit/i.test(control.concept?.name ?? ""));
        const unit = members.find((control) => /duration.*unit|unit.*duration/i.test(control.concept?.name ?? ""));
        validateComplaint(complaint, duration, unit, freeText, group.properties.durationRequired === true);
      });

      if (!configuredGroups.length) {
        const complaints = controls.filter((control) => /^chief complaint(?: coded)?$/i.test(control.concept?.name ?? ""));
        const durations = controls.filter((control) => /duration/i.test(control.concept?.name ?? "") && !/unit/i.test(control.concept?.name ?? ""));
        const units = controls.filter((control) => /duration.*unit|unit.*duration/i.test(control.concept?.name ?? ""));
        const freeText = controls.find((control) => /chief complaint.*(?:text|free)|non.?coded chief complaint/i.test(control.concept?.name ?? ""));
        complaints.forEach((complaint, index) => validateComplaint(complaint, durations[index] ?? durations[0], units[index] ?? units[0], freeText, complaint.properties.durationRequired === true));
      }
      return issues;
    },
  };
}

const registry = new Map<string, FormEventAdapter>([["History and Examination", historyAndExaminationAdapter()]]);
export function validateKnownFormEvents(definition: Form2Definition, values: Form2Values): FormAdapterIssue[] { return registry.get(definition.name)?.validate(definition, values) ?? []; }
export const formEventAdapterNames = new Set(registry.keys());
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** Applies only declarative, known conceptSetUI properties. Script values are ignored. */
export function applyConceptSetUiConfig(definition: Form2Definition, conceptSetUI: Record<string, unknown>): Form2Definition {
  const allowedBooleans = new Set(["multiSelect", "autocomplete", "autoComplete", "dropdown", "dropDown", "buttonSelect", "grid", "conciseText", "allowAddMore", "stepper", "allowFutureDates", "durationRequired", "required"]);
  const allowedStrings = new Set(["codedConceptName", "nonCodedConceptName"]);
  const mapControl = (control: Form2Definition["controls"][number]): Form2Definition["controls"][number] => {
    const configured = object(conceptSetUI[control.concept?.name ?? ""]);
    const properties = { ...control.properties } as Record<string, unknown>;
    Object.entries(configured).forEach(([key, value]) => {
      if (!allowedBooleans.has(key) && !allowedStrings.has(key) || allowedBooleans.has(key) && typeof value !== "boolean" || allowedStrings.has(key) && typeof value !== "string") return;
      const normalized = key === "autocomplete" ? "autoComplete" : key === "dropdown" ? "dropDown" : key;
      properties[normalized] = value;
      if (normalized === "buttonSelect" && value) properties.dropDown = false;
      if (normalized === "allowAddMore") properties.addMore = value;
      if (normalized === "required") properties.mandatory = value;
    });
    return { ...control, properties: properties as typeof control.properties, controls: control.controls.map(mapControl) };
  };
  return { ...definition, controls: definition.controls.map(mapControl) };
}
