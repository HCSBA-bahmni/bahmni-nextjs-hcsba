import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "primereact/button";
import { Form2Renderer } from "@/features/forms/Form2Renderer";
import { form2DefinitionSchema, type Form2Observation } from "@/features/forms/form2";
import {
  getBahmniEncounter,
  getFormDefinition,
  getFormTranslations,
  getLatestPublishedForms,
  getPatientFormSummaries,
  updateFormEncounter,
  type PatientFormSummary,
  type PublishedForm,
} from "@/services/bahmni/forms";
import { toEncounterWireObservations } from "@/services/bahmni/visits";
import type { BahmniMfeProps } from "../types";

interface FormEntry extends PatientFormSummary {
  formUuid?: string;
  displayName: string;
  privileges?: PublishedForm["privileges"];
}

function translatedName(form: PublishedForm | undefined, locale: string, fallback: string): string {
  const name = form?.formName ?? form?.name ?? fallback;
  if (!form?.nameTranslation) return name;
  try {
    const translations = JSON.parse(form.nameTranslation) as Array<{ locale?: string; display?: string }>;
    return translations.find((item) => item.locale === locale)?.display ?? name;
  } catch { return name; }
}

function hasPrivilege(entry: FormEntry, privilegeNames: Set<string>, action: "view" | "edit"): boolean {
  if (!entry.privileges?.length) return true;
  return entry.privileges.some((privilege) => privilege[action === "view" ? "viewable" : "editable"] === true && privilegeNames.has(privilege.privilegeName));
}

function displayValue(value: unknown): string {
  if (value === undefined || value === null || value === "") return "—";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(displayValue).join(", ");
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return displayValue(record.shortName ?? record.display ?? record.name ?? record.valueAsString ?? record.value);
  }
  return "—";
}

function flattenObservations(values: unknown): Record<string, unknown>[] {
  if (!Array.isArray(values)) return [];
  return values.flatMap((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const observation = value as Record<string, unknown>;
    return [observation, ...flattenObservations(observation.groupMembers)];
  });
}

function ObservationList({ observations, formName }: { observations: unknown; formName: string }) {
  const matching = flattenObservations(observations).filter((observation) => typeof observation.formFieldPath === "string" && observation.formFieldPath.startsWith(`${formName}.`) && observation.voided !== true);
  if (!matching.length) return <p className="muted-text">El encuentro no contiene observaciones publicadas para este formulario.</p>;
  return <dl className="clinical-form-observations">{matching.filter((observation) => observation.value !== undefined).map((observation, index) => {
    const concept = observation.concept && typeof observation.concept === "object" ? observation.concept as Record<string, unknown> : {};
    return <div className={observation.abnormal === true || observation.interpretation === "ABNORMAL" ? "abnormal" : ""} key={String(observation.uuid ?? index)}><dt>{displayValue(concept.shortName ?? concept.name ?? observation.formFieldPath)}</dt><dd>{displayValue(observation.value)}{concept.units ? ` ${displayValue(concept.units)}` : ""}</dd></div>;
  })}</dl>;
}

function FormObservationDetails({ entry }: { entry: FormEntry }) {
  const detail = useQuery({ queryKey: ["clinical", "form-encounter", entry.encounterUuid], queryFn: () => getBahmniEncounter(entry.encounterUuid) });
  if (detail.isLoading) return <p role="status">Cargando formulario…</p>;
  if (detail.isError) return <p role="alert" className="error-banner">No fue posible cargar el contenido del formulario.</p>;
  return <ObservationList observations={detail.data?.observations} formName={entry.formName} />;
}

function FormEditor({ entry, locale, onSaved, onCancel, hostApi }: { entry: FormEntry; locale: string; onSaved(): void; onCancel(): void; hostApi: BahmniMfeProps["hostApi"] }) {
  const [updated, setUpdated] = useState<Form2Observation[]>([]);
  const [valid, setValid] = useState(false);
  const detail = useQuery({ queryKey: ["clinical", "form-encounter", entry.encounterUuid], queryFn: () => getBahmniEncounter(entry.encounterUuid) });
  const definition = useQuery({ queryKey: ["clinical", "form-definition", entry.formUuid], enabled: Boolean(entry.formUuid), queryFn: async () => form2DefinitionSchema.parse(await getFormDefinition(entry.formUuid!)) });
  const version = String(entry.formVersion ?? definition.data?.version ?? "1");
  const translations = useQuery({ queryKey: ["clinical", "form-translations", entry.formUuid, version, locale], enabled: Boolean(entry.formUuid), queryFn: () => getFormTranslations({ formName: entry.formName, formVersion: version, locale, formUuid: entry.formUuid! }) });
  const parsed = useMemo(() => definition.data ? { ...definition.data, version } : undefined, [definition.data, version]);
  const matching = useMemo(() => flattenObservations(detail.data?.observations).filter((observation) => String(observation.formFieldPath ?? "").startsWith(`${entry.formName}.`)), [detail.data, entry.formName]);
  const report = useCallback((observations: Form2Observation[], formValid: boolean) => { setUpdated(observations); setValid(formValid); }, []);
  const save = useMutation({
    mutationFn: async () => updateFormEncounter(detail.data!, entry.formName, toEncounterWireObservations(updated)),
    onSuccess: async () => {
      await hostApi.audit("EDIT_ENCOUNTER", `Formulario ${entry.formName}`);
      await hostApi.refresh();
      onSaved();
    },
  });
  if (detail.isLoading || definition.isLoading || translations.isLoading) return <p role="status">Preparando edición…</p>;
  if (detail.isError || definition.isError || !parsed) return <p role="alert" className="error-banner">No fue posible cargar la definición publicada para editar este formulario.</p>;
  return <section className="clinical-form-editor"><header><h3>Editar {translations.data?.FORM_NAME ?? entry.displayName}</h3></header><Form2Renderer definition={parsed} observations={matching} translations={translations.data} onChange={report} />{save.isError && <p role="alert" className="error-banner">No fue posible guardar el formulario. No se descartaron los cambios.</p>}<div className="dashboard-inline-actions"><Button outlined label="Cancelar" onClick={onCancel} /><Button label="Guardar cambios" icon="pi pi-save" disabled={!valid || save.isPending} loading={save.isPending} onClick={() => save.mutate()} /></div></section>;
}

