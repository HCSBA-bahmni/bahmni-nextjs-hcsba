import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { AutoComplete, type AutoCompleteCompleteEvent } from "primereact/autocomplete";
import { Button } from "primereact/button";
import { Calendar } from "primereact/calendar";
import { Checkbox } from "primereact/checkbox";
import { Dropdown } from "primereact/dropdown";
import { InputNumber } from "primereact/inputnumber";
import { InputText } from "primereact/inputtext";
import { Steps } from "primereact/steps";
import { Toast } from "primereact/toast";
import { useEffect, useMemo, useRef, useState, type FormEvent, type PropsWithChildren } from "react";
import { useForm, useWatch, type FieldErrors } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import type { IdentifierMetadataConfig, RegistrationConfig } from "@/config-compat/registrationConfig";
import { formatChileRun, runConfiguredValidator, validateChileRun } from "@/config-compat/validators";
import { searchAddressEntries, type AddressEntry, type AddressLevel } from "@/services/bahmni/address";
import { BahmniApiError } from "@/services/bahmni/http";
import { getConceptAnswers, searchPersons, searchProviders, type IdentifierType, type PersonAttributeType } from "@/services/bahmni/metadata";
import type { PatientFormValues, PatientIdentifierMetadataValues, Reference } from "@/types/bahmni";
import { ageFromBirthDate, birthDateFromAge, type PatientAge } from "./age";
import { buildAddressFieldLayout, type AddressKey } from "./addressFieldLayout";
import { composeIdentifier, identifierSuffix, selectIdentifierSource, validateConfiguredIdentifier } from "./identifierConfig";
import { buildPatientAttributeLayout, patientAttributeTranslationKey } from "./patientAttributeLayout";
import { LAST_PATIENT_FORM_STEP, PATIENT_FORM_STEPS, patientFormStepForErrorKeys } from "./patientFormSteps";
import { PatientPrint } from "./PatientPrint";
import { PatientPhotoControl } from "./PatientPhotoControl";
import { PatientBiometricVerification } from "./PatientBiometricVerification";
import { PATIENT_ATTRIBUTE_CATALOG_STALE_TIME_MS } from "./useRequiredPatientAttributeCatalogs";
import { useRegistrationTranslations } from "./useRegistrationTranslations";
import { patientCatalogLabel } from "./catalogLabels";
import { useIssuerCountries } from "./useIssuerCountries";
import type { RegistrationSubmitIntent, RegistrationWorkflowAction } from "./workflow";

const schema = z.object({
  nameUuid: z.string().optional(), addressUuid: z.string().optional(), identifierUuid: z.string().optional(),
  primaryIdentifierMetadata: z.object({ typeCode: z.string(), use: z.string(), systemUri: z.string().optional(), issuerCountryCode: z.string().optional(), issuerOrganization: z.string().optional(), documentType: z.string().optional(), validFrom: z.string().optional(), validTo: z.string().optional() }).optional(),
  givenName: z.string().min(1, "Obligatorio"), middleName: z.string().optional(), familyName: z.string(), familyName2: z.string().optional(), gender: z.string().min(1, "Obligatorio"),
  birthDate: z.string().optional(), birthDateEstimated: z.boolean().optional(), ageYears: z.number().min(0).max(120).optional(), ageMonths: z.number().min(0).max(12).optional(), ageDays: z.number().min(0).max(31).optional(), birthTime: z.string().optional(), identifier: z.string().optional(), identifierTypeUuid: z.string().optional(), identifierSourceUuid: z.string().optional(), identifierPrefix: z.string().optional(), identifierSuffix: z.string().optional(), additionalIdentifiers: z.array(z.object({ uuid: z.string().optional(), identifier: z.string().optional(), identifierTypeUuid: z.string(), identifierSourceUuid: z.string().optional(), identifierPrefix: z.string().optional(), identifierSuffix: z.string().optional(), locationUuid: z.string().optional(), voided: z.boolean().optional(), metadata: z.object({ typeCode: z.string(), use: z.string(), systemUri: z.string().optional(), issuerCountryCode: z.string().optional(), issuerOrganization: z.string().optional(), documentType: z.string().optional(), validFrom: z.string().optional(), validTo: z.string().optional() }).optional() })).optional(), locationUuid: z.string().optional(),
  phoneNumber: z.string().optional(), address1: z.string().optional(), address2: z.string().optional(), address3: z.string().optional(), address4: z.string().optional(), address5: z.string().optional(), address6: z.string().optional(), cityVillage: z.string().optional(), stateProvince: z.string().optional(), countyDistrict: z.string().optional(), country: z.string().optional(), postalCode: z.string().optional(),
  dead: z.boolean().optional(), deathDate: z.string().optional(), causeOfDeathUuid: z.string().optional(), attributes: z.record(z.string(), z.unknown()), attributeUuids: z.record(z.string(), z.string()).optional(),
  relationships: z.array(z.object({ relationshipTypeUuid: z.string(), personUuid: z.string(), personDisplay: z.string().optional(), relationshipUuid: z.string().optional(), voided: z.boolean().optional() })), image: z.string().optional(), biometricEnrollmentRequested: z.boolean().optional(), uuid: z.string().optional(),
}).refine((value) => Boolean(value.birthDate || value.ageYears !== undefined || value.ageMonths !== undefined || value.ageDays !== undefined), { path: ["birthDate"], message: "Ingrese fecha de nacimiento o edad" })
  .refine((value) => !value.birthDate || ageFromBirthDate(value.birthDate) !== undefined, { path: ["birthDate"], message: "La fecha de nacimiento no puede ser futura" });

const fallbackPrintOptions = [
  { label: "Tarjeta local", translationKey: "REGISTRATION_PRINT_REG_CARD_LOCAL_KEY", templateUrl: "/registration/registrationCardLayout/print_local.html" },
  { label: "Tarjeta estándar", translationKey: "REGISTRATION_PRINT_REG_CARD_KEY", templateUrl: "/registration/registrationCardLayout/print.html" },
  { label: "Documento suplementario", translationKey: "REGISTRATION_PRINT_SUPPLEMENTAL_PAPER", templateUrl: "/registration/supplementalPaperLayout/print.html" },
  { label: "Código de barras", translationKey: "REGISTRATION_PRINT_WITH_BARCODE", templateUrl: "/registration/registrationCardLayout/printWithBarcode.html" },
];

const dropdownA11y = (label: string, describedBy?: string) => ({
  select: { "aria-label": label, ...(describedBy ? { "aria-describedby": describedBy } : {}) },
  trigger: { "aria-label": `Abrir ${label}` },
});
const searchableDropdown = (label: string, filterBy = "label") => ({
  filter: true,
  filterBy,
  filterPlaceholder: `Buscar ${label.toLocaleLowerCase("es-CL")}`,
  emptyFilterMessage: `No se encontraron opciones para ${label.toLocaleLowerCase("es-CL")}`,
  showFilterClear: true,
  resetFilterOnHide: true,
  filterInputAutoFocus: true,
  filterDelay: 150,
  scrollHeight: "18rem",
  checkmark: true,
});
const plainTranslation = (value: string) => value.replace(/<[^>]+>/g, "");
const identifierLocationMessage = "La ficha clínica necesita una ubicación de atención antes de guardar.";

