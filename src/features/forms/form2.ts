import { z } from "zod";

const optionalBoolean = z.union([z.boolean(), z.literal("true"), z.literal("false")]).transform((value) => value === true || value === "true");
const nullableString = z.string().nullish().transform((value) => value ?? undefined);
const optionalNumber = z.preprocess((value) => value === null || value === undefined || value === "" ? undefined : Number(value), z.number().finite().optional());
const labelSchema = z.preprocess((value) => typeof value === "string" ? { value } : value, z.object({ value: z.string().default(""), translationKey: nullableString.optional() }).loose());
const answerSchema = z.object({
  uuid: z.string(), displayString: nullableString.optional(), translationKey: nullableString.optional(),
  name: z.union([z.string(), z.object({ display: z.string().optional(), name: z.string().optional() }).loose()]).optional(),
}).loose();
const conceptNameSchema = z.union([
  z.string(),
  z.object({ name: z.string().optional(), display: z.string().optional() }).loose(),
]).transform((value) => typeof value === "string" ? value : value.name ?? value.display ?? "");
const conceptTypeSchema = z.union([z.string(), z.object({ name: z.string() }).loose()]).transform((value) => typeof value === "string" ? value : value.name);
const conceptPropertiesSchema = z.unknown().transform((value): { allowDecimal?: boolean; [key: string]: unknown } => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const properties = { ...(value as Record<string, unknown>) };
  if (properties.allowDecimal === "true" || properties.allowDecimal === "false") properties.allowDecimal = properties.allowDecimal === "true";
  return properties as { allowDecimal?: boolean; [key: string]: unknown };
});
const conceptSchema = z.object({
  uuid: z.string(), name: conceptNameSchema, datatype: conceptTypeSchema, dataType: conceptTypeSchema.nullish().transform((value) => value ?? undefined),
  conceptClass: conceptTypeSchema.nullish().transform((value) => value ?? undefined),
  conceptHandler: nullableString.optional(),
  answers: z.preprocess((value) => value ?? [], z.array(answerSchema)),
  properties: conceptPropertiesSchema.optional(),
  description: z.preprocess((value) => value ?? undefined, labelSchema.optional()),
}).loose();
export type Form2Control = {
  type: string;
  id: string;
  label: z.infer<typeof labelSchema>;
  properties: {
    mandatory?: boolean; hidden?: boolean; abnormal?: boolean; multiSelect?: boolean;
    autoComplete?: boolean; autocomplete?: boolean; dropDown?: boolean; dropdown?: boolean; buttonSelect?: boolean;
    addMore?: boolean; notes?: boolean; allowFutureDates?: boolean; [key: string]: unknown;
  };
  concept?: z.infer<typeof conceptSchema>;
  controls: Form2Control[];
  units?: string | null;
  hiAbsolute?: number | null;
  lowAbsolute?: number | null;
  hiNormal?: number | null;
  lowNormal?: number | null;
};
const controlSchema: z.ZodType<Form2Control> = z.lazy(() => z.preprocess((value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const control = value as Record<string, unknown>;
  if (control.label !== undefined) return control;
  // Form Builder serializes static labels directly on the control while obs
  // controls use a nested `label`. Both shapes are consumed by the legacy
  // React renderer and must normalize to the same typed contract.
  return {
    ...control,
    label: {
      value: typeof control.value === "string" ? control.value : "",
      translationKey: typeof control.translationKey === "string" ? control.translationKey : undefined,
    },
  };
}, z.object({
  type: z.string(), id: z.union([z.string(), z.number()]).transform(String), label: labelSchema,
  properties: z.preprocess((value) => value ?? {}, z.object({
    mandatory: optionalBoolean.optional(), hidden: optionalBoolean.optional(), abnormal: optionalBoolean.optional(),
    multiSelect: optionalBoolean.optional(), addMore: optionalBoolean.optional(), notes: optionalBoolean.optional(),
    autoComplete: optionalBoolean.optional(), autocomplete: optionalBoolean.optional(),
    dropDown: optionalBoolean.optional(), dropdown: optionalBoolean.optional(), buttonSelect: optionalBoolean.optional(),
    allowFutureDates: optionalBoolean.optional(),
  }).loose()),
  concept: conceptSchema.optional(), controls: z.array(controlSchema).default([]), units: z.string().nullish(),
  hiAbsolute: optionalNumber, lowAbsolute: optionalNumber, hiNormal: optionalNumber, lowNormal: optionalNumber,
}).loose()));
export const form2DefinitionSchema = z.object({
  name: z.string(), uuid: z.string(), version: z.union([z.string(), z.number()]).optional(), controls: z.array(controlSchema),
  events: z.record(z.string(), z.string()).optional(),
}).loose();
export type Form2Definition = z.infer<typeof form2DefinitionSchema>;

