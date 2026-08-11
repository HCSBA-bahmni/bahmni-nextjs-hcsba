import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import { AutoComplete, type AutoCompleteCompleteEvent } from "primereact/autocomplete";
import { Button } from "primereact/button";
import { Calendar } from "primereact/calendar";
import { Checkbox } from "primereact/checkbox";
import { Dropdown } from "primereact/dropdown";
import { InputNumber } from "primereact/inputnumber";
import { InputText } from "primereact/inputtext";
import { useMemo, useState, type PropsWithChildren } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import type { RegistrationConfig } from "@/config-compat/registrationConfig";
import { runConfiguredValidator } from "@/config-compat/validators";
import { searchAddressEntries, type AddressEntry, type AddressLevel } from "@/services/bahmni/address";
import { BahmniApiError } from "@/services/bahmni/http";
import { getConceptAnswers, searchPersons, searchProviders, type IdentifierType, type PersonAttributeType } from "@/services/bahmni/metadata";
import type { PatientFormValues, Reference } from "@/types/bahmni";
import { ageFromBirthDate, birthDateFromAge, type PatientAge } from "./age";
import { composeIdentifier, identifierSuffix, selectIdentifierSource, validateConfiguredIdentifier } from "./identifierConfig";
import { buildPatientAttributeLayout, patientAttributeTranslationKey } from "./patientAttributeLayout";
import { PatientPrint } from "./PatientPrint";
import { useRegistrationTranslations } from "./useRegistrationTranslations";
import type { RegistrationSubmitIntent, RegistrationWorkflowAction } from "./workflow";

const schema = z.object({
  nameUuid: z.string().optional(), addressUuid: z.string().optional(), identifierUuid: z.string().optional(),
  givenName: z.string().min(1, "Obligatorio"), middleName: z.string().optional(), familyName: z.string(), gender: z.string().min(1, "Obligatorio"),
  birthDate: z.string().optional(), birthDateEstimated: z.boolean().optional(), ageYears: z.number().min(0).max(120).optional(), ageMonths: z.number().min(0).max(12).optional(), ageDays: z.number().min(0).max(31).optional(), birthTime: z.string().optional(), identifier: z.string().optional(), identifierTypeUuid: z.string().optional(), identifierSourceUuid: z.string().optional(), identifierPrefix: z.string().optional(), identifierSuffix: z.string().optional(), additionalIdentifiers: z.array(z.object({ uuid: z.string().optional(), identifier: z.string().optional(), identifierTypeUuid: z.string(), identifierSourceUuid: z.string().optional(), identifierPrefix: z.string().optional(), identifierSuffix: z.string().optional(), voided: z.boolean().optional() })).optional(), locationUuid: z.string().optional(),
  phoneNumber: z.string().optional(), address1: z.string().optional(), address2: z.string().optional(), address3: z.string().optional(), address4: z.string().optional(), address5: z.string().optional(), address6: z.string().optional(), cityVillage: z.string().optional(), stateProvince: z.string().optional(), countyDistrict: z.string().optional(), country: z.string().optional(), postalCode: z.string().optional(),
  dead: z.boolean().optional(), deathDate: z.string().optional(), causeOfDeathUuid: z.string().optional(), attributes: z.record(z.string(), z.unknown()), attributeUuids: z.record(z.string(), z.string()).optional(),
  relationships: z.array(z.object({ relationshipTypeUuid: z.string(), personUuid: z.string(), personDisplay: z.string().optional(), relationshipUuid: z.string().optional(), voided: z.boolean().optional() })), image: z.string().optional(), uuid: z.string().optional(),
}).refine((value) => Boolean(value.birthDate || value.ageYears !== undefined || value.ageMonths !== undefined || value.ageDays !== undefined), { path: ["birthDate"], message: "Ingrese fecha de nacimiento o edad" })
  .refine((value) => !value.birthDate || ageFromBirthDate(value.birthDate) !== undefined, { path: ["birthDate"], message: "La fecha de nacimiento no puede ser futura" });

const fallbackPrintOptions = [
  { label: "Tarjeta local", translationKey: "REGISTRATION_PRINT_REG_CARD_LOCAL_KEY", templateUrl: "/registration/registrationCardLayout/print_local.html" },
  { label: "Tarjeta estándar", translationKey: "REGISTRATION_PRINT_REG_CARD_KEY", templateUrl: "/registration/registrationCardLayout/print.html" },
  { label: "Documento suplementario", translationKey: "REGISTRATION_PRINT_SUPPLEMENTAL_PAPER", templateUrl: "/registration/supplementalPaperLayout/print.html" },
  { label: "Código de barras", translationKey: "REGISTRATION_PRINT_WITH_BARCODE", templateUrl: "/registration/registrationCardLayout/printWithBarcode.html" },
];

