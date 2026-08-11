import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "primereact/button";
import { Dropdown } from "primereact/dropdown";
import { useCallback, useMemo, useRef, useState } from "react";
import { hasPrivilege, parseFavouriteObsTemplates, saveUserProperties, serializeFavouriteObsTemplates } from "@/services/bahmni/auth";
import { getFormDefinition, getFormTranslations, getLatestPublishedForms, type PublishedForm } from "@/services/bahmni/forms";
import { Form2Renderer } from "@/features/forms/Form2Renderer";
import { form2DefinitionSchema, type Form2Observation, type Form2Values } from "@/features/forms/form2";
import { formVisibleForVisit } from "../config";
import { useConsultation } from "../ConsultationContext";
import type { ConsultationFormConfig } from "../types";
import { applyConceptSetUiConfig } from "../formAdapters";

function publishedName(form: PublishedForm): string { return form.formName ?? form.name ?? ""; }
function publishedUuid(form: PublishedForm): string { return form.formUuid ?? form.uuid ?? ""; }
function publishedVersion(form: PublishedForm): string { return String(form.formVersion ?? form.version ?? "1"); }
function normalizedName(value: string): string { return value.trim().toLocaleLowerCase(); }

function translatedPublishedName(form: PublishedForm, locale: string): string {
  if (form.nameTranslation) {
    try {
      const translations = JSON.parse(form.nameTranslation) as Array<{ locale?: string; display?: string }>;
      const exact = translations.find((item) => item.locale?.toLocaleLowerCase() === locale.toLocaleLowerCase());
      if (exact?.display) return exact.display;
      const language = locale.split("-")[0]?.toLocaleLowerCase();
      const compatible = translations.find((item) => item.locale?.split("-")[0]?.toLocaleLowerCase() === language);
      if (compatible?.display) return compatible.display;
    } catch { /* OpenMRS may return an empty/non-JSON translation field. */ }
  }
  return publishedName(form);
}

function publishedFormVisible(form: PublishedForm, user: ReturnType<typeof useConsultation>["context"]["user"]): boolean {
  if (!form.privileges?.length) return true;
  return form.privileges.some((privilege) => (privilege.editable === true || privilege.viewable === true) && hasPrivilege(user, privilege.privilegeName));
}

function formHasObservations(formName: string, observations: unknown[]): boolean {
  return observations.some((item) => Boolean(item && typeof item === "object" && String((item as Record<string, unknown>).formFieldPath ?? "").startsWith(`${formName}.`)));
}

interface SectionDisplayState { collapsed: boolean; revision: number }