export type Form2CodedControlStyle = "multiSelect" | "autocomplete" | "dropdown" | "buttonSelect";

/** Mirrors the legacy ConceptSet renderer: button selector is the default. */
export function form2CodedControlStyle(control: Form2Control): Form2CodedControlStyle {
  if (control.properties.multiSelect === true) return "multiSelect";
  if (control.properties.autoComplete === true || control.properties.autocomplete === true) return "autocomplete";
  if (control.properties.dropDown === true || control.properties.dropdown === true) return "dropdown";
  return "buttonSelect";
}

export interface Form2Observation {
  uuid?: string;
  concept: { uuid: string; name: string; dataType: string };
  value?: unknown;
  groupMembers: Form2Observation[];
  formNamespace: "Bahmni";
  formFieldPath: string;
  voided?: boolean;
  inactive?: boolean;
  interpretation?: "ABNORMAL" | null;
  comment?: string;
}

export type Form2Values = Record<string, unknown>;
export type Form2AbnormalState = Record<string, boolean | undefined>;
export type Form2Comments = Record<string, string | undefined>;
export interface Form2Issue { type: "error" | "warning"; code: "mandatory" | "allowDecimal" | "allowRange" | "minMaxRange" | "allowFutureDates" }

export interface Form2ControlLocation { row: number; column: number }
export interface Form2ControlRow { row: number; columns: number; controls: Array<{ control: Form2Control; column: number }> }

export function form2ControlLocation(control: Form2Control, fallbackRow = 0): Form2ControlLocation {
  const raw = control.properties.location;
  const location = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const parsedRow = Number(location.row);
  const parsedColumn = Number(location.column);
  return {
    row: Number.isInteger(parsedRow) && parsedRow >= 0 ? parsedRow : fallbackRow,
    column: Number.isInteger(parsedColumn) && parsedColumn >= 0 ? parsedColumn : 0,
  };
}

/** Mirrors bahmni-form-controls: group by configured row, then by column. */
export function groupForm2ControlsByRows(controls: Form2Control[]): Form2ControlRow[] {
  const rows = new Map<number, Array<{ control: Form2Control; column: number; sourceIndex: number }>>();
  controls.forEach((control, sourceIndex) => {
    const location = form2ControlLocation(control, sourceIndex);
    const row = rows.get(location.row) ?? [];
    row.push({ control, column: location.column, sourceIndex });
    rows.set(location.row, row);
  });
  return [...rows.entries()].sort(([left], [right]) => left - right).map(([row, entries]) => {
    const sorted = entries.sort((left, right) => left.column - right.column || left.sourceIndex - right.sourceIndex);
    return { row, columns: Math.max(1, ...sorted.map((entry) => entry.column + 1)), controls: sorted.map(({ control, column }) => ({ control, column })) };
  });
}

const knownHiddenControls: Array<{ matches(definition: Form2Definition): boolean; conceptNames: ReadonlySet<string> }> = [{
  matches: (definition) => definition.uuid === "7f659037-5aa5-44cc-aced-32a4d6ed113e" || definition.name === "Registration Details",
  conceptNames: new Set(["Body mass index", "BMI Status"]),
}];

/** Safe adapter for allow-listed legacy onFormInit visibility rules. */
export function isForm2ControlHidden(definition: Form2Definition, control: Form2Control): boolean {
  if (control.properties.hidden) return true;
  return knownHiddenControls.some((adapter) => adapter.matches(definition) && adapter.conceptNames.has(control.concept?.name ?? control.label.value));
}