type AddressKey = "address1" | "address2" | "address3" | "address4" | "address5" | "address6" | "cityVillage" | "countyDistrict" | "stateProvince" | "postalCode" | "country";
const addressKeys = new Set<AddressKey>(["address1", "address2", "address3", "address4", "address5", "address6", "cityVillage", "countyDistrict", "stateProvince", "postalCode", "country"]);
const dropdownA11y = (label: string) => ({ select: { "aria-label": label }, trigger: { "aria-label": `Abrir ${label}` } });
const plainTranslation = (value: string) => value.replace(/<[^>]+>/g, "");

function InputGroup({ children }: PropsWithChildren) { return <div className="p-inputgroup">{children}</div>; }
function InputGroupAddon({ children, ariaLabel }: PropsWithChildren<{ ariaLabel?: string }>) {
  const accessibleLabel = ariaLabel ?? (typeof children === "string" && ["Años", "Meses", "Días"].includes(children) ? undefined : "Prefijo del identificador");
  return <span className="p-inputgroup-addon" aria-label={accessibleLabel} aria-hidden={!accessibleLabel}>{children}</span>;
}

function CollapsiblePatientSection({ title, initiallyOpen = false, children }: PropsWithChildren<{ title: string; initiallyOpen?: boolean }>) {
  const [open, setOpen] = useState(initiallyOpen);
  return <details className="panel patient-additional-section" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}><summary>{title}</summary>{children}</details>;
}

function dateFromIso(value?: string): Date | null {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  return year && month && day ? new Date(year, month - 1, day) : null;
}