function ConsultationForm({ config, published, sectionDisplay }: { config: ConsultationFormConfig; published: PublishedForm; sectionDisplay?: SectionDisplayState }) {
  const { context, draft, updateDraft } = useConsultation();
  const uuid = publishedUuid(published);
  const version = publishedVersion(published);
  const definitionQuery = useQuery({
    queryKey: ["consultation-form-definition", uuid, version],
    queryFn: async () => {
      const raw = await getFormDefinition(uuid);
      const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
      return form2DefinitionSchema.parse({ ...source, version });
    },
    enabled: Boolean(uuid),
  });
  const translationsQuery = useQuery({
    queryKey: ["consultation-form-translations", config.formName, version, context.locale, uuid],
    queryFn: () => getFormTranslations({ formName: config.formName, formVersion: version, locale: context.locale, formUuid: uuid }),
    enabled: Boolean(uuid),
  });
  const effectiveDefinition = useMemo(() => definitionQuery.data ? applyConceptSetUiConfig(definitionQuery.data, context.appConfig.conceptSetUI) : undefined, [context.appConfig.conceptSetUI, definitionQuery.data]);
  const observations = useMemo(() => Array.isArray(draft.rawEncounter?.observations) ? draft.rawEncounter.observations : [], [draft.rawEncounter]);
  const existing = useMemo(() => observations.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && String((item as Record<string, unknown>).formFieldPath ?? "").startsWith(`${config.formName}.`))), [config.formName, observations]);
  const initialized = useRef(false);
  const onChange = useCallback(() => undefined, []);
  const onStateChange = useCallback((state: { observations: Form2Observation[]; valid: boolean; values: Form2Values }) => {
    if (!effectiveDefinition) return;
    updateDraft((current) => ({ ...current, forms: { ...current.forms, [config.id]: { id: config.id, formName: config.formName, formUuid: uuid, formVersion: version, definition: effectiveDefinition, observations: state.observations, values: state.values, valid: state.valid, translations: translationsQuery.data ?? {} } } }), initialized.current ? "observations" : undefined);
    initialized.current = true;
  }, [config.formName, config.id, effectiveDefinition, translationsQuery.data, updateDraft, uuid, version]);

  if (definitionQuery.isLoading) return <div className="consultation-form-loading" role="status"><i className="pi pi-spin pi-spinner" /><span>Cargando {config.formName}…</span></div>;
  if (definitionQuery.isError || !effectiveDefinition) return <div className="error-banner consultation-form-error" role="alert"><span>No fue posible interpretar la definición publicada de {config.formName}.</span><Button text size="small" icon="pi pi-refresh" label="Reintentar" onClick={() => void definitionQuery.refetch()} /></div>;
  return <Form2Renderer definition={effectiveDefinition} observations={existing} translations={translationsQuery.data ?? {}} patientUuid={context.patientUuid} sectionDisplay={sectionDisplay} onChange={onChange} onStateChange={onStateChange} />;
}