export function isIdentifierLocationValidationError(error: unknown): boolean {
  const payload = error instanceof BahmniApiError ? error.payload : undefined;
  const details = `${error instanceof Error ? error.message : String(error ?? "")} ${payload ? JSON.stringify(payload) : ""}`.toLocaleLowerCase("es-CL");
  return (details.includes("id localidad") || details.includes("patientidentifier.location") || details.includes("identifier location"))
    && (details.includes("nulo") || details.includes("null") || details.includes("required"));
}

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
  activeLocationUuid?: string;
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
  saveDisabledReason?: string;
  allowDuplicateOverride?: boolean;
}

function DynamicAttributeField({ attribute, label, value, requiredByConfig = false, helpText, error, onChange }: { attribute: PersonAttributeType; label: string; value: unknown; requiredByConfig?: boolean; helpText?: string; error?: string; onChange(value: unknown): void }) {
  const conceptUuid = attribute.concept?.uuid;
  const answers = useQuery({ queryKey: ["concept-answers", conceptUuid], queryFn: () => getConceptAnswers(conceptUuid!), enabled: Boolean(conceptUuid), staleTime: PATIENT_ATTRIBUTE_CATALOG_STALE_TIME_MS });
  const format = (attribute.format ?? "").toLowerCase();
  const id = `attribute-${attribute.uuid}`;
  const required = attribute.required === true || requiredByConfig;
  const helpId = helpText ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [helpId, errorId].filter(Boolean).join(" ") || undefined;
  return <div className="field"><label htmlFor={id}>{label}{required ? " *" : ""}</label>
    {conceptUuid ? <Dropdown inputId={id} pt={dropdownA11y(label, describedBy)} aria-required={required} invalid={Boolean(error)} value={value ?? ""} options={(answers.data ?? []).map(answer => ({ ...answer, display: patientCatalogLabel(answer.display ?? "") }))} optionLabel="display" optionValue="uuid" loading={answers.isLoading} virtualScrollerOptions={(answers.data?.length ?? 0) > 50 ? { itemSize: 44 } : undefined} {...searchableDropdown(label, "display")} onChange={(event) => onChange(event.value)} />
      : format.includes("date") ? <InputText id={id} type="date" aria-required={required} aria-invalid={Boolean(error)} aria-describedby={describedBy} value={String(value ?? "")} onChange={(event) => onChange(event.target.value)} />
        : format.includes("boolean") ? <div><Checkbox inputId={id} checked={Boolean(value)} onChange={(event) => onChange(Boolean(event.checked))} /> <span>Sí</span></div>
          : <InputText id={id} aria-required={required} aria-invalid={Boolean(error)} aria-describedby={describedBy} value={String(value ?? "")} onChange={(event) => onChange(event.target.value)} />}
    {helpText && <small id={helpId}>{helpText}</small>}
    {error && <small id={errorId} className="field-error">{error}</small>}
  </div>;
}

function HierarchyAddressField({ level, value, error, onChange, onSelect }: { level: AddressLevel; value: string; error?: string; onChange(value: string): void; onSelect(entry: AddressEntry): void }) {
  const [suggestions, setSuggestions] = useState<AddressEntry[]>([]);
  const complete = async (event: AutoCompleteCompleteEvent) => setSuggestions(event.query.trim().length < 2 ? [] : await searchAddressEntries(level.addressField, event.query));
  const id = `address-${level.addressField}`;
  const helpId = `${id}-help`;
  const errorId = error ? `${id}-error` : undefined;
  return <div className="field"><label htmlFor={id}>{level.name}{level.required ? " *" : ""}</label><AutoComplete inputId={id} value={value} suggestions={suggestions} field="name" minLength={2} delay={250} forceSelection emptyMessage="No se encontraron direcciones" aria-required={level.required} aria-invalid={Boolean(error)} aria-describedby={[helpId, errorId].filter(Boolean).join(" ")} completeMethod={(event) => void complete(event)} onChange={(event) => onChange(typeof event.value === "string" ? event.value : event.value?.name ?? "")} onSelect={(event) => onSelect(event.value as AddressEntry)} dropdown={false} /><small id={helpId}>Escriba al menos 2 caracteres y seleccione una opción de la jerarquía.</small>{error && <small id={errorId} className="field-error">{error}</small>}</div>;
}

function PlainAddressField({ level, value, error, onChange }: { level: AddressLevel; value: string; error?: string; onChange(value: string): void }) {
  const id = `address-${level.addressField}`;
  const errorId = error ? `${id}-error` : undefined;
  return <div className="field"><label htmlFor={id}>{level.name}{level.required ? " *" : ""}</label><InputText id={id} aria-required={level.required} aria-invalid={Boolean(error)} aria-describedby={errorId} value={value} onChange={(event) => onChange(event.target.value)} />{error && <small id={errorId} className="field-error">{error}</small>}</div>;
}