/** Safe TypeScript port of the H&E "Other generic" control event. */
export function isKnownConditionalForm2ControlHidden(definition: Form2Definition, control: Form2Control, values: Form2Values, parentPath = ""): boolean {
  if (definition.name !== "History and Examination" || !/chief complaint.*(?:text|free)|non.?coded chief complaint/i.test(control.concept?.name ?? "")) return false;
  const candidates = flattenFormControls(definition.controls).filter((candidate) => /chief complaint/i.test(candidate.concept?.name ?? "") && candidate.concept?.datatype.toLowerCase() === "coded");
  const coded = candidates[0];
  if (!coded) return true;
  const selected = values[form2ValueKey(coded.id, parentPath)] ?? values[coded.id];
  const answer = coded.concept?.answers.find((candidate) => candidate.uuid === selected);
  const name = typeof answer?.name === "string" ? answer.name : answer?.name?.name ?? answer?.name?.display ?? answer?.displayString;
  return name?.toLocaleLowerCase() !== "other generic";
}

type ExistingObservation = Record<string, unknown>;

export function flattenFormControls(controls: Form2Control[]): Form2Control[] {
  return controls.flatMap((control) => [control, ...flattenFormControls(control.controls)]);
}

function codedUuid(value: unknown): string | undefined {
  return typeof value === "object" && value !== null && "uuid" in value ? String((value as { uuid: unknown }).uuid) : typeof value === "string" ? value : undefined;
}

/** Stable client key matching the indexed Form Builder field path. */
export function form2ValueKey(controlId: string, parentPath = "", index = 0): string {
  if (!parentPath && index === 0) return controlId;
  return `${parentPath ? `${parentPath}/` : ""}${controlId}-${index}`;
}

function pathAfterFormName(path: unknown): string {
  const value = String(path ?? "");
  const slash = value.indexOf("/");
  return slash >= 0 ? value.slice(slash + 1) : "";
}

export function initialFormValues(definition: Form2Definition, observations: Array<Record<string, unknown>>): Form2Values {
  const result: Form2Values = {};
  const flattened = flattenExistingObservations(observations);
  for (const control of flattenFormControls(definition.controls)) {
    if (!control.concept) continue;
    const matching = flattened.filter((item) => {
      const concept = item.concept as { uuid?: string } | undefined;
      return concept?.uuid === control.concept?.uuid && String(item.formFieldPath ?? "").includes(`/${control.id}-`);
    });
    if (!matching.length) continue;
    if (control.concept.datatype === "Coded" && control.properties.multiSelect) {
      result[control.id] = matching.map((observation) => codedUuid(observation.value)).filter(Boolean);
    } else {
      matching.forEach((observation, position) => {
        const observationPath = pathAfterFormName(observation.formFieldPath);
        const segments = observationPath.split("/");
        const segmentIndex = segments.findIndex((segment) => segment.startsWith(`${control.id}-`));
        const segment = segmentIndex >= 0 ? segments[segmentIndex] ?? `${control.id}-${position}` : `${control.id}-${position}`;
        const parentPath = segmentIndex > 0 ? segments.slice(0, segmentIndex).join("/") : "";
        const index = Number(segment.slice(control.id.length + 1));
        const key = form2ValueKey(control.id, parentPath, Number.isInteger(index) ? index : position);
        result[key] = control.concept!.datatype === "Coded" ? codedUuid(observation.value) : observation.value;
      });
    }
  }
  return result;
}

export function form2RepeatCount(control: Form2Control, parentPath: string, values: Form2Values, observations: Array<Record<string, unknown>>): number {
  const prefix = `${parentPath ? `${parentPath}/` : ""}${control.id}-`;
  const indexes = new Set<number>([0]);
  Object.keys(values).forEach((key) => {
    if (!key.startsWith(prefix)) return;
    const index = Number(key.slice(prefix.length).split("/")[0]);
    if (Number.isInteger(index) && index >= 0) indexes.add(index);
  });
  flattenExistingObservations(observations).forEach((observation) => {
    const path = pathAfterFormName(observation.formFieldPath);
    const start = path.indexOf(prefix);
    if (start < 0) return;
    const index = Number(path.slice(start + prefix.length).split("/")[0]);
    if (Number.isInteger(index) && index >= 0) indexes.add(index);
  });
  return Math.max(...indexes) + 1;
}