export function ObservationsBoard() {
  const { context, draft, updateDraft } = useConsultation();
  const published = useQuery({ queryKey: ["consultation-published-forms", draft.encounterUuid], queryFn: () => getLatestPublishedForms(draft.encounterUuid) });
  const rawObservations = useMemo(() => Array.isArray(draft.rawEncounter?.observations) ? draft.rawEncounter.observations : [], [draft.rawEncounter]);
  const editablePublished = useMemo(() => (published.data ?? []).filter((form) => publishedFormVisible(form, context.user)), [context.user, published.data]);
  const publishedByName = useMemo(() => new Map(editablePublished.map((form) => [normalizedName(publishedName(form)), form])), [editablePublished]);
  const configuredNames = useMemo(() => new Set(context.forms.map((form) => normalizedName(form.formName))), [context.forms]);
  const available = useMemo(() => {
    const configured = context.forms.filter((form) => hasPrivilege(context.user, form.requiredPrivilege)
      && formVisibleForVisit(form, context.visit?.visitType?.name ?? context.visit?.visitType?.display)
      && publishedByName.has(normalizedName(form.formName)));
    const additional = editablePublished.flatMap((form, sourceIndex): ConsultationFormConfig[] => {
      const name = publishedName(form);
      if (!name || configuredNames.has(normalizedName(name))) return [];
      return [{ id: `published:${publishedUuid(form)}`, formName: name, order: Number.MAX_SAFE_INTEGER, sourceIndex, default: false, alwaysShow: false }];
    });
    return [...configured, ...additional].sort((left, right) => left.order - right.order || left.sourceIndex - right.sourceIndex);
  }, [configuredNames, context.forms, context.user, context.visit?.visitType, editablePublished, publishedByName]);
  const defaultIds = useMemo(() => available.filter((form) => form.default || form.alwaysShow || formHasObservations(form.formName, rawObservations)).map((form) => form.id), [available, rawObservations]);
  const [opened, setOpened] = useState<string[]>([]);
  const [hidden, setHidden] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const initialFavouriteNames = useMemo(() => parseFavouriteObsTemplates(context.user.userProperties?.favouriteObsTemplates), [context.user.userProperties?.favouriteObsTemplates]);
  const [favouriteNames, setFavouriteNames] = useState<string[]>(initialFavouriteNames);
  const [preferenceError, setPreferenceError] = useState("");
  const [sectionDisplayByForm, setSectionDisplayByForm] = useState<Record<string, SectionDisplayState>>({});
  const [instanceVersions, setInstanceVersions] = useState<Record<string, number>>({});
  const favouriteSet = useMemo(() => new Set(favouriteNames), [favouriteNames]);
  const favouriteIds = useMemo(() => available.filter((form) => favouriteSet.has(form.formName)).map((form) => form.id), [available, favouriteSet]);
  const effectiveOpened = useMemo(() => [...new Set([
    ...favouriteIds,
    ...defaultIds.filter((id) => !hidden.includes(id)),
    ...opened.filter((id) => available.some((form) => form.id === id) && !hidden.includes(id)),
  ])], [available, defaultIds, favouriteIds, hidden, opened]);
  const unopened = available.filter((form) => !effectiveOpened.includes(form.id));
  const effectiveActiveId = activeId && effectiveOpened.includes(activeId) ? activeId : effectiveOpened[0] ?? null;
  const active = available.find((form) => form.id === effectiveActiveId);
  const activePublished = active ? publishedByName.get(normalizedName(active.formName)) : undefined;
  const activePinned = Boolean(active && favouriteSet.has(active.formName));
  const activeHasPersistedObservations = Boolean(active && rawObservations.some((item) => Boolean(
    item && typeof item === "object"
    && String((item as Record<string, unknown>).formFieldPath ?? "").startsWith(`${active.formName}.`)
    && (item as Record<string, unknown>).uuid,
  )));
  const preferenceMutation = useMutation({
    mutationFn: ({ names }: { names: string[] }) => saveUserProperties(context.user.uuid, {
      ...(context.user.userProperties ?? {}),
      favouriteObsTemplates: serializeFavouriteObsTemplates(names),
    }),
  });

  const add = () => {
    if (!selected) return;
    setHidden((current) => current.filter((id) => id !== selected));
    setOpened((current) => [...new Set([...current, selected])]);
    setActiveId(selected);
    setSelected(null);
  };
  const remove = (id: string) => {
    const form = available.find((candidate) => candidate.id === id);
    if (!form || activeHasPersistedObservations) return;
    const remaining = effectiveOpened.filter((candidate) => candidate !== id);
    if (!favouriteSet.has(form.formName)) setHidden((current) => [...new Set([...current, id])]);
    setOpened((current) => current.filter((candidate) => candidate !== id));
    const removedDraft = draft.forms[id];
    updateDraft((current) => {
      const forms = { ...current.forms };
      delete forms[id];
      return { ...current, forms };
    }, removedDraft?.observations.length ? "observations" : undefined);
    setInstanceVersions((current) => ({ ...current, [id]: (current[id] ?? 0) + 1 }));
    if (effectiveActiveId === id) setActiveId(remaining[0] ?? null);
  };
  const setAllSections = (id: string, collapsed: boolean) => setSectionDisplayByForm((current) => ({
    ...current,
    [id]: { collapsed, revision: (current[id]?.revision ?? 0) + 1 },
  }));
  const togglePin = async () => {
    if (!active || preferenceMutation.isPending) return;
    setPreferenceError("");
    const previous = favouriteNames;
    const next = activePinned ? previous.filter((name) => name !== active.formName) : [...previous, active.formName];
    setOpened((current) => [...new Set([...current, active.id])]);
    setHidden((current) => current.filter((id) => id !== active.id));
    setFavouriteNames(next);
    try {
      const saved = await preferenceMutation.mutateAsync({ names: next });
      setFavouriteNames(parseFavouriteObsTemplates(saved.userProperties?.favouriteObsTemplates));
    } catch {
      setFavouriteNames(previous);
      setPreferenceError("No fue posible guardar la preferencia del formulario para este usuario.");
    }
  };

  if (published.isLoading) return <div className="consultation-form-loading" role="status"><i className="pi pi-spin pi-spinner" /><span>Cargando formularios publicados…</span></div>;
  if (published.isError) return <div className="error-banner consultation-form-error" role="alert"><span>No fue posible consultar los formularios publicados en OpenMRS.</span><Button text size="small" icon="pi pi-refresh" label="Reintentar" onClick={() => void published.refetch()} /></div>;

  return <div className="consultation-observations">
    <div className="consultation-observation-toolbar">
      <span><strong>Formularios de observación</strong><small>Definidos por Form Builder y la configuración clínica.</small></span>
      {unopened.length > 0 && <div className="consultation-add-form"><Dropdown value={selected} options={unopened.map((form) => ({ label: translatedPublishedName(publishedByName.get(normalizedName(form.formName))!, context.locale), value: form.id }))} placeholder="Agregar nuevo formulario" filter onChange={(event) => setSelected(event.value as string)} /><Button label="Agregar" icon="pi pi-plus" disabled={!selected} onClick={add} /></div>}
    </div>
    {preferenceError && <div className="error-banner consultation-preference-error" role="alert">{preferenceError}</div>}
    {effectiveOpened.length === 0 ? <div className="empty-state">Seleccione un formulario de observaciones para comenzar.</div> : <div className="consultation-observation-workspace">
      <nav className="consultation-form-navigation" aria-label="Formularios abiertos">
        {effectiveOpened.map((id) => {
          const config = available.find((form) => form.id === id);
          if (!config) return null;
          const form = publishedByName.get(normalizedName(config.formName));
          const label = form ? translatedPublishedName(form, context.locale) : config.formName;
          return <button type="button" className={active?.id === id ? "active" : ""} aria-current={active?.id === id ? "page" : undefined} key={id} onClick={() => setActiveId(id)}><span>{label}</span><span className="consultation-form-navigation-state">{favouriteSet.has(config.formName) && <i className="pi pi-thumbtack" aria-label="Fijado" />}{formHasObservations(config.formName, rawObservations) && <i className="pi pi-check-circle" aria-label="Con datos" />}</span></button>;
        })}
      </nav>
      <section className="consultation-form-surface">
        {active && <header><div><h2>{activePublished ? translatedPublishedName(activePublished, context.locale) : active.formName}</h2><small>{active.formName}</small></div><div className="consultation-form-actions">
          <Button text rounded icon="pi pi-angle-double-down" title="Expandir todas las secciones" aria-label={`Expandir todas las secciones de ${active.formName}`} onClick={() => setAllSections(active.id, false)} />
          <Button text rounded icon="pi pi-angle-double-up" title="Contraer todas las secciones" aria-label={`Contraer todas las secciones de ${active.formName}`} onClick={() => setAllSections(active.id, true)} />
          <Button text rounded className={activePinned ? "is-pinned" : ""} icon="pi pi-thumbtack" title={activePinned ? "Desfijar formulario" : "Fijar formulario"} aria-label={`${activePinned ? "Desfijar" : "Fijar"} ${active.formName}`} aria-pressed={activePinned} loading={preferenceMutation.isPending} onClick={() => void togglePin()} />
          <Button text rounded icon="pi pi-trash" title={activeHasPersistedObservations ? "No se puede quitar un formulario con observaciones guardadas" : "Quitar formulario"} aria-label={`Quitar ${active.formName}`} disabled={activeHasPersistedObservations} onClick={() => remove(active.id)} />
        </div></header>}
        {active && activePublished ? <ConsultationForm key={`${active.id}:${publishedUuid(activePublished)}:${publishedVersion(activePublished)}:${instanceVersions[active.id] ?? 0}`} config={active} published={activePublished} sectionDisplay={sectionDisplayByForm[active.id]} /> : <div className="warning-banner">El formulario seleccionado ya no está publicado o no es visible para este usuario.</div>}
      </section>
    </div>}
  </div>;
}