function AdditionalIdentifierField({ type, value, fieldKey, metadataConfig, helpText, error, onChange, onGenerate, onRemove, generationDisabled = false }: { type: IdentifierType; value: NonNullable<PatientFormValues["additionalIdentifiers"]>[number]; fieldKey?: string; metadataConfig?: IdentifierMetadataConfig; helpText?: string; error?: string; onChange(value: NonNullable<PatientFormValues["additionalIdentifiers"]>[number]): void; onGenerate(sourceName?: string): Promise<string>; onRemove(): void; generationDisabled?: boolean }) {
  const countries = useIssuerCountries(Boolean(metadataConfig?.country));
  const sources = type.identifierSources ?? [];
  const typeName = type.name ?? type.display ?? "";
  const isRun = typeName === "RUN";
  const priorClinicalIdentifier = Boolean(type.primary && value.uuid);
  const selectedSource = isRun ? undefined : (sources.find((source) => source.uuid === value.identifierSourceUuid) ?? (value.uuid ? undefined : selectIdentifierSource(type)));
  const prefix = isRun ? "" : selectedSource?.prefix ?? value.identifierPrefix ?? "";
  const suffix = value.identifierSuffix ?? identifierSuffix(value.identifier, prefix);
  const id = `additional-identifier-${type.uuid}${fieldKey ? `-${fieldKey}` : ""}`;
  const metadata: PatientIdentifierMetadataValues | undefined = value.metadata ?? (metadataConfig ? { typeCode: metadataConfig.typeCode, use: metadataConfig.use, systemUri: metadataConfig.systemUri, issuerCountryCode: metadataConfig.issuerCountryCode } : undefined);
  const changeMetadata = (field: keyof PatientIdentifierMetadataValues, next: string) => metadata && onChange({ ...value, metadata: { ...metadata, [field]: next } });
  return <div className="field additional-identifier-field">
    <div className="field-heading"><label htmlFor={id}>{priorClinicalIdentifier ? "Número clínico anterior" : type.display ?? type.name ?? "Identificador"}{type.required && !priorClinicalIdentifier ? " *" : ""}</label>{!priorClinicalIdentifier && <Button type="button" icon="pi pi-trash" text severity="danger" aria-label={`Quitar ${type.display ?? type.name ?? "identificador"}`} onClick={onRemove} />}</div>
    <div className="additional-identifier-control">
      {!isRun && !priorClinicalIdentifier && sources.length > 1 && <Dropdown aria-label={`Fuente de ${type.display ?? type.name}`} value={selectedSource?.uuid} options={sources} optionLabel="prefix" optionValue="uuid" {...searchableDropdown(`fuente de ${type.display ?? type.name}`, "prefix,name")} onChange={(event) => { const source = sources.find((item) => item.uuid === event.value); onChange({ ...value, identifierSourceUuid: source?.uuid, identifierPrefix: source?.prefix ?? "", identifier: composeIdentifier(source?.prefix, suffix) }); }} />}
      <InputGroup>{prefix && <InputGroupAddon>{prefix}</InputGroupAddon>}<InputText id={id} value={suffix} readOnly={priorClinicalIdentifier} onBlur={(event) => { if (isRun && event.target.value.trim()) { const formatted = formatChileRun(event.target.value); onChange({ ...value, identifierSuffix: formatted, identifierPrefix: "", identifierSourceUuid: undefined, identifier: formatted, voided: false, metadata }); } }} onChange={(event) => onChange({ ...value, identifierSuffix: event.target.value, identifierPrefix: prefix, identifierSourceUuid: selectedSource?.uuid, identifier: composeIdentifier(prefix, event.target.value), voided: false, metadata })} />{selectedSource && !priorClinicalIdentifier && <Button type="button" icon="pi pi-refresh" aria-label={`Generar ${type.display ?? type.name}`} disabled={generationDisabled} onClick={async () => { const generated = await onGenerate(selectedSource.prefix ?? selectedSource.name); onChange({ ...value, identifier: generated, identifierSuffix: identifierSuffix(generated, prefix), identifierPrefix: prefix, identifierSourceUuid: selectedSource.uuid, voided: false, metadata }); }} />}</InputGroup>
    </div>
    {priorClinicalIdentifier && <small>Se conserva como alias histórico para mantener la búsqueda y la trazabilidad.</small>}
    {helpText && <small>{helpText}</small>}
    {metadataConfig && metadata && <div className="identifier-metadata-grid">
      {metadataConfig.country && <div className="field"><label htmlFor={`${id}-country`}>País emisor{metadataConfig.countryRequired ? " *" : ""}</label>{countries.length ? <Dropdown inputId={`${id}-country`} pt={dropdownA11y("País emisor")} value={metadata.issuerCountryCode ?? ""} options={countries.some(c => c.code === metadata.issuerCountryCode) || !metadata.issuerCountryCode ? countries : [...countries, { code: metadata.issuerCountryCode, label: `País pendiente de identificar (${metadata.issuerCountryCode})` }]} optionLabel="label" optionValue="code" {...searchableDropdown("país emisor")} onChange={event => changeMetadata("issuerCountryCode", event.value)} /> : <InputText id={`${id}-country`} value={metadata.issuerCountryCode ?? ""} maxLength={3} placeholder="Ejemplo: 152 para Chile" onChange={(event) => changeMetadata("issuerCountryCode", event.target.value)} />}</div>}
      {metadataConfig.issuer && <div className="field"><label htmlFor={`${id}-issuer`}>Emisor{metadataConfig.issuerRequired ? " *" : ""}</label><InputText id={`${id}-issuer`} value={metadata.issuerOrganization ?? ""} onChange={(event) => changeMetadata("issuerOrganization", event.target.value)} /></div>}
      {metadataConfig.documentType && <div className="field"><label htmlFor={`${id}-document-type`}>Tipo documental{metadataConfig.documentTypeRequired ? " *" : ""}</label><InputText id={`${id}-document-type`} value={metadata.documentType ?? ""} onChange={(event) => changeMetadata("documentType", event.target.value)} /></div>}
      {metadataConfig.period && <><div className="field"><label htmlFor={`${id}-valid-from`}>Válido desde</label><InputText id={`${id}-valid-from`} type="date" value={metadata.validFrom ?? ""} onChange={(event) => changeMetadata("validFrom", event.target.value)} /></div><div className="field"><label htmlFor={`${id}-valid-to`}>Válido hasta{metadataConfig.typeCode === "4" ? " *" : ""}</label><InputText id={`${id}-valid-to`} type="date" value={metadata.validTo ?? ""} onChange={(event) => changeMetadata("validTo", event.target.value)} /></div></>}
    </div>}
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
    <Dropdown aria-label={`Tipo de relación ${index + 1}`} pt={dropdownA11y(`Tipo de relación ${index + 1}`)} value={relationship.relationshipTypeUuid} options={relationshipTypes} optionLabel="display" optionValue="uuid" placeholder="Tipo de relación" {...searchableDropdown("tipo de relación", "display,name,aIsToB,bIsToA")} onChange={(event) => onChange({ ...relationship, relationshipTypeUuid: String(event.value), personUuid: "", personDisplay: "" })} />
    <AutoComplete aria-label={`Persona relacionada ${index + 1}`} value={relationship.personDisplay ?? relationship.personUuid} suggestions={suggestions} field="display" placeholder={target === "provider" ? "Buscar proveedor" : "Buscar paciente"} minLength={2} delay={250} forceSelection emptyMessage={target === "provider" ? "No se encontraron proveedores" : "No se encontraron pacientes"} completeMethod={(event) => void complete(event)} onChange={(event) => onChange({ ...relationship, personDisplay: typeof event.value === "string" ? event.value : event.value?.display ?? "", personUuid: typeof event.value === "string" ? "" : event.value?.uuid ?? "" })} onSelect={(event) => { const person = event.value as Reference; onChange({ ...relationship, personUuid: person.uuid, personDisplay: person.display ?? person.name ?? person.uuid }); }} />
    <Button type="button" icon="pi pi-trash" severity="danger" text aria-label="Quitar relación" onClick={onRemove} />
  </div>;
}