export function FormsV2Dashboard({ hostData, hostApi }: BahmniMfeProps) {
  const [selected, setSelected] = useState<FormEntry | null>(null);
  const [editing, setEditing] = useState<FormEntry | null>(null);
  const forms = useQuery({
    queryKey: ["clinical", "forms-v2", hostData.patientUuid, hostData.numberOfVisits, hostData.section.formGroup],
    queryFn: async () => {
      const [summaries, published] = await Promise.all([getPatientFormSummaries(hostData.patientUuid, hostData.numberOfVisits), getLatestPublishedForms()]);
      return summaries.filter((summary) => !hostData.section.formGroup.length || hostData.section.formGroup.includes(summary.formName)).map((summary): FormEntry => {
        const definition = published.find((form) => (form.formName ?? form.name) === summary.formName);
        return { ...summary, formUuid: definition?.formUuid ?? definition?.uuid, displayName: translatedName(definition, hostData.locale, summary.formName), privileges: definition?.privileges };
      }).sort((left, right) => new Date(right.encounterDateTime).getTime() - new Date(left.encounterDateTime).getTime());
    },
  });
  const privilegeNames = useMemo(() => new Set(hostData.currentUser?.privileges.map((privilege) => privilege.name ?? privilege.display).filter((value): value is string => Boolean(value)) ?? []), [hostData.currentUser]);
  const grouped = useMemo(() => (forms.data ?? []).reduce((map, entry) => map.set(entry.displayName, [...(map.get(entry.displayName) ?? []), entry]), new Map<string, FormEntry[]>()), [forms.data]);
  const canEditEntry = (entry: FormEntry) => hasPrivilege(entry, privilegeNames, "edit") && (!hostData.showEditForActiveEncounter || Boolean(hostData.visitIsActive && hostData.visitUuid && entry.visitUuid === hostData.visitUuid));
  if (forms.isLoading) return <p role="status">Cargando formularios…</p>;
  if (forms.isError) return <p role="alert" className="error-banner">No fue posible cargar los formularios del paciente.</p>;
  if (!forms.data?.length) return <p className="muted-text">No hay formularios Form 2 registrados para este paciente.</p>;
  return <div className="clinical-forms-mfe">
    {[...grouped.entries()].map(([name, entries]) => <details key={name} open={grouped.size === 1}><summary><strong>{name}</strong><span>{entries.length}</span></summary><div className="clinical-form-entries">{entries.map((entry) => {
      const canView = hasPrivilege(entry, privilegeNames, "view");
      return <div key={entry.encounterUuid}><span><strong>{new Intl.DateTimeFormat(hostData.locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(entry.encounterDateTime))}</strong><small>{entry.providers[0]?.providerName ?? "Profesional no informado"}</small></span><span className="dashboard-inline-actions"><Button text label="Ver" icon="pi pi-eye" disabled={!canView} onClick={() => { setEditing(null); setSelected(selected?.encounterUuid === entry.encounterUuid ? null : entry); }} />{canEditEntry(entry) && <Button text label="Editar" icon="pi pi-pencil" disabled={!entry.formUuid} onClick={() => { setSelected(null); setEditing(entry); }} />}</span></div>;
    })}</div></details>)}
    {selected && <section className="clinical-form-detail"><header><h3>{selected.displayName}</h3><span><Button text icon="pi pi-print" label="Imprimir" onClick={() => hostApi.print()} /><Button text rounded icon="pi pi-times" aria-label="Cerrar detalle del formulario" onClick={() => setSelected(null)} /></span></header><FormObservationDetails entry={selected} /></section>}
    {editing && <FormEditor key={editing.encounterUuid} entry={editing} locale={hostData.locale} hostApi={hostApi} onCancel={() => setEditing(null)} onSaved={() => setEditing(null)} />}
    {selected && <section className="print-sheet"><h1>{selected.displayName}</h1><p>{hostData.patient.name} · {hostData.patient.identifier}</p><FormObservationDetails entry={selected} /></section>}
  </div>;
}