export function initialFormAbnormalState(definition: Form2Definition, observations: Array<Record<string, unknown>>): Form2AbnormalState {
  const flattened = flattenExistingObservations(observations);
  return Object.fromEntries(flattenFormControls(definition.controls).filter((control) => control.concept && control.properties.abnormal).map((control) => {
    const observation = flattened.find((item) => (item.concept as { uuid?: string } | undefined)?.uuid === control.concept?.uuid && String(item.formFieldPath ?? "").includes(`/${control.id}-`));
    return [control.id, observation?.interpretation === "ABNORMAL"];
  }));
}

export function initialFormComments(definition: Form2Definition, observations: Array<Record<string, unknown>>): Form2Comments {
  const flattened = flattenExistingObservations(observations);
  return Object.fromEntries(flattenFormControls(definition.controls).filter((control) => control.concept && control.properties.notes).map((control) => {
    const observation = flattened.find((item) => (item.concept as { uuid?: string } | undefined)?.uuid === control.concept?.uuid && String(item.formFieldPath ?? "").includes(`/${control.id}-`));
    return [control.id, typeof observation?.comment === "string" ? observation.comment : undefined];
  }));
}

export function hasForm2Value(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}

function numericValue(value: unknown): number | undefined {
  if (!hasForm2Value(value)) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function isOutsideNormalRange(control: Form2Control, value: unknown): boolean {
  const numeric = numericValue(value);
  if (numeric === undefined) return false;
  return control.lowNormal != null && numeric < control.lowNormal || control.hiNormal != null && numeric > control.hiNormal;
}

export function form2RangeLabel(control: Form2Control): string {
  const low = control.lowNormal;
  const high = control.hiNormal;
  if (low != null && high != null) return `${low} - ${high}`;
  if (low != null) return `> ${low}`;
  if (high != null) return `< ${high}`;
  return "";
}

export function validateForm2Control(control: Form2Control, value: unknown, now = new Date()): Form2Issue[] {
  if (!control.concept || control.properties.hidden) return [];
  const issues: Form2Issue[] = [];
  if (control.properties.mandatory && !hasForm2Value(value)) issues.push({ type: "error", code: "mandatory" });
  if (!hasForm2Value(value)) return issues;
  const datatype = control.concept.datatype.toLowerCase();
  if (datatype === "numeric") {
    const numeric = numericValue(value);
    if (numeric === undefined) return [...issues, { type: "error", code: "minMaxRange" }];
    if (control.concept.properties?.allowDecimal === false && numeric % 1 !== 0) issues.push({ type: "error", code: "allowDecimal" });
    if (control.lowAbsolute != null && numeric < control.lowAbsolute || control.hiAbsolute != null && numeric > control.hiAbsolute) issues.push({ type: "error", code: "minMaxRange" });
    if (isOutsideNormalRange(control, numeric)) issues.push({ type: "warning", code: "allowRange" });
  }
  if ((datatype === "date" || datatype === "datetime") && control.properties.allowFutureDates === false) {
    const parsed = new Date(String(value).replace(" ", "T"));
    if (!Number.isNaN(parsed.getTime()) && parsed.getTime() > now.getTime()) issues.push({ type: "error", code: "allowFutureDates" });
  }
  return issues;
}

function flattenExistingObservations(observations: ExistingObservation[]): ExistingObservation[] {
  return observations.flatMap((observation) => {
    const members = Array.isArray(observation.groupMembers)
      ? flattenExistingObservations(observation.groupMembers.filter((member): member is ExistingObservation => typeof member === "object" && member !== null && !Array.isArray(member)))
      : [];
    return [observation, ...members];
  });
}

function matchingObservation(observations: ExistingObservation[], path: string, conceptUuid: string): ExistingObservation | undefined {
  return observations.find((observation) => {
    const concept = observation.concept as { uuid?: string } | undefined;
    return observation.formFieldPath === path && concept?.uuid === conceptUuid;
  });
}

function observationsForPath(observations: ExistingObservation[], path: string, conceptUuid: string): ExistingObservation[] {
  return observations.filter((observation) => observation.formFieldPath === path && (observation.concept as { uuid?: string } | undefined)?.uuid === conceptUuid);
}

function conceptForWire(control: Form2Control) {
  return { uuid: control.concept!.uuid, name: control.concept!.name, dataType: control.concept!.datatype };
}

function repeatIndexes(control: Form2Control, parentPath: string, values: Form2Values, existing: ExistingObservation[]): number[] {
  if (!control.properties.addMore) return [0];
  const prefix = `${parentPath ? `${parentPath}/` : ""}${control.id}-`;
  const indexes = new Set<number>([0]);
  Object.keys(values).forEach((key) => {
    if (!key.startsWith(prefix)) return;
    const index = Number(key.slice(prefix.length).split("/")[0]);
    if (Number.isInteger(index) && index >= 0) indexes.add(index);
  });
  existing.forEach((observation) => {
    const path = pathAfterFormName(observation.formFieldPath);
    const offset = path.indexOf(prefix);
    if (offset < 0) return;
    const index = Number(path.slice(offset + prefix.length).split("/")[0]);
    if (Number.isInteger(index) && index >= 0) indexes.add(index);
  });
  return [...indexes].sort((left, right) => left - right);
}

function observationForControl(definition: Form2Definition, control: Form2Control, values: Form2Values, existing: ExistingObservation[], parentPath = "", abnormalState: Form2AbnormalState = {}, comments: Form2Comments = {}, index = 0): Form2Observation | Form2Observation[] | undefined {
  if (!control.concept) return undefined;
  const path = parentPath
    ? `${definition.name}.${definition.version ?? "1"}/${parentPath}/${control.id}-${index}`
    : `${definition.name}.${definition.version ?? "1"}/${control.id}-${index}`;
  const relativePath = parentPath ? `${parentPath}/${control.id}-${index}` : `${control.id}-${index}`;
  const previous = matchingObservation(existing, path, control.concept.uuid);
  const identity = typeof previous?.uuid === "string" ? { uuid: previous.uuid } : {};
  if (control.type === "obsGroupControl") {
    const abnormalControl = control.properties.abnormal
      ? control.controls.find((child) => child.concept?.conceptClass === "Abnormal")
      : undefined;
    const numericControls = control.controls.filter((child) => child.concept?.datatype.toLowerCase() === "numeric");
    const childParentPath = parentPath || control.properties.addMore ? relativePath : "";
    const childValue = (child: Form2Control) => values[form2ValueKey(child.id, childParentPath)] ?? values[child.id];
    const hasNumericValue = numericControls.some((child) => hasForm2Value(childValue(child)));
    const groupValues = abnormalControl
      ? { ...values, [form2ValueKey(abnormalControl.id, childParentPath)]: hasNumericValue ? numericControls.some((child) => isOutsideNormalRange(child, childValue(child))) : undefined }
      : values;
    const groupMembers = control.controls.flatMap((child) => {
      return repeatIndexes(child, childParentPath, groupValues, existing).flatMap((childIndex) => {
        const observation = observationForControl(definition, child, groupValues, existing, childParentPath, abnormalState, comments, childIndex);
        return observation ? Array.isArray(observation) ? observation : [observation] : [];
      });
    });
    if (!groupMembers.length && !previous) return undefined;
    const voided = Boolean(previous) && groupMembers.every((member) => member.voided);
    return { ...identity, concept: conceptForWire(control), groupMembers, formNamespace: "Bahmni", formFieldPath: path, voided, inactive: false };
  }
  const valueKey = form2ValueKey(control.id, parentPath, index);
  const value = values[valueKey] ?? (index === 0 ? values[control.id] : undefined);
  const comment = comments[valueKey] ?? (index === 0 ? comments[control.id] : undefined);
  const abnormal = abnormalState[valueKey] ?? (index === 0 ? abnormalState[control.id] : undefined);
  if (control.concept.datatype === "Coded" && control.properties.multiSelect) {
    const selected = Array.isArray(value) ? value.map(String) : [];
    const previousValues = observationsForPath(existing, path, control.concept.uuid);
    const active = selected.map((selectedUuid) => {
      const answer = control.concept!.answers.find((candidate) => candidate.uuid === selectedUuid) ?? { uuid: selectedUuid };
      const prior = previousValues.find((candidate) => codedUuid(candidate.value) === selectedUuid);
      return {
        ...(typeof prior?.uuid === "string" ? { uuid: prior.uuid } : {}), concept: conceptForWire(control), value: answer,
        groupMembers: [], formNamespace: "Bahmni" as const, formFieldPath: path, voided: false, inactive: false,
        ...(comment ? { comment } : {}),
      };
    });
    const removed = previousValues.filter((candidate) => !selected.includes(codedUuid(candidate.value) ?? "")).map((candidate) => ({
      ...(typeof candidate.uuid === "string" ? { uuid: candidate.uuid } : {}), concept: conceptForWire(control),
      groupMembers: [], formNamespace: "Bahmni" as const, formFieldPath: path, voided: true, inactive: false,
    }));
    return [...active, ...removed];
  }
  if (!hasForm2Value(value)) {
    return previous ? { ...identity, concept: conceptForWire(control), groupMembers: [], formNamespace: "Bahmni", formFieldPath: path, voided: true, inactive: false } : undefined;
  }
  const isVoidedComplex = control.concept.datatype.toLowerCase() === "complex" && typeof value === "string" && value.endsWith("voided");
  const normalizedValue = isVoidedComplex ? value.replace(/voided$/u, "") : value;
  const mappedValue = control.concept.datatype === "Coded"
    ? control.concept.answers.find((answer) => answer.uuid === value) ?? { uuid: String(value) }
    : normalizedValue;
  const isAbnormal = abnormal ?? (control.properties.abnormal && isOutsideNormalRange(control, value));
  return {
    ...identity, concept: conceptForWire(control), value: mappedValue, groupMembers: [], formNamespace: "Bahmni",
    formFieldPath: path, voided: isVoidedComplex, inactive: false,
    ...(control.properties.abnormal ? { interpretation: isAbnormal ? "ABNORMAL" : null } : {}),
    ...(comment ? { comment } : {}),
  };
}

export function buildFormObservations(definition: Form2Definition, values: Form2Values, observations: ExistingObservation[] = [], abnormalState: Form2AbnormalState = {}, comments: Form2Comments = {}): Form2Observation[] {
  const existing = flattenExistingObservations(observations);
  return definition.controls.flatMap((control) => {
    if (control.type === "section") return control.controls.flatMap((child) => {
      return repeatIndexes(child, "", values, existing).flatMap((index) => {
        const observation = observationForControl(definition, child, values, existing, "", abnormalState, comments, index);
        return observation ? Array.isArray(observation) ? observation : [observation] : [];
      });
    });
    return repeatIndexes(control, "", values, existing).flatMap((index) => {
      const observation = observationForControl(definition, control, values, existing, "", abnormalState, comments, index);
      return observation ? Array.isArray(observation) ? observation : [observation] : [];
    });
  });
}

function answerUuidByName(control: Form2Control | undefined, name: string): string | undefined {
  return control?.concept?.answers.find((answer) => {
    const answerName = typeof answer.name === "string" ? answer.name : answer.name?.name ?? answer.name?.display ?? answer.displayString;
    return answerName === name;
  })?.uuid;
}

export function applyKnownFormAdapters(definition: Form2Definition, values: Form2Values): Form2Values {
  if (definition.name !== "Registration Details") return values;
  const controls = flattenFormControls(definition.controls);
  const height = controls.find((control) => control.concept?.name === "Height (cm)");
  const weight = controls.find((control) => control.concept?.name === "Weight (kg)");
  const bmi = controls.find((control) => control.concept?.name === "Body mass index");
  const status = controls.find((control) => control.concept?.name === "BMI Status");
  const heightValue = Number(height ? values[height.id] : 0);
  const weightValue = Number(weight ? values[weight.id] : 0);
  if (!heightValue || !weightValue || !bmi || !status) return { ...values, ...(bmi ? { [bmi.id]: "" } : {}), ...(status ? { [status.id]: "" } : {}) };
  const bmiValue = Number((weightValue / ((heightValue * heightValue) / 10_000)).toFixed(2));
  const statusName = bmiValue < 16 ? "Cachexia"
    : bmiValue < 17 ? "Malnutrition of moderate degree (Gomez: 60% to Less than 75% of Standard Weight)"
      : bmiValue < 18.5 ? "Malnutrition of mild degree (Gomez: 75% to Less than 90% of Standard Weight)"
        : bmiValue < 25 ? "Normal" : bmiValue < 30 ? "Overweight (BMI 25.0-29.9)" : bmiValue < 35 ? "Obesity" : "Morbid Obesity";
  return { ...values, [bmi.id]: bmiValue, [status.id]: answerUuidByName(status, statusName) ?? "" };
}