export function PatientForm({ initial, activeLocationUuid, identifierTypes, attributeTypes = [], relationshipTypes = [], addressLevels = [], config, workflow, onSave, onGenerateId, saveDisabledReason, allowDuplicateOverride = true }: Props) {
  useRegistrationTranslations();
  const { t } = useTranslation();
  const printOptions = config?.printOptions.length ? config.printOptions : fallbackPrintOptions;
  const translatedPrintOptions = printOptions.map((option) => ({ ...option, label: plainTranslation(t(option.translationKey ?? option.label, { defaultValue: option.label })) }));
  const primaryIdentifier = identifierTypes.find((type) => type.primary) ?? identifierTypes[0];
  const initialIdentifierType = identifierTypes.find((type) => type.uuid === initial?.identifierTypeUuid) ?? primaryIdentifier;
  const initialIdentifierSource = initialIdentifierType?.identifierSources.find((source) => source.uuid === initial?.identifierSourceUuid)
    ?? (initial?.uuid ? undefined : selectIdentifierSource(initialIdentifierType, config?.defaultIdentifierPrefix));
  const initialPrefix = initial?.identifierPrefix ?? initialIdentifierSource?.prefix ?? "";
  const additionalValue = (type: IdentifierType, existing?: NonNullable<PatientFormValues["additionalIdentifiers"]>[number]) => {
    const isRun = (type.name ?? type.display) === "RUN";
    const source = isRun ? undefined : (type.identifierSources.find((item) => item.uuid === existing?.identifierSourceUuid)
      ?? (existing?.uuid ? undefined : selectIdentifierSource(type)));
    const prefix = isRun ? "" : existing?.identifierPrefix ?? source?.prefix ?? "";
    const metadataConfig = config?.identifierMetadata[type.name ?? type.display ?? ""];
    return { identifierTypeUuid: type.uuid, ...existing, identifierSourceUuid: isRun ? undefined : existing?.identifierSourceUuid ?? source?.uuid, identifierPrefix: prefix, identifierSuffix: existing?.identifierSuffix ?? identifierSuffix(existing?.identifier, prefix), metadata: existing?.metadata ?? (metadataConfig ? { typeCode: metadataConfig.typeCode, use: metadataConfig.use, systemUri: metadataConfig.systemUri, issuerCountryCode: metadataConfig.issuerCountryCode } : undefined) };
  };
  const extraTypes = identifierTypes.filter((type) => type.uuid !== initialIdentifierType?.uuid);
  const configuredIdentifierGovernance = Boolean(config && (config.prominentExtraIdentifierTypes.length || config.onDemandExtraIdentifierTypes.length || config.hiddenExtraIdentifierTypes.length));
  const existingAdditional = (initial?.additionalIdentifiers ?? []).flatMap((existing) => {
    const type = identifierTypes.find((item) => item.uuid === existing.identifierTypeUuid);
    return type ? [additionalValue(type, existing)] : [];
  });
  const uncataloguedExistingAdditional = (initial?.additionalIdentifiers ?? []).filter((existing) => !identifierTypes.some((type) => type.uuid === existing.identifierTypeUuid));
  const eagerTypes = extraTypes.filter((type) => {
    const name = type.name ?? type.display ?? "";
    if (existingAdditional.some((identifier) => identifier.identifierTypeUuid === type.uuid)) return false;
    return configuredIdentifierGovernance ? config?.prominentExtraIdentifierTypes.includes(name) : true;
  });
  const initialAdditionalIdentifiers = [...existingAdditional, ...uncataloguedExistingAdditional, ...eagerTypes.map((type) => additionalValue(type))];
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
  const errorSummaryRef = useRef<HTMLDivElement>(null);
  const toastRef = useRef<Toast>(null);
  const [removedRelationships, setRemovedRelationships] = useState<PatientFormValues["relationships"]>([]);
  const [activeStep, setActiveStep] = useState(0);
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
  const addressFieldLayout = buildAddressFieldLayout(addressLevels, config?.addressHierarchy.showAddressFieldsTopDown, config?.addressHierarchy.strictAutocompleteFromLevel);
  const translatedAttributeLabel = (attribute: PersonAttributeType) => {
    const fallback = attribute.description ?? attribute.display ?? attribute.name ?? "Atributo";
    return plainTranslation(t(patientAttributeTranslationKey(fallback), { defaultValue: fallback }));
  };
  const attributeName = (attribute: PersonAttributeType) => attribute.name ?? attribute.display ?? "";
  const attributeRequired = (attribute: PersonAttributeType) => config?.mandatoryAttributeNames.includes(attributeName(attribute)) === true;
  const translatedHelp = (key?: string) => key ? plainTranslation(t(key, { defaultValue: key })) : undefined;
  const basicInsurance = attributeTypes.find((attribute) => attributeName(attribute) === "basicHealthInsurance");
  const healthInsurer = attributeTypes.find((attribute) => attributeName(attribute) === "healthInsurer");
  const isIsapre = Boolean(basicInsurance && patient.attributes?.[basicInsurance.uuid] === "e8200001-0000-4000-8000-000000000002");
  useEffect(() => {
    if (!patient.locationUuid && activeLocationUuid) setValue("locationUuid", activeLocationUuid);
  }, [activeLocationUuid, patient.locationUuid, setValue]);
  useEffect(() => {
    if (!isIsapre && healthInsurer && patient.attributes?.[healthInsurer.uuid] !== undefined && patient.attributes?.[healthInsurer.uuid] !== "") {
      setValue(`attributes.${healthInsurer.uuid}`, undefined);
    }
  }, [healthInsurer, isIsapre, patient.attributes, setValue]);
  const visibleAdditionalIdentifiers = additionalIdentifiers.map((value, index) => ({ value, index })).filter(({ value }) => {
    const type = identifierTypes.find((item) => item.uuid === value.identifierTypeUuid);
    return !config?.hiddenExtraIdentifierTypes.includes(type?.name ?? type?.display ?? "") && value.voided !== true;
  });
  const runIdentifiers = visibleAdditionalIdentifiers.filter(({ value }) => {
    const type = identifierTypes.find((item) => item.uuid === value.identifierTypeUuid);
    return (type?.name ?? type?.display) === "RUN";
  });
  const otherIdentifiers = visibleAdditionalIdentifiers.filter(({ value }) => {
    const type = identifierTypes.find((item) => item.uuid === value.identifierTypeUuid);
    return (type?.name ?? type?.display) !== "RUN";
  });
  const onDemandIdentifierTypes = extraTypes.filter((type) => {
    const name = type.name ?? type.display ?? "";
    if (!config?.onDemandExtraIdentifierTypes.includes(name)) return false;
    return config.repeatableExtraIdentifierTypes.includes(name) || !additionalIdentifiers.some((identifier) => identifier.identifierTypeUuid === type.uuid && identifier.voided !== true);
  });

  const showErrorSummary = (message: string, summary = "Revise el formulario") => {
    setSaveError(message);
    toastRef.current?.show({ severity: "error", summary, detail: message, life: 6000 });
    window.requestAnimationFrame(() => errorSummaryRef.current?.focus());
  };
  const fileToImage = (file?: File) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return showErrorSummary("La fotografía no puede superar 5 MB.", "Fotografía no válida");
    setSaveError("");
    const reader = new FileReader(); reader.onload = () => setValue("image", String(reader.result), { shouldDirty: true }); reader.readAsDataURL(file);
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
      if ((attribute.required === true || config?.mandatoryAttributeNames.includes(attributeName(attribute))) && (value === undefined || value === null || String(value).trim() === "")) messages[attribute.uuid] = "Obligatorio";
    }
    if (config?.isLastNameMandatory && !values.familyName.trim()) messages.familyName = "Obligatorio";
    if (config?.isSecondLastNameMandatory && !values.familyName2?.trim()) messages.familyName2 = "Obligatorio";
    const identifier = values.identifier || composeIdentifier(values.identifierPrefix, values.identifierSuffix ?? "");
    const identifierValidation = validateConfiguredIdentifier(identifierTypes.find((type) => type.uuid === values.identifierTypeUuid), identifier, Boolean(values.identifierSourceUuid));
    if (!identifierValidation.valid) messages.identifier = identifierValidation.message ?? "Identificador inválido";
    const hasIdentifierToSave = Boolean(identifier || values.identifierSourceUuid || values.additionalIdentifiers?.some((item) => item.uuid || item.identifier || item.identifierSourceUuid));
    if (hasIdentifierToSave && !values.locationUuid) messages.locationUuid = identifierLocationMessage;
    for (const [index, additional] of (values.additionalIdentifiers ?? []).entries()) {
      const type = identifierTypes.find((item) => item.uuid === additional.identifierTypeUuid);
      const composed = additional.identifier || composeIdentifier(additional.identifierPrefix, additional.identifierSuffix ?? "");
      if (!composed && !type?.required) continue;
      const validation = validateConfiguredIdentifier(type, composed, Boolean(additional.identifierSourceUuid));
      if (!validation.valid) messages[`additionalIdentifiers.${index}`] = validation.message ?? "Identificador inválido";
      const typeName = type?.name ?? type?.display ?? "";
      if (typeName === "RUN" && composed && !validateChileRun(composed)) messages[`additionalIdentifiers.${index}`] = "Ingrese un RUN válido en formato 12345678-5";
      const metadataConfig = config?.identifierMetadata[typeName];
      const metadata = additional.metadata;
      if (composed && metadataConfig) {
        if (!metadata || metadata.typeCode !== metadataConfig.typeCode || metadata.use !== metadataConfig.use) messages[`additionalIdentifiers.${index}`] = "Los datos del documento no corresponden al tipo seleccionado";
        else if (metadataConfig.countryRequired && !metadata.issuerCountryCode?.trim()) messages[`additionalIdentifiers.${index}`] = "El país emisor es obligatorio";
        else if (metadata.issuerCountryCode && !/^\d{3}$/.test(metadata.issuerCountryCode)) messages[`additionalIdentifiers.${index}`] = "Use el código ISO numérico de tres dígitos para el país emisor";
        else if (metadataConfig.issuerRequired && !metadata.issuerOrganization?.trim()) messages[`additionalIdentifiers.${index}`] = "El emisor es obligatorio";
        else if (metadataConfig.documentTypeRequired && !metadata.documentType?.trim()) messages[`additionalIdentifiers.${index}`] = "El tipo documental es obligatorio";
        else if (metadataConfig.typeCode === "4" && !metadata.validTo) messages[`additionalIdentifiers.${index}`] = "La fecha de expiración del pasaporte es obligatoria";
        else if (metadata.validFrom && metadata.validTo && metadata.validFrom > metadata.validTo) messages[`additionalIdentifiers.${index}`] = "El inicio de vigencia no puede ser posterior al vencimiento";
      }
    }
    const errorKeys = Object.keys(messages);
    setConfiguredErrors(messages);
    if (errorKeys.length > 0) {
      const runError = errorKeys.some((key) => {
        const index = /^additionalIdentifiers\.(\d+)$/.exec(key)?.[1];
        const type = index === undefined ? undefined : identifierTypes.find((item) => item.uuid === values.additionalIdentifiers?.[Number(index)]?.identifierTypeUuid);
        return (type?.name ?? type?.display) === "RUN";
      });
      setActiveStep(runError ? 0 : patientFormStepForErrorKeys(errorKeys));
      showErrorSummary("Revise los campos destacados antes de guardar el paciente.");
    }
    return errorKeys.length === 0;
  };
  const submit = async (values: PatientFormValues, jumpAccepted: boolean, intent: RegistrationSubmitIntent) => {
    setSaveError("");
    const attributes = { ...values.attributes };
    const composedIdentifier = composeIdentifier(values.identifierPrefix, values.identifierSuffix ?? "") || values.identifier || undefined;
    const normalizedAdditionalIdentifiers = (values.additionalIdentifiers ?? []).map((additional) => {
      const type = identifierTypes.find((item) => item.uuid === additional.identifierTypeUuid);
      const composed = additional.identifier || composeIdentifier(additional.identifierPrefix, additional.identifierSuffix ?? "");
      const formatted = (type?.name ?? type?.display) === "RUN" && composed ? formatChileRun(composed) : composed;
      return { ...additional, identifier: formatted, identifierSuffix: identifierSuffix(formatted, additional.identifierPrefix) };
    });
    const normalized = { ...values, locationUuid: values.locationUuid ?? activeLocationUuid, identifier: composedIdentifier, additionalIdentifiers: normalizedAdditionalIdentifiers, attributes, relationships: [...values.relationships.filter((relationship) => relationship.relationshipTypeUuid && relationship.personUuid), ...removedRelationships] };
    if (!validateConfigured(normalized)) return;
    try { await onSave(normalized, jumpAccepted, intent); setDuplicate(false); }
    catch (error) {
      const duplicateResponse = error instanceof BahmniApiError && ([409, 412].includes(error.status) || JSON.stringify(error.payload).toLowerCase().includes("duplicate"));
      if (duplicateResponse && !jumpAccepted && allowDuplicateOverride) { setDuplicateIntent(intent); setDuplicate(true); showErrorSummary("Se encontró una posible ficha duplicada. Revise los datos antes de confirmar.", "Posible paciente duplicado"); }
      else if (duplicateResponse && !allowDuplicateOverride) showErrorSummary("Se encontró una posible ficha duplicada. Vuelva a buscarla y resuelva la identidad antes de continuar.", "Posible paciente duplicado");
      else if (isIdentifierLocationValidationError(error)) {
        setConfiguredErrors((current) => ({ ...current, locationUuid: identifierLocationMessage }));
        setActiveStep(LAST_PATIENT_FORM_STEP);
        showErrorSummary("Falta la ubicación requerida por el identificador clínico. Revise el campo destacado.");
      } else showErrorSummary(error instanceof Error ? error.message : "No fue posible guardar el paciente.");
    }
  };
  const applyHierarchy = (currentField: AddressKey, entry: AddressEntry) => {
    setValue(currentField, entry.name);
    let parent = entry.parent;
    while (parent) { if (parent.addressField && addressFieldLayout.some((level) => level.addressField === parent?.addressField)) setValue(parent.addressField as AddressKey, parent.name); parent = parent.parent; }
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

  const handleInvalidForm = (validationErrors: FieldErrors<PatientFormValues>) => {
    changeStep(patientFormStepForErrorKeys(Object.keys(validationErrors)));
    showErrorSummary("Revise los campos destacados antes de guardar el paciente.");
  };
  const requestSave = (intent: RegistrationSubmitIntent, jumpAccepted = false) => {
    void handleSubmit((values) => submit(values, jumpAccepted, intent), handleInvalidForm)();
  };
  const changeStep = (nextStep: number) => {
    const boundedStep = Math.max(0, Math.min(LAST_PATIENT_FORM_STEP, nextStep));
    setActiveStep(boundedStep);
    window.requestAnimationFrame(() => document.getElementById(["patient-identification-title", "patient-address-title", "patient-additional-title"][boundedStep] ?? "")?.focus());
  };
  const handleFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (activeStep < LAST_PATIENT_FORM_STEP) {
      changeStep(activeStep + 1);
      return;
    }
    if (!saveDisabledReason) requestSave({ kind: "save" });
  };
  const renderAdditionalIdentifier = ({ value: additional, index }: typeof visibleAdditionalIdentifiers[number]) => {
    const type = identifierTypes.find((item) => item.uuid === additional.identifierTypeUuid);
    if (!type) return null;
    const typeName = type.name ?? type.display ?? "";
    return <AdditionalIdentifierField key={`${type.uuid}-${index}`} type={type} value={additional} fieldKey={visibleAdditionalIdentifiers.filter(row => row.value.identifierTypeUuid === type.uuid).length > 1 ? additional.uuid || String(index) : undefined} metadataConfig={config?.identifierMetadata[typeName]} helpText={translatedHelp(config?.identifierHelpText[typeName])} error={configuredErrors[`additionalIdentifiers.${index}`]} onGenerate={onGenerateId} generationDisabled={Boolean(saveDisabledReason)} onChange={(value) => setValue(`additionalIdentifiers.${index}`, value)} onRemove={() => { const current = [...(getValues("additionalIdentifiers") ?? [])]; if (additional.uuid) current[index] = { ...additional, voided: true }; else current.splice(index, 1); setValue("additionalIdentifiers", current); }} />;
  };

  return <form className="patient-registration-form" onSubmit={handleFormSubmit}>
    <Toast ref={toastRef} position="top-right" />
    {saveError && <div ref={errorSummaryRef} role="alert" tabIndex={-1} className="error-banner patient-form-error-summary"><i className="pi pi-exclamation-circle" aria-hidden="true" /><span>{saveError}</span></div>}
    {saveDisabledReason && <div role="status" className="warning-banner">{saveDisabledReason}</div>}
    <nav className="panel patient-form-steps" aria-label="Etapas del registro del paciente">
      <Steps model={PATIENT_FORM_STEPS} activeIndex={activeStep} readOnly={false} onSelect={(event) => changeStep(event.index)} pt={{ menu: { "aria-label": "Etapas del registro del paciente" } }} />
      <div className="patient-progress-summary" aria-live="polite"><span>Paso {activeStep + 1} de {PATIENT_FORM_STEPS.length}</span><strong>{PATIENT_FORM_STEPS[activeStep]?.label}</strong></div>
    </nav>

    <div className="patient-form-stage" hidden={activeStep !== 0}>
      <section className="panel patient-profile-panel" aria-labelledby="patient-identification-title">
        <div className="patient-profile-heading"><div><span className="patient-profile-kicker">{initial?.uuid ? "Paciente registrado" : "Nuevo paciente"}</span><strong>{patient.identifier || "Identificador por asignar"}</strong>{initial?.uuid && <PatientBiometricVerification patientUuid={initial.uuid} />}</div><PatientPhotoControl image={patient.image} patientName={[patient.givenName, patient.familyName].filter(Boolean).join(" ")} onCapture={(image, options) => { setValue("image", image, { shouldDirty: true }); setValue("biometricEnrollmentRequested", options?.enrollBiometric ?? false, { shouldDirty: true }); }} onFileSelect={(file) => { setValue("biometricEnrollmentRequested", false); fileToImage(file); }} /></div>
        <div className="patient-section-heading"><div><span>Paso 1</span><h2 id="patient-identification-title" tabIndex={-1}>Datos de identificación</h2><p>Complete la identidad, los datos demográficos y el documento principal del paciente.</p></div><i className="pi pi-user" aria-hidden="true" /></div>
        <div className="patient-profile-grid">
        <fieldset className="field patient-name-group"><legend>Nombre legal del paciente <span aria-hidden="true">*</span></legend><div className="patient-name-inputs"><label className="patient-subfield" htmlFor="givenName"><span>Nombres *</span><InputText id="givenName" aria-label="Nombres" placeholder="Ej. Juan" aria-invalid={Boolean(errors.givenName || configuredErrors.givenName)} {...register("givenName")} /></label>{config?.showMiddleName !== false && <label className="patient-subfield" htmlFor="middleName"><span>Segundo nombre</span><InputText id="middleName" aria-label="Segundo nombre" placeholder="Ej. Carlos" {...register("middleName")} /></label>}{config?.showLastName !== false && <label className="patient-subfield" htmlFor="familyName"><span>Primer apellido{config?.isLastNameMandatory ? " *" : ""}</span><InputText id="familyName" aria-label="Primer apellido" placeholder="Ej. Mardones" aria-invalid={Boolean(errors.familyName || configuredErrors.familyName)} {...register("familyName")} /></label>}{config?.showSecondLastName && <label className="patient-subfield" htmlFor="familyName2"><span>Segundo apellido{config?.isSecondLastNameMandatory ? " *" : ""}</span><InputText id="familyName2" aria-label="Segundo apellido" placeholder="Ej. Montiel" aria-invalid={Boolean(errors.familyName2 || configuredErrors.familyName2)} {...register("familyName2")} /></label>}</div><small className="field-error">{errors.givenName?.message ?? configuredErrors.givenName ?? errors.familyName?.message ?? configuredErrors.familyName ?? errors.familyName2?.message ?? configuredErrors.familyName2}</small></fieldset>
        {attributeLayout.localNames.length === 3 && <fieldset className="field patient-name-group"><legend>Nombre social</legend><div className="patient-name-inputs">{attributeLayout.localNames.map((attribute) => { const label = translatedAttributeLabel(attribute); return <label className="patient-subfield" key={attribute.uuid} htmlFor={`social-name-${attribute.uuid}`}><span>{label}</span><InputText id={`social-name-${attribute.uuid}`} placeholder={label} value={String(patient.attributes?.[attribute.uuid] ?? "")} onChange={(event) => setValue(`attributes.${attribute.uuid}`, event.target.value)} /></label>; })}</div></fieldset>}
        <div className="field"><label htmlFor="gender">Género *</label><Dropdown inputId="gender" pt={dropdownA11y("Género", errors.gender ? "gender-error" : undefined)} aria-required invalid={Boolean(errors.gender)} value={patient.gender} options={[{ label: "Femenino", value: "F" }, { label: "Masculino", value: "M" }, { label: "Otro", value: "O" }, { label: "Desconocido", value: "U" }]} placeholder="Seleccione género" checkmark onChange={(event) => setValue("gender", String(event.value), { shouldValidate: true })} />{errors.gender && <small id="gender-error" className="field-error">{errors.gender.message}</small>}</div>
        <div className="field"><label>Edad estimada</label><div className="age-inputs"><InputGroup><InputGroupAddon>Años</InputGroupAddon><InputNumber inputId="ageYears" aria-label="Años" value={patient.ageYears} onValueChange={(event) => changeEstimatedAge("years", event.value ?? undefined)} min={0} max={120} useGrouping={false} /></InputGroup><InputGroup><InputGroupAddon>Meses</InputGroupAddon><InputNumber inputId="ageMonths" aria-label="Meses" value={patient.ageMonths} onValueChange={(event) => changeEstimatedAge("months", event.value ?? undefined)} min={0} max={12} useGrouping={false} /></InputGroup><InputGroup><InputGroupAddon>Días</InputGroupAddon><InputNumber inputId="ageDays" aria-label="Días" value={patient.ageDays} onValueChange={(event) => changeEstimatedAge("days", event.value ?? undefined)} min={0} max={31} useGrouping={false} /></InputGroup></div><small>Al ingresar la edad se calculará una fecha estimada.</small><small className="field-error">{errors.ageYears?.message ?? errors.ageMonths?.message ?? errors.ageDays?.message}</small></div>
        <div className="field"><label htmlFor="birthDate">Fecha de nacimiento</label><Calendar inputId="birthDate" pt={{ input: { "aria-describedby": errors.birthDate ? "birthDate-error" : undefined } }} value={dateFromIso(patient.birthDate)} onChange={(event) => changeBirthDate(event.value instanceof Date ? event.value : null)} dateFormat="dd/mm/yy" maxDate={new Date()} showIcon showButtonBar readOnlyInput placeholder="DD/MM/AAAA" invalid={Boolean(errors.birthDate)} /><div className="checkbox-row"><Checkbox inputId="birthDateEstimated" checked={patient.birthDateEstimated ?? false} onChange={(event) => setValue("birthDateEstimated", Boolean(event.checked))} /><label htmlFor="birthDateEstimated">Fecha estimada</label></div>{errors.birthDate && <small id="birthDate-error" className="field-error">{errors.birthDate.message}</small>}</div>
        {config?.showBirthTime && <div className="field"><label htmlFor="birthTime">Hora de nacimiento</label><Calendar inputId="birthTime" value={dateFromTime(patient.birthTime)} onChange={(event) => setValue("birthTime", event.value instanceof Date ? timeFromDate(event.value) : "")} timeOnly hourFormat="24" showIcon readOnlyInput placeholder="HH:MM" /></div>}
        {runIdentifiers.map(renderAdditionalIdentifier)}
        </div>
      </section>
    </div>

    <div className="patient-form-stage" hidden={activeStep !== 1}>
      <section className="panel patient-profile-panel" aria-labelledby="patient-address-title">
        <div className="patient-section-heading"><div><span>Paso 2</span><h2 id="patient-address-title" tabIndex={-1}>Información de dirección</h2><p>Los campos con búsqueda jerárquica deben seleccionarse desde las sugerencias.</p></div><i className="pi pi-map-marker" aria-hidden="true" /></div>
        <p className="patient-step-help"><i className="pi pi-info-circle" aria-hidden="true" /> Complete la dirección siguiendo el orden de la jerarquía configurada.</p>
        <div className="patient-profile-grid">{addressFieldLayout.map((level) => { const field: AddressKey = level.addressField; const props = { level, value: String(patient[field] ?? ""), error: configuredErrors[field], onChange: (value: string) => setValue(field, value) }; return level.strictHierarchy ? <HierarchyAddressField key={field} {...props} onSelect={(entry) => applyHierarchy(field, entry)} /> : <PlainAddressField key={field} {...props} />; })}</div>
      </section>
    </div>

    <div className="patient-form-stage patient-additional-stage" hidden={activeStep !== LAST_PATIENT_FORM_STEP}>
      <section className="panel patient-profile-panel" aria-labelledby="patient-additional-title">
        <div className="patient-section-heading"><div><span>Paso 3</span><h2 id="patient-additional-title" tabIndex={-1}>Información adicional</h2><p>Revise identificadores, atributos configurados y relaciones antes de guardar.</p></div><i className="pi pi-file-edit" aria-hidden="true" /></div>
        <h3 className="patient-section-title">Número de ficha del hospital</h3>
        {config?.showEnterId === false ? <div className="patient-profile-grid"><div className="field"><label htmlFor="identifier">Número de ficha</label><InputText id="identifier" aria-invalid={Boolean(configuredErrors.locationUuid)} aria-describedby={configuredErrors.locationUuid ? "identifier-location-error" : undefined} value={initial?.uuid ? patient.identifier ?? "" : "Se asignará automáticamente al guardar"} readOnly />{initial?.uuid && !patient.identifierSourceUuid && <small>Este número anterior se conserva para encontrar la ficha.</small>}{configuredDefaultPrefixMissing && <small className="field-warning">No se puede asignar el número de ficha. Solicite ayuda a soporte antes de guardar.</small>}{configuredErrors.locationUuid && <small id="identifier-location-error" role="alert" className="field-error">{configuredErrors.locationUuid}</small>}</div></div> : <div className="patient-profile-grid"><div className="field"><label htmlFor="identifierType">Tipo de identificador{selectedIdentifierType?.required ? " *" : ""}</label><Dropdown inputId="identifierType" pt={dropdownA11y("Tipo de identificador")} value={patient.identifierTypeUuid} options={identifierTypes} optionLabel="display" optionValue="uuid" {...searchableDropdown("tipo de identificador", "display,name,description")} onChange={(event) => changeIdentifierType(String(event.value))} /></div>{identifierSources.length > 1 && <div className="field"><label htmlFor="identifierSource">Fuente / prefijo</label><Dropdown inputId="identifierSource" pt={dropdownA11y("Fuente o prefijo del identificador")} value={patient.identifierSourceUuid} options={identifierSources} optionLabel="prefix" optionValue="uuid" {...searchableDropdown("fuente o prefijo", "prefix,name")} onChange={(event) => changeIdentifierSource(String(event.value))} /></div>}<div className="field"><label htmlFor="identifier">Identificador</label><InputGroup>{selectedIdentifierSource?.prefix && <InputGroupAddon>{selectedIdentifierSource.prefix}</InputGroupAddon>}<InputText id="identifier" aria-invalid={Boolean(configuredErrors.identifier || configuredErrors.locationUuid)} aria-describedby={configuredErrors.locationUuid ? "identifier-location-error" : undefined} value={patient.identifierSuffix ?? ""} placeholder={selectedIdentifierType?.description ?? "Valor del identificador"} onChange={(event) => changeIdentifierSuffix(event.target.value)} /><Button type="button" icon="pi pi-refresh" aria-label="Generar identificador" disabled={Boolean(saveDisabledReason)} onClick={async () => { try { const generatedIdentifier = await onGenerateId(selectedIdentifierSource?.name ?? selectedIdentifierSource?.prefix ?? undefined); setValue("identifier", generatedIdentifier); setValue("identifierSuffix", identifierSuffix(generatedIdentifier, selectedIdentifierSource?.prefix)); } catch { showErrorSummary("No fue posible generar el identificador.", "Error al generar identificador"); } }} /></InputGroup>{configuredErrors.identifier && <small className="field-error">{configuredErrors.identifier}</small>}{configuredErrors.locationUuid && <small id="identifier-location-error" role="alert" className="field-error">{configuredErrors.locationUuid}</small>}</div></div>}
        {(otherIdentifiers.length > 0 || onDemandIdentifierTypes.length > 0) && <><h3 className="patient-section-title">Otros identificadores</h3>{onDemandIdentifierTypes.length > 0 && <div className="field patient-add-identifier"><label htmlFor="addIdentifierType">Agregar tipo de identificador</label><Dropdown inputId="addIdentifierType" pt={dropdownA11y("Agregar tipo de identificador")} value={null} placeholder="Seleccione un tipo" options={onDemandIdentifierTypes} optionLabel="display" optionValue="uuid" {...searchableDropdown("tipo de identificador", "display,name,description")} onChange={(event) => { const type = extraTypes.find((item) => item.uuid === event.value); if (type) setValue("additionalIdentifiers", [...(getValues("additionalIdentifiers") ?? []), additionalValue(type)]); }} /></div>}<div className="patient-profile-grid">{otherIdentifiers.map(renderAdditionalIdentifier)}</div></>}
        {attributeLayout.otherInformation.length > 0 && <><h3 className="patient-section-title">Otra información</h3><div className="patient-profile-grid">{attributeLayout.otherInformation.map((attribute) => <DynamicAttributeField key={attribute.uuid} attribute={attribute} label={translatedAttributeLabel(attribute)} value={patient.attributes?.[attribute.uuid]} requiredByConfig={attributeRequired(attribute)} helpText={translatedHelp(config?.fieldHelpText[attributeName(attribute)])} error={configuredErrors[attribute.uuid]} onChange={(value) => setValue(`attributes.${attribute.uuid}`, value)} />)}</div></>}
      </section>
      {attributeLayout.configuredSections.filter((section) => (section.config.title || section.config.translationKey) && (section.config.key !== "isapreInstitution" || isIsapre)).map((section) => { const hasValue = section.attributes.some((attribute) => patient.attributes?.[attribute.uuid] !== undefined && patient.attributes?.[attribute.uuid] !== ""); const title = section.config.translationKey ? plainTranslation(t(section.config.translationKey, { defaultValue: section.config.title ?? "Información Adicional del Paciente" })) : plainTranslation(t("REGISTRATION_TITLE_ADDITIONAL_PATIENT", { defaultValue: "Información Adicional del Paciente" })); return <CollapsiblePatientSection title={title} key={section.config.key} initiallyOpen={section.config.expanded || hasValue}><div className="patient-profile-grid">{section.attributes.map((attribute) => <DynamicAttributeField key={attribute.uuid} attribute={attribute} label={translatedAttributeLabel(attribute)} value={patient.attributes?.[attribute.uuid]} requiredByConfig={attributeRequired(attribute)} helpText={translatedHelp(config?.fieldHelpText[attributeName(attribute)])} error={configuredErrors[attribute.uuid]} onChange={(value) => setValue(`attributes.${attribute.uuid}`, value)} />)}</div></CollapsiblePatientSection>; })}
      {relationshipTypes.length > 0 && <CollapsiblePatientSection title="Relaciones" initiallyOpen={relationships.length > 0}>{relationships.map((relationship, index) => <RelationshipRow key={`${index}-${relationship.relationshipTypeUuid}`} index={index} relationship={relationship} relationshipTypes={relationshipTypes} typeMap={config?.relationshipTypeMap ?? {}} onChange={(value) => setValue(`relationships.${index}`, value)} onRemove={() => { if (relationship.relationshipUuid) setRemovedRelationships((current) => [...current, { ...relationship, voided: true }]); setValue("relationships", relationships.filter((_, itemIndex) => itemIndex !== index)); }} />)}<Button type="button" text icon="pi pi-plus" label="Agregar relación" onClick={() => setValue("relationships", [...getValues("relationships"), { relationshipTypeUuid: "", personUuid: "", personDisplay: "" }])} /></CollapsiblePatientSection>}
      <CollapsiblePatientSection title="Información de fallecimiento" initiallyOpen={patient.dead}><label htmlFor="dead"><Checkbox inputId="dead" checked={patient.dead ?? false} onChange={(event) => setValue("dead", Boolean(event.checked))} /> Paciente fallecido</label>{patient.dead && <div className="patient-profile-grid"><div className="field"><label htmlFor="deathDate">Fecha de fallecimiento</label><InputText id="deathDate" type="date" {...register("deathDate")} /></div><div className="field"><label htmlFor="causeOfDeathUuid">UUID causa de fallecimiento</label><InputText id="causeOfDeathUuid" {...register("causeOfDeathUuid")} /></div></div>}</CollapsiblePatientSection>
    </div>

    {duplicate && <div className="error-banner" role="alert">El servidor detectó una posible duplicación. Revise nombre, fecha de nacimiento e identificador antes de confirmar. <Button type="button" severity="danger" label="Confirmar duplicado" disabled={Boolean(saveDisabledReason)} onClick={() => requestSave(duplicateIntent, true)} /></div>}

    {activeStep < LAST_PATIENT_FORM_STEP ? <div className="actions patient-wizard-actions">
      {activeStep > 0 && <Button type="button" outlined label="Anterior" icon="pi pi-arrow-left" onClick={() => changeStep(activeStep - 1)} />}
      <Button type="button" className="patient-wizard-next" label="Siguiente" icon="pi pi-arrow-right" iconPos="right" onClick={() => changeStep(activeStep + 1)} />
    </div> : <footer className="actions patient-registration-actions" aria-label="Acciones del registro de paciente">
      <Button className="patient-registration-back-action" type="button" outlined label="Anterior" icon="pi pi-arrow-left" onClick={() => changeStep(activeStep - 1)} />
      <div className="patient-registration-print-actions">
        <Dropdown className="patient-registration-print-template" aria-label="Formato de impresión" pt={dropdownA11y("Formato de impresión")} value={template} options={translatedPrintOptions} optionLabel="label" optionValue="templateUrl" {...(translatedPrintOptions.length > 5 ? searchableDropdown("formato de impresión", "label") : { checkmark: true })} onChange={(event) => setTemplate(String(event.value))} />
        <Button type="button" outlined label={plainTranslation(t("registrationPrintAction", { defaultValue: "Imprimir" }))} icon="pi pi-print" onClick={() => { setShowPrint(true); window.setTimeout(() => window.print(), 50); }} />
      </div>
      <div className="patient-registration-save-actions">
        {workflow?.action?.intent.kind === "startVisit" && workflow.visitTypes.length > 1 && <Dropdown className="patient-registration-visit-type" aria-label="Tipo de visita" pt={dropdownA11y("Tipo de visita")} value={workflow.selectedVisitTypeUuid} options={workflow.visitTypes} optionLabel="display" optionValue="uuid" {...searchableDropdown("tipo de visita", "display,name")} onChange={(event) => workflow.setSelectedVisitTypeUuid(String(event.value))} />}
        {workflow?.action && <Button type="button" label={workflowLabel} icon={workflow.action.icon} loading={isSubmitting || workflow.loading} disabled={workflow.action.disabled || Boolean(saveDisabledReason)} onClick={() => requestSave(workflow.action!.intent)} />}
        <Button type="button" label={plainTranslation(t("REGISTRATION_LABEL_SAVE", { defaultValue: t("registrationSaveAction", { defaultValue: "Guardar paciente" }) }))} icon="pi pi-save" loading={isSubmitting} disabled={Boolean(saveDisabledReason)} onClick={() => requestSave({ kind: "save" })} />
      </div>
    </footer>}
    {showPrint && <PatientPrint templateUrl={template} patient={patient} />}
  </form>;
}