function isoFromDate(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function dateFromTime(value?: string): Date | null {
  if (!value) return null;
  const [hours, minutes] = value.split(":").map(Number);
  const date = new Date();
  date.setHours(hours || 0, minutes || 0, 0, 0);
  return date;
}

function timeFromDate(value: Date): string {
  return `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;
}

interface Props {
  initial?: Partial<PatientFormValues>;
  identifierTypes: IdentifierType[];
  attributeTypes?: PersonAttributeType[];
  relationshipTypes?: Reference[];
  addressLevels?: AddressLevel[];
  config?: RegistrationConfig;
  workflow?: {
    action: RegistrationWorkflowAction | null;
    loading: boolean;
    visitTypes: Reference[];
    selectedVisitTypeUuid: string;
    setSelectedVisitTypeUuid(value: string): void;
  };
  onSave(values: PatientFormValues, jumpAccepted: boolean, intent: RegistrationSubmitIntent): Promise<void>;
  onGenerateId(identifierSourceName?: string): Promise<string>;
}

function DynamicAttributeField({ attribute, label, value, error, onChange }: { attribute: PersonAttributeType; label: string; value: unknown; error?: string; onChange(value: unknown): void }) {
  const conceptUuid = attribute.concept?.uuid;
  const answers = useQuery({ queryKey: ["concept-answers", conceptUuid], queryFn: () => getConceptAnswers(conceptUuid!), enabled: Boolean(conceptUuid) });
  const format = (attribute.format ?? "").toLowerCase();
  const id = `attribute-${attribute.uuid}`;
  const required = attribute.required === true;
  return <div className="field"><label htmlFor={id}>{label}{required ? " *" : ""}</label>
    {conceptUuid ? <Dropdown inputId={id} pt={dropdownA11y(label)} value={value ?? ""} options={answers.data ?? []} optionLabel="display" optionValue="uuid" loading={answers.isLoading} onChange={(event) => onChange(event.value)} />
      : format.includes("date") ? <InputText id={id} type="date" value={String(value ?? "")} onChange={(event) => onChange(event.target.value)} />
        : format.includes("boolean") ? <div><Checkbox inputId={id} checked={Boolean(value)} onChange={(event) => onChange(Boolean(event.checked))} /> <span>Sí</span></div>
          : <InputText id={id} value={String(value ?? "")} onChange={(event) => onChange(event.target.value)} />}
    {error && <small className="field-error">{error}</small>}
  </div>;
}

function HierarchyAddressField({ level, value, error, onChange, onSelect }: { level: AddressLevel; value: string; error?: string; onChange(value: string): void; onSelect(entry: AddressEntry): void }) {
  const [suggestions, setSuggestions] = useState<AddressEntry[]>([]);
  const complete = async (event: AutoCompleteCompleteEvent) => setSuggestions(event.query.trim().length < 2 ? [] : await searchAddressEntries(level.addressField, event.query));
  return <div className="field"><label htmlFor={`address-${level.addressField}`}>{level.name}{level.required ? " *" : ""}</label><AutoComplete inputId={`address-${level.addressField}`} value={value} suggestions={suggestions} field="name" completeMethod={(event) => void complete(event)} onChange={(event) => onChange(typeof event.value === "string" ? event.value : event.value?.name ?? "")} onSelect={(event) => onSelect(event.value as AddressEntry)} dropdown={false} /><small>Escriba al menos 2 caracteres para usar la jerarquía.</small>{error && <small className="field-error">{error}</small>}</div>;
}

function AdditionalIdentifierField({ type, value, error, onChange, onGenerate }: { type: IdentifierType; value: NonNullable<PatientFormValues["additionalIdentifiers"]>[number]; error?: string; onChange(value: NonNullable<PatientFormValues["additionalIdentifiers"]>[number]): void; onGenerate(sourceName?: string): Promise<string> }) {
  const sources = type.identifierSources ?? [];
  const selectedSource = sources.find((source) => source.uuid === value.identifierSourceUuid) ?? selectIdentifierSource(type);
  const prefix = selectedSource?.prefix ?? value.identifierPrefix ?? "";
  const suffix = value.identifierSuffix ?? identifierSuffix(value.identifier, prefix);
  const id = `additional-identifier-${type.uuid}`;
  return <div className="field additional-identifier-field">
    <label htmlFor={id}>{type.display ?? type.name ?? "Identificador"}{type.required ? " *" : ""}</label>
    <div className="additional-identifier-control">
      {sources.length > 1 && <Dropdown aria-label={`Fuente de ${type.display ?? type.name}`} value={selectedSource?.uuid} options={sources} optionLabel="prefix" optionValue="uuid" onChange={(event) => { const source = sources.find((item) => item.uuid === event.value); onChange({ ...value, identifierSourceUuid: source?.uuid, identifierPrefix: source?.prefix ?? "", identifier: composeIdentifier(source?.prefix, suffix) }); }} />}
      <InputGroup>{prefix && <InputGroupAddon>{prefix}</InputGroupAddon>}<InputText id={id} value={suffix} onChange={(event) => onChange({ ...value, identifierSuffix: event.target.value, identifierPrefix: prefix, identifierSourceUuid: selectedSource?.uuid, identifier: composeIdentifier(prefix, event.target.value), voided: false })} />{selectedSource && <Button type="button" icon="pi pi-refresh" aria-label={`Generar ${type.display ?? type.name}`} onClick={async () => { const generated = await onGenerate(selectedSource.prefix ?? selectedSource.name); onChange({ ...value, identifier: generated, identifierSuffix: identifierSuffix(generated, prefix), identifierPrefix: prefix, identifierSourceUuid: selectedSource.uuid, voided: false }); }} />}</InputGroup>
    </div>
    {error && <small className="field-error">{error}</small>}
  </div>;
}

function RelationshipRow({ index, relationship, relationshipTypes, typeMap, onChange, onRemove }: { index: number; relationship: PatientFormValues["relationships"][number]; relationshipTypes: Reference[]; typeMap: RegistrationConfig["relationshipTypeMap"]; onChange(value: PatientFormValues["relationships"][number]): void; onRemove(): void }) {
  const [suggestions, setSuggestions] = useState<Reference[]>([]);
  const selectedType = relationshipTypes.find((type) => type.uuid === relationship.relationshipTypeUuid);
  const relationName = selectedType?.name ?? selectedType?.display ?? "";
  const target = typeMap[relationName] ?? "patient";
  const complete = async (event: AutoCompleteCompleteEvent) => {
    if (event.query.trim().length < 2) return setSuggestions([]);
    setSuggestions(target === "provider" ? await searchProviders(event.query) : await searchPersons(event.query));
  };
  return <div className="toolbar relationship-row">
    <Dropdown aria-label={`Tipo de relación ${index + 1}`} pt={dropdownA11y(`Tipo de relación ${index + 1}`)} value={relationship.relationshipTypeUuid} options={relationshipTypes} optionLabel="display" optionValue="uuid" placeholder="Tipo de relación" onChange={(event) => onChange({ ...relationship, relationshipTypeUuid: String(event.value), personUuid: "", personDisplay: "" })} />
    <AutoComplete aria-label={`Persona relacionada ${index + 1}`} value={relationship.personDisplay ?? relationship.personUuid} suggestions={suggestions} field="display" placeholder={target === "provider" ? "Buscar proveedor" : "Buscar paciente"} completeMethod={(event) => void complete(event)} onChange={(event) => onChange({ ...relationship, personDisplay: typeof event.value === "string" ? event.value : event.value?.display ?? "", personUuid: typeof event.value === "string" ? "" : event.value?.uuid ?? "" })} onSelect={(event) => { const person = event.value as Reference; onChange({ ...relationship, personUuid: person.uuid, personDisplay: person.display ?? person.name ?? person.uuid }); }} />
    <Button type="button" icon="pi pi-trash" severity="danger" text aria-label="Quitar relación" onClick={onRemove} />
  </div>;
}

export function PatientForm({ initial, identifierTypes, attributeTypes = [], relationshipTypes = [], addressLevels = [], config, workflow, onSave, onGenerateId }: Props) {
  useRegistrationTranslations();
  const { t } = useTranslation();
  const printOptions = config?.printOptions.length ? config.printOptions : fallbackPrintOptions;
  const translatedPrintOptions = printOptions.map((option) => ({ ...option, label: plainTranslation(t(option.translationKey ?? option.label, { defaultValue: option.label })) }));
  const primaryIdentifier = identifierTypes.find((type) => type.primary) ?? identifierTypes[0];
  const initialIdentifierType = identifierTypes.find((type) => type.uuid === initial?.identifierTypeUuid) ?? primaryIdentifier;
  const sourceMatchingExistingIdentifier = initialIdentifierType?.identifierSources.find((source) => Boolean(source.prefix) && initial?.identifier?.startsWith(source.prefix ?? ""));
  const initialIdentifierSource = initialIdentifierType?.identifierSources.find((source) => source.uuid === initial?.identifierSourceUuid)
    ?? sourceMatchingExistingIdentifier
    ?? selectIdentifierSource(initialIdentifierType, initial?.identifierPrefix ?? config?.defaultIdentifierPrefix);
  const initialPrefix = initial?.identifierPrefix ?? initialIdentifierSource?.prefix ?? "";
  const initialAdditionalIdentifiers = identifierTypes.filter((type) => type.uuid !== initialIdentifierType?.uuid).map((type) => {
    const existing = initial?.additionalIdentifiers?.find((identifier) => identifier.identifierTypeUuid === type.uuid);
    const source = type.identifierSources.find((item) => item.uuid === existing?.identifierSourceUuid)
      ?? type.identifierSources.find((item) => Boolean(item.prefix) && existing?.identifier?.startsWith(item.prefix ?? ""))
      ?? selectIdentifierSource(type);
    const prefix = existing?.identifierPrefix ?? source?.prefix ?? "";
    return { identifierTypeUuid: type.uuid, ...existing, identifierSourceUuid: existing?.identifierSourceUuid ?? source?.uuid, identifierPrefix: prefix, identifierSuffix: existing?.identifierSuffix ?? identifierSuffix(existing?.identifier, prefix) };
  });
  const initialAge = initial?.birthDate ? ageFromBirthDate(initial.birthDate) : undefined;
  const defaultAttributes = Object.fromEntries(attributeTypes.flatMap((type) => {
    const name = type.name ?? type.display ?? "";
    return name in (config?.attributeDefaults ?? {}) ? [[type.uuid, config?.attributeDefaults[name]]] : [];
  }));
  const [template, setTemplate] = useState(printOptions[0]?.templateUrl ?? "");
  const [showPrint, setShowPrint] = useState(false);
  const [duplicate, setDuplicate] = useState(false);
  const [duplicateIntent, setDuplicateIntent] = useState<RegistrationSubmitIntent>({ kind: "save" });
  const [saveError, setSaveError] = useState("");
  const [configuredErrors, setConfiguredErrors] = useState<Record<string, string>>({});
  const [removedRelationships, setRemovedRelationships] = useState<PatientFormValues["relationships"]>([]);
  const form = useForm<PatientFormValues>({ resolver: zodResolver(schema), defaultValues: { givenName: "", familyName: "", gender: "", relationships: [], dead: false, birthDateEstimated: false, ...initial, ageYears: initial?.ageYears ?? initialAge?.years, ageMonths: initial?.ageMonths ?? initialAge?.months, ageDays: initial?.ageDays ?? initialAge?.days, identifierTypeUuid: initial?.identifierTypeUuid || initialIdentifierType?.uuid, identifierSourceUuid: initial?.identifierSourceUuid || initialIdentifierSource?.uuid, identifierPrefix: initial?.identifierPrefix || initialPrefix, identifierSuffix: initial?.identifierSuffix ?? identifierSuffix(initial?.identifier, initialPrefix), additionalIdentifiers: initialAdditionalIdentifiers, attributes: { ...defaultAttributes, ...initial?.attributes } } });
  const { register, control, getValues, handleSubmit, setValue, formState: { errors, isSubmitting } } = form;
  const patient = useWatch({ control }) as PatientFormValues;
  const relationships = useWatch({ control, name: "relationships" }) ?? [];
  const additionalIdentifiers = useWatch({ control, name: "additionalIdentifiers" }) ?? [];
  const selectedIdentifierType = identifierTypes.find((type) => type.uuid === patient.identifierTypeUuid);
  const identifierSources = selectedIdentifierType?.identifierSources ?? [];
  const selectedIdentifierSource = identifierSources.find((source) => source.uuid === patient.identifierSourceUuid);
  const configuredDefaultPrefixMissing = Boolean(selectedIdentifierType?.primary && config?.defaultIdentifierPrefix && identifierSources.length && !identifierSources.some((source) => source.prefix === config.defaultIdentifierPrefix));
  const attributeLayout = useMemo(() => buildPatientAttributeLayout(attributeTypes, config), [attributeTypes, config]);
  const orderedAddressLevels = config?.addressHierarchy.showAddressFieldsTopDown ? addressLevels : [...addressLevels].reverse();
  const translatedAttributeLabel = (attribute: PersonAttributeType) => {
    const fallback = attribute.description ?? attribute.display ?? attribute.name ?? "Atributo";
    return plainTranslation(t(patientAttributeTranslationKey(fallback), { defaultValue: fallback }));
  };

  const fileToImage = (file?: File) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return setSaveError("La fotografía no puede superar 5 MB.");
    const reader = new FileReader(); reader.onload = () => setValue("image", String(reader.result)); reader.readAsDataURL(file);
  };
  const validateConfigured = (values: PatientFormValues) => {
    const messages: Record<string, string> = {};
    for (const [name, rule] of Object.entries(config?.fieldValidation ?? {})) {
      const attribute = attributeTypes.find((type) => (type.name ?? type.display) === name);
      const value = attribute ? values.attributes[attribute.uuid] : values[name as keyof PatientFormValues];
      if (value === undefined || value === null || String(value).trim() === "") continue;
      if (rule.pattern) { const result = runConfiguredValidator("regex", value, { pattern: rule.pattern, message: rule.errorMessage }); if (!result.valid) messages[attribute?.uuid ?? name] = result.message ?? "Formato inválido"; }
    }
    for (const attribute of attributeTypes) {
      const value = values.attributes[attribute.uuid];
      if (attribute.required === true && (value === undefined || value === null || String(value).trim() === "")) messages[attribute.uuid] = "Obligatorio";
    }
    if (config?.isLastNameMandatory && !values.familyName.trim()) messages.familyName = "Obligatorio";
    const identifier = values.identifier || composeIdentifier(values.identifierPrefix, values.identifierSuffix ?? "");
    const identifierValidation = validateConfiguredIdentifier(identifierTypes.find((type) => type.uuid === values.identifierTypeUuid), identifier, Boolean(values.identifierSourceUuid));
    if (!identifierValidation.valid) messages.identifier = identifierValidation.message ?? "Identificador inválido";
    for (const [index, additional] of (values.additionalIdentifiers ?? []).entries()) {
      const type = identifierTypes.find((item) => item.uuid === additional.identifierTypeUuid);
      const composed = additional.identifier || composeIdentifier(additional.identifierPrefix, additional.identifierSuffix ?? "");
      if (!composed && !type?.required) continue;
      const validation = validateConfiguredIdentifier(type, composed, Boolean(additional.identifierSourceUuid));
      if (!validation.valid) messages[`additionalIdentifiers.${index}`] = validation.message ?? "Identificador inválido";
    }
    setConfiguredErrors(messages);
    return Object.keys(messages).length === 0;
  };
  const submit = async (values: PatientFormValues, jumpAccepted: boolean, intent: RegistrationSubmitIntent) => {
    setSaveError("");
    const attributes = { ...values.attributes };
    const composedIdentifier = composeIdentifier(values.identifierPrefix, values.identifierSuffix ?? "") || values.identifier || undefined;
    const normalized = { ...values, identifier: composedIdentifier, attributes, relationships: [...values.relationships.filter((relationship) => relationship.relationshipTypeUuid && relationship.personUuid), ...removedRelationships] };
    if (!validateConfigured(normalized)) return;
    try { await onSave(normalized, jumpAccepted, intent); setDuplicate(false); }
    catch (error) {
      const duplicateResponse = error instanceof BahmniApiError && ([409, 412].includes(error.status) || JSON.stringify(error.payload).toLowerCase().includes("duplicate"));
      if (duplicateResponse && !jumpAccepted) { setDuplicateIntent(intent); setDuplicate(true); }
      else setSaveError(error instanceof BahmniApiError ? error.message : "No fue posible guardar el paciente.");
    }
  };
  const applyHierarchy = (currentField: AddressKey, entry: AddressEntry) => {
    setValue(currentField, entry.name);
    let parent = entry.parent;
    while (parent) { if (parent.addressField && addressKeys.has(parent.addressField as AddressKey)) setValue(parent.addressField as AddressKey, parent.name); parent = parent.parent; }
  };
  const changeIdentifierType = (typeUuid: string) => {
    const type = identifierTypes.find((item) => item.uuid === typeUuid);
    const source = selectIdentifierSource(type, config?.defaultIdentifierPrefix);
    setValue("identifierTypeUuid", typeUuid);
    setValue("identifierSourceUuid", source?.uuid);
    setValue("identifierPrefix", source?.prefix ?? "");
    setValue("identifierSuffix", "");
    setValue("identifier", "");
    setValue("identifierUuid", undefined);
    setConfiguredErrors((current) => ({ ...current, identifier: "" }));
  };
  const changeIdentifierSource = (sourceUuid: string) => {
    const source = identifierSources.find((item) => item.uuid === sourceUuid);
    const suffix = patient.identifierSuffix ?? "";
    setValue("identifierSourceUuid", source?.uuid);
    setValue("identifierPrefix", source?.prefix ?? "");
    setValue("identifier", composeIdentifier(source?.prefix, suffix));
  };
  const changeIdentifierSuffix = (suffix: string) => {
    setValue("identifierSuffix", suffix);
    setValue("identifier", composeIdentifier(selectedIdentifierSource?.prefix ?? patient.identifierPrefix, suffix));
  };
  const changeBirthDate = (date: Date | null) => {
    if (!date) {
      setValue("birthDate", "", { shouldValidate: true });
      setValue("ageYears", undefined);
      setValue("ageMonths", undefined);
      setValue("ageDays", undefined);
      return;
    }
    const birthDate = isoFromDate(date);
    const age = ageFromBirthDate(birthDate);
    if (!age) return;
    setValue("birthDate", birthDate, { shouldValidate: true });
    setValue("birthDateEstimated", false);
    setValue("ageYears", age.years);
    setValue("ageMonths", age.months);
    setValue("ageDays", age.days);
  };
  const changeEstimatedAge = (field: keyof PatientAge, value?: number) => {
    const age = {
      years: field === "years" ? value : patient.ageYears,
      months: field === "months" ? value : patient.ageMonths,
      days: field === "days" ? value : patient.ageDays,
    };
    setValue(field === "years" ? "ageYears" : field === "months" ? "ageMonths" : "ageDays", value, { shouldValidate: true });
    if (age.years === undefined && age.months === undefined && age.days === undefined) {
      setValue("birthDate", "", { shouldValidate: true });
      return;
    }
    setValue("birthDate", birthDateFromAge(age), { shouldValidate: true });
    setValue("birthDateEstimated", true);
  };

  const workflowLabel = workflow?.action ? plainTranslation(t(workflow.action.translationKey, {
    defaultValue: workflow.action.defaultLabel,
    visitType: workflow.action.intent.kind === "startVisit" ? workflow.action.intent.visitTypeName : undefined,
  })) : "";

  return <form onSubmit={handleSubmit((values) => submit(values, false, { kind: "save" }))}>
    {saveError && <div role="alert" className="error-banner">{saveError}</div>}
    <section className="panel patient-profile-panel">
      <div className="patient-profile-heading"><div><span className="patient-profile-kicker">{initial?.uuid ? "Paciente registrado" : "Nuevo paciente"}</span><strong>{patient.identifier || "Identificador por asignar"}</strong></div><div className="patient-photo-control">{patient.image && <Image unoptimized src={patient.image} alt="Fotografía del paciente" width={76} height={76} />}<label className="patient-photo-button">Foto<input aria-label="Fotografía del paciente" type="file" accept="image/*" capture="user" onChange={(event) => fileToImage(event.target.files?.[0])} /></label></div></div>
      <h2 className="patient-section-title">Datos de identificación</h2>
      <div className="patient-profile-grid">
        <div className="field patient-name-group"><label>Nombre del paciente *</label><div className="patient-name-inputs"><InputText id="givenName" aria-label="Nombres" placeholder="Nombres" {...register("givenName")} />{config?.showMiddleName !== false && <InputText id="middleName" aria-label="Segundo nombre" placeholder="Segundo nombre" {...register("middleName")} />}{config?.showLastName !== false && <InputText id="familyName" aria-label="Apellidos" placeholder="Apellidos" {...register("familyName")} />}</div><small className="field-error">{errors.givenName?.message ?? configuredErrors.givenName ?? errors.familyName?.message ?? configuredErrors.familyName}</small></div>
        {attributeLayout.localNames.length === 3 && <div className="field patient-name-group"><label>Nombre social</label><div className="patient-name-inputs">{attributeLayout.localNames.map((attribute) => <InputText key={attribute.uuid} aria-label={translatedAttributeLabel(attribute)} placeholder={translatedAttributeLabel(attribute)} value={String(patient.attributes?.[attribute.uuid] ?? "")} onChange={(event) => setValue(`attributes.${attribute.uuid}`, event.target.value)} />)}</div></div>}
        <div className="field"><label htmlFor="gender">Género *</label><Dropdown inputId="gender" pt={dropdownA11y("Género")} value={patient.gender} options={[{ label: "Femenino", value: "F" }, { label: "Masculino", value: "M" }, { label: "Otro", value: "O" }, { label: "Desconocido", value: "U" }]} onChange={(event) => setValue("gender", String(event.value), { shouldValidate: true })} /><small className="field-error">{errors.gender?.message}</small></div>
        <div className="field"><label>Edad</label><div className="age-inputs"><InputGroup><InputGroupAddon>Años</InputGroupAddon><InputNumber inputId="ageYears" aria-label="Años" value={patient.ageYears} onValueChange={(event) => changeEstimatedAge("years", event.value ?? undefined)} min={0} max={120} useGrouping={false} /></InputGroup><InputGroup><InputGroupAddon>Meses</InputGroupAddon><InputNumber inputId="ageMonths" aria-label="Meses" value={patient.ageMonths} onValueChange={(event) => changeEstimatedAge("months", event.value ?? undefined)} min={0} max={12} useGrouping={false} /></InputGroup><InputGroup><InputGroupAddon>Días</InputGroupAddon><InputNumber inputId="ageDays" aria-label="Días" value={patient.ageDays} onValueChange={(event) => changeEstimatedAge("days", event.value ?? undefined)} min={0} max={31} useGrouping={false} /></InputGroup></div><small className="field-error">{errors.ageYears?.message ?? errors.ageMonths?.message ?? errors.ageDays?.message}</small></div>
        <div className="field"><label htmlFor="birthDate">Fecha de nacimiento</label><Calendar inputId="birthDate" value={dateFromIso(patient.birthDate)} onChange={(event) => changeBirthDate(event.value instanceof Date ? event.value : null)} dateFormat="dd/mm/yy" maxDate={new Date()} showIcon readOnlyInput placeholder="DD/MM/AAAA" /><div className="checkbox-row"><Checkbox inputId="birthDateEstimated" aria-label="Fecha estimada" checked={patient.birthDateEstimated ?? false} onChange={(event) => setValue("birthDateEstimated", Boolean(event.checked))} /><label htmlFor="birthDateEstimated">Estimado</label></div><small className="field-error">{errors.birthDate?.message}</small></div>
        {config?.showBirthTime && <div className="field"><label htmlFor="birthTime">Hora de nacimiento</label><Calendar inputId="birthTime" value={dateFromTime(patient.birthTime)} onChange={(event) => setValue("birthTime", event.value instanceof Date ? timeFromDate(event.value) : "")} timeOnly hourFormat="24" showIcon readOnlyInput placeholder="HH:MM" /></div>}
        <div className="field"><label htmlFor="identifierType">Tipo de identificador{selectedIdentifierType?.required ? " *" : ""}</label><Dropdown inputId="identifierType" pt={dropdownA11y("Tipo de identificador")} value={patient.identifierTypeUuid} options={identifierTypes} optionLabel="display" optionValue="uuid" onChange={(event) => changeIdentifierType(String(event.value))} /></div>
        {identifierSources.length > 1 && <div className="field"><label htmlFor="identifierSource">Fuente / prefijo</label><Dropdown inputId="identifierSource" pt={dropdownA11y("Fuente o prefijo del identificador")} value={patient.identifierSourceUuid} options={identifierSources} optionLabel="prefix" optionValue="uuid" onChange={(event) => changeIdentifierSource(String(event.value))} />{configuredDefaultPrefixMissing && <small className="field-warning">El prefijo predeterminado {config?.defaultIdentifierPrefix} no existe entre las fuentes de OpenMRS; se seleccionó {selectedIdentifierSource?.prefix ?? "la primera fuente disponible"}.</small>}</div>}
        <div className="field"><label htmlFor="identifier">Identificador</label><InputGroup>{selectedIdentifierSource?.prefix && <InputGroupAddon>{selectedIdentifierSource.prefix}</InputGroupAddon>}<InputText id="identifier" value={patient.identifierSuffix ?? ""} readOnly={config?.showEnterId === false} placeholder={selectedIdentifierType?.description ?? "Valor del identificador"} onChange={(event) => changeIdentifierSuffix(event.target.value)} /><Button type="button" icon="pi pi-refresh" aria-label="Generar identificador" onClick={async () => { try { const generatedIdentifier = await onGenerateId(selectedIdentifierSource?.prefix ?? selectedIdentifierSource?.name); setValue("identifier", generatedIdentifier); setValue("identifierSuffix", identifierSuffix(generatedIdentifier, selectedIdentifierSource?.prefix)); } catch { setSaveError("No fue posible generar el identificador."); } }} /></InputGroup>{configuredErrors.identifier && <small className="field-error">{configuredErrors.identifier}</small>}</div>
      </div>
      <h2 className="patient-section-title">Información de dirección</h2>
      <div className="patient-profile-grid">{([ ["address1", "Dirección"], ["address2", "Complemento"] ] as const).map(([name, label]) => <div className="field" key={name}><label htmlFor={name}>{label}</label><InputText id={name} {...register(name)} /><small className="field-error">{configuredErrors[name]}</small></div>)}{orderedAddressLevels.filter((level) => addressKeys.has(level.addressField as AddressKey) && !["address1", "address2"].includes(level.addressField)).map((level) => { const field = level.addressField as AddressKey; return <HierarchyAddressField key={field} level={level} value={String(patient[field] ?? "")} error={configuredErrors[field]} onChange={(value) => setValue(field, value)} onSelect={(entry) => applyHierarchy(field, entry)} />; })}</div>
      {additionalIdentifiers.length > 0 && <><h2 className="patient-section-title">Identificadores adicionales</h2><div className="patient-profile-grid">{additionalIdentifiers.map((additional, index) => { const type = identifierTypes.find((item) => item.uuid === additional.identifierTypeUuid); return type ? <AdditionalIdentifierField key={type.uuid} type={type} value={additional} error={configuredErrors[`additionalIdentifiers.${index}`]} onGenerate={onGenerateId} onChange={(value) => setValue(`additionalIdentifiers.${index}`, value)} /> : null; })}</div></>}
      {attributeLayout.otherInformation.length > 0 && <><h2 className="patient-section-title">Otra información</h2><div className="patient-profile-grid">{attributeLayout.otherInformation.map((attribute) => <DynamicAttributeField key={attribute.uuid} attribute={attribute} label={translatedAttributeLabel(attribute)} value={patient.attributes?.[attribute.uuid]} error={configuredErrors[attribute.uuid]} onChange={(value) => setValue(`attributes.${attribute.uuid}`, value)} />)}</div></>}
    </section>
    {attributeLayout.configuredSections.filter((section) => section.config.title || section.config.translationKey).map((section) => { const hasValue = section.attributes.some((attribute) => patient.attributes?.[attribute.uuid] !== undefined && patient.attributes?.[attribute.uuid] !== ""); const title = section.config.translationKey ? plainTranslation(t(section.config.translationKey, { defaultValue: section.config.title ?? "Información Adicional del Paciente" })) : plainTranslation(t("REGISTRATION_TITLE_ADDITIONAL_PATIENT", { defaultValue: "Información Adicional del Paciente" })); return <CollapsiblePatientSection title={title} key={section.config.key} initiallyOpen={section.config.expanded || hasValue}><div className="patient-profile-grid">{section.attributes.map((attribute) => <DynamicAttributeField key={attribute.uuid} attribute={attribute} label={translatedAttributeLabel(attribute)} value={patient.attributes?.[attribute.uuid]} error={configuredErrors[attribute.uuid]} onChange={(value) => setValue(`attributes.${attribute.uuid}`, value)} />)}</div></CollapsiblePatientSection>; })}
    {relationshipTypes.length > 0 && <CollapsiblePatientSection title="Relaciones" initiallyOpen={relationships.length > 0}>{relationships.map((relationship, index) => <RelationshipRow key={`${index}-${relationship.relationshipTypeUuid}`} index={index} relationship={relationship} relationshipTypes={relationshipTypes} typeMap={config?.relationshipTypeMap ?? {}} onChange={(value) => setValue(`relationships.${index}`, value)} onRemove={() => { if (relationship.relationshipUuid) setRemovedRelationships((current) => [...current, { ...relationship, voided: true }]); setValue("relationships", relationships.filter((_, itemIndex) => itemIndex !== index)); }} />)}<Button type="button" text icon="pi pi-plus" label="Agregar relación" onClick={() => setValue("relationships", [...getValues("relationships"), { relationshipTypeUuid: "", personUuid: "", personDisplay: "" }])} /></CollapsiblePatientSection>}
    <CollapsiblePatientSection title="Información de fallecimiento" initiallyOpen={patient.dead}><label htmlFor="dead"><Checkbox inputId="dead" checked={patient.dead ?? false} onChange={(event) => setValue("dead", Boolean(event.checked))} /> Paciente fallecido</label>{patient.dead && <div className="patient-profile-grid"><div className="field"><label htmlFor="deathDate">Fecha de fallecimiento</label><InputText id="deathDate" type="date" {...register("deathDate")} /></div><div className="field"><label htmlFor="causeOfDeathUuid">UUID causa de fallecimiento</label><InputText id="causeOfDeathUuid" {...register("causeOfDeathUuid")} /></div></div>}</CollapsiblePatientSection>
    {duplicate && <div className="error-banner" role="alert">El servidor detectó una posible duplicación. Revise nombre, fecha de nacimiento e identificador antes de confirmar. <Button type="button" severity="danger" label="Confirmar duplicado" onClick={() => void handleSubmit((values) => submit(values, true, duplicateIntent))()} /></div>}
    <div className="actions">
      <Dropdown aria-label="Formato de impresión" pt={dropdownA11y("Formato de impresión")} value={template} options={translatedPrintOptions} optionLabel="label" optionValue="templateUrl" onChange={(event) => setTemplate(String(event.value))} />
      <Button type="button" outlined label={plainTranslation(t("registrationPrintAction", { defaultValue: "Imprimir" }))} icon="pi pi-print" onClick={() => { setShowPrint(true); window.setTimeout(() => window.print(), 50); }} />
      {workflow?.action?.intent.kind === "startVisit" && workflow.visitTypes.length > 1 && <Dropdown aria-label="Tipo de visita" pt={dropdownA11y("Tipo de visita")} value={workflow.selectedVisitTypeUuid} options={workflow.visitTypes} optionLabel="display" optionValue="uuid" onChange={(event) => workflow.setSelectedVisitTypeUuid(String(event.value))} />}
      {workflow?.action && <Button type="button" label={workflowLabel} icon={workflow.action.icon} loading={isSubmitting || workflow.loading} disabled={workflow.action.disabled} onClick={() => void handleSubmit((values) => submit(values, false, workflow.action!.intent))()} />}
      <Button type="button" label={plainTranslation(t("REGISTRATION_LABEL_SAVE", { defaultValue: t("registrationSaveAction", { defaultValue: "Guardar paciente" }) }))} icon="pi pi-save" loading={isSubmitting} onClick={() => void handleSubmit((values) => submit(values, false, { kind: "save" }))()} />
    </div>
    {showPrint && <PatientPrint templateUrl={template} patient={patient} />}
  </form>;
}
