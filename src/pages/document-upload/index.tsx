/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import Cookies from "js-cookie";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { DateTime } from "luxon";
import { useRouter } from "next/router";
import { Button } from "primereact/button";
import { Calendar } from "primereact/calendar";
import { Dialog } from "primereact/dialog";
import { Dropdown } from "primereact/dropdown";
import { InputText } from "primereact/inputtext";
import { InputTextarea } from "primereact/inputtextarea";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/AppShell";
import { AuthGuard } from "@/features/auth/AuthGuard";
import { useAuth } from "@/features/auth/AuthContext";
import { AssignedBedBadge } from "@/features/ipd/AssignedBedBadge";
import { documentUploadPatientDestination, filterDocumentUploadPatients, parseDocumentUploadSearchTabs, type DocumentUploadSearchTab } from "@/features/document-upload/patientSearch";
import { hasPrivilege } from "@/services/bahmni/auth";
import { loadAppFile, loadTranslations } from "@/services/bahmni/config";
import { getClinicalQueuePatients, searchAllClinicalPatients } from "@/services/bahmni/clinical";
import { attachDocumentUploadFiles, canModifyDocumentUploadFile, getDocumentUploadConcepts, getDocumentUploadEncounters, getEncounterTypeUuid, saveVisitDocument, uploadVisitDocumentFile, type DocumentUploadVisit, type PendingDocumentUploadFile } from "@/services/bahmni/documentUpload";
import { getVisitTypes } from "@/services/bahmni/metadata";
import { getPatientProfile } from "@/services/bahmni/patients";
import { getPatientVisits } from "@/services/bahmni/visits";
import type { AppExtension, PatientSearchResult, Reference, Visit } from "@/types/bahmni";

interface DocumentUploadContext {
  mode: "radiology" | "patient-documents";
  title: string;
  subtitle: string;
  privilege: string;
  icon: string;
}

interface DocumentPreview {
  title: string;
  url: string;
  mimeType?: string;
}

interface ExistingDocumentEdit {
  conceptUuid?: string;
  conceptName?: string;
  comment?: string;
  voided?: boolean;
  dirty?: boolean;
}

const contextLinks = [
  {
    mode: "radiology",
    label: "Subir Documentos de Radiologia",
    icon: "pi pi-images",
    encounterType: "RADIOLOGY",
    topLevelConcept: "All Radiology orders",
  },
  {
    mode: "patient-documents",
    label: "Documentos de Pacientes",
    icon: "pi pi-file",
    encounterType: "Patient Document",
    topLevelConcept: "Patient Document",
    defaultOption: "Patient file",
  },
] as const;

function configuredText(value: string | string[] | undefined, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function documentUploadContext(encounterType: string): DocumentUploadContext {
  if (encounterType.toLocaleLowerCase("es") === "patient document") {
    return {
      mode: "patient-documents",
      title: "Documentos de Pacientes",
      subtitle: "Busque y seleccione un paciente para administrar sus documentos.",
      privilege: "app:patient-documents",
      icon: "pi pi-file",
    };
  }
  return {
    mode: "radiology",
    title: "Subir Documentos de Radiologia",
    subtitle: "Busque y seleccione un paciente para subir documentos de radiologia.",
    privilege: "app:radiology-upload",
    icon: "pi pi-images",
  };
}

function documentUploadContextHref(link: typeof contextLinks[number], patientUuid?: string): string {
  const params = new URLSearchParams({
    encounterType: link.encounterType,
    topLevelConcept: link.topLevelConcept,
  });
  if ("defaultOption" in link) params.set("defaultOption", link.defaultOption);
  const hash = patientUuid ? `#/patient/${encodeURIComponent(patientUuid)}/document` : "#/search";
  return `/document-upload?${params.toString()}${hash}`;
}

function extensionFile(encounterType: string): string {
  return /^[A-Za-z0-9_-]+$/.test(encounterType) ? `extension-${encounterType}.json` : "extension-RADIOLOGY.json";
}

function extensionsFromConfig(value: Record<string, unknown>): AppExtension[] {
  return Object.entries(value)
    .filter((entry) => Boolean(entry[1]) && typeof entry[1] === "object" && !Array.isArray(entry[1]))
    .map(([id, extension]) => ({ id, ...(extension as Record<string, unknown>) } as AppExtension))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

function useDocumentUploadTranslations() {
  const { i18n } = useTranslation();
  const locale = Cookies.get("bahmni.locale") ?? i18n.resolvedLanguage ?? "es";
  const query = useQuery({ queryKey: ["translations", "document-upload", locale], queryFn: () => loadTranslations("document-upload", locale) });
  useEffect(() => {
    if (!query.data) return;
    i18n.addResourceBundle(locale, "translation", query.data, true, true);
    void i18n.changeLanguage(locale);
  }, [i18n, locale, query.data]);
  return query;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(record) : [];
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function patientSummary(profile: Record<string, unknown>, uuid: string) {
  const patient = record(profile.patient ?? profile);
  const person = record(patient.person ?? profile.person ?? profile);
  const preferredName = records(person.names).find((name) => name.preferred === true) ?? records(person.names)[0] ?? {};
  const identifiers = records(patient.identifiers);
  const identifier = identifiers.find((item) => item.preferred === true) ?? identifiers[0] ?? {};
  const displayName = text(preferredName.display)
    ?? [preferredName.givenName, preferredName.middleName, preferredName.familyName, preferredName.familyName2].map(text).filter(Boolean).join(" ")
    ?? text(person.display)
    ?? "Paciente";
  const birthdate = text(person.birthdate);
  const age = birthdate ? Math.max(0, Math.floor(DateTime.now().diff(DateTime.fromISO(birthdate), "years").years)) : undefined;
  return {
    uuid,
    name: displayName,
    identifier: text(identifier.identifier) ?? text(patient.identifier) ?? "Sin identificador",
    gender: text(person.gender) ?? text(patient.gender) ?? "-",
    age,
  };
}

function patientUuidFromLegacyPath(value: string): string {
  const hash = value.includes("#") ? value.slice(value.indexOf("#")) : value;
  const match = hash.match(/^#\/patient\/([^/]+)\/document/i);
  return match?.[1] ? decodeURIComponent(match[1]) : "";
}

function useLegacyDocumentUploadPatientUuid(asPath: string) {
  const [patientUuid, setPatientUuid] = useState("");
  useEffect(() => {
    const sync = (path?: string) => {
      const browserPath = typeof window === "undefined" ? "" : `${window.location.pathname}${window.location.search}${window.location.hash}`;
      setPatientUuid(patientUuidFromLegacyPath(path ?? browserPath));
    };
    const syncBrowserPath = () => sync();
    sync(asPath);
    window.addEventListener("hashchange", syncBrowserPath);
    return () => window.removeEventListener("hashchange", syncBrowserPath);
  }, [asPath]);
  return patientUuid;
}

function formatVisitDate(value?: string | null): string {
  if (!value) return "";
  const date = DateTime.fromISO(value).setLocale("es");
  return date.isValid ? date.toFormat("dd LLL. yyyy") : String(value);
}

function toIsoDate(value?: Date | null): string | null {
  return value ? DateTime.fromJSDate(value).startOf("day").toISO() : null;
}

function visitDisplayRange(visit: Pick<Visit, "startDatetime" | "stopDatetime">): string {
  const start = formatVisitDate(visit.startDatetime);
  const stop = formatVisitDate(visit.stopDatetime);
  return stop ? `${start} a ${stop}` : start;
}

function overlappingVisit(visits: DocumentUploadVisit[], start: Date | null, end: Date | null): DocumentUploadVisit | undefined {
  if (!start) return undefined;
  const requestedStart = DateTime.fromJSDate(start).startOf("day").toMillis();
  const requestedEnd = DateTime.fromJSDate(end ?? start).endOf("day").toMillis();
  return visits.find((visit) => {
    const visitStart = DateTime.fromISO(visit.startDatetime).startOf("day").toMillis();
    const visitEnd = visit.stopDatetime ? DateTime.fromISO(visit.stopDatetime).endOf("day").toMillis() : Number.POSITIVE_INFINITY;
    return requestedStart <= visitEnd && requestedEnd >= visitStart;
  });
}

function invalidVisitRange(start: Date | null, end: Date | null): boolean {
  if (!start || !end) return false;
  return DateTime.fromJSDate(end).endOf("day") < DateTime.fromJSDate(start).startOf("day");
}

function documentImageValue(value: string): string {
  return value.replace(/^\/?document_images\//u, "");
}

function documentImageName(value: string): string {
  const image = documentImageValue(value);
  return decodeURIComponent(image.split("/").pop() || image || "Documento");
}

function readFileDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function inferredMimeType(file: File): string {
  if (file.type) return file.type;
  const extension = file.name.split(".").pop()?.toLocaleLowerCase("es");
  if (extension === "pdf") return "application/pdf";
  if (extension === "png") return "image/png";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "gif") return "image/gif";
  if (extension === "webp") return "image/webp";
  return "";
}

async function pendingFilesFromInput(fileList: FileList | null, defaultConcept: Reference | undefined): Promise<PendingDocumentUploadFile[]> {
  if (!fileList) return [];
  return Promise.all(Array.from(fileList).map(async (file, index) => ({
    id: `${Date.now()}-${index}-${file.name}`,
    fileName: file.name,
    mimeType: inferredMimeType(file),
    dataUrl: await readFileDataUrl(file),
    conceptUuid: defaultConcept?.uuid,
    conceptName: defaultConcept?.name ?? defaultConcept?.display,
  })));
}

function DocumentUploadModuleNavigation({ activeMode, patientUuid }: { activeMode: DocumentUploadContext["mode"]; patientUuid?: string }) {
  return <nav className="ipd-module-navigation document-upload-module-navigation" aria-label="Secciones de documentos">
    {contextLinks.map((link) => <Link key={link.mode} href={documentUploadContextHref(link, patientUuid)} className={activeMode === link.mode ? "selected" : undefined} aria-current={activeMode === link.mode ? "page" : undefined}>
      <i className={link.icon} aria-hidden="true" />
      <span>{link.label}</span>
    </Link>)}
  </nav>;
}

function PatientResults({ tab, patients, encounterType, topLevelConcept, defaultOption }: { tab: DocumentUploadSearchTab; patients: PatientSearchResult[]; encounterType: string; topLevelConcept: string; defaultOption?: string }) {
  if (patients.length === 0) return <div className="clinical-search-empty"><i className="pi pi-user-minus" aria-hidden="true" /><strong>Sin pacientes encontrados</strong><span>No hay pacientes que coincidan con este criterio.</span></div>;
  return <div className="clinical-patient-results">{patients.map((patient) => {
    const name = String(patient.name ?? ([patient.givenName, patient.middleName, patient.familyName, patient.familyName2].filter(Boolean).join(" ") || patient.identifier || "Paciente"));
    return <Link key={patient.uuid} href={documentUploadPatientDestination(tab, patient, { encounterType, topLevelConcept, defaultOption })}>
      <span className="clinical-result-avatar" aria-hidden="true">{name.charAt(0).toLocaleUpperCase()}</span>
      <span><strong>{name}</strong><small>{patient.identifier || "Sin identificador"}</small></span>
      <span className="clinical-result-badges"><AssignedBedBadge patientUuid={patient.uuid} /></span>
      <i className="pi pi-chevron-right" aria-hidden="true" />
    </Link>;
  })}</div>;
}

function DocumentUploadSearch({ encounterType, topLevelConcept, defaultOption, context }: { encounterType: string; topLevelConcept: string; defaultOption?: string; context: DocumentUploadContext }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, location, provider } = useAuth();
  const [filter, setFilter] = useState("");
  const selectedId = typeof router.query.tab === "string" ? router.query.tab : "";
  const routeQuery = typeof router.query.q === "string" ? router.query.q : "";
  const allowed = hasPrivilege(user, context.privilege);
  const extensions = useQuery({
    queryKey: ["extensions", "documentUpload", encounterType],
    queryFn: async () => extensionsFromConfig(await loadAppFile("documentUpload", extensionFile(encounterType))),
    enabled: allowed,
  });
  const tabs = useMemo(() => parseDocumentUploadSearchTabs(extensions.data ?? [], user, context.privilege), [context.privilege, extensions.data, user]);
  const selectedTab = tabs.find((tab) => tab.id === selectedId) ?? tabs[0];
  const handlerTabs = useMemo(() => tabs.filter((tab): tab is DocumentUploadSearchTab & { handler: string } => Boolean(tab.handler)), [tabs]);
  const queueQueries = useQueries({ queries: handlerTabs.map((tab) => ({
    queryKey: ["document-upload-patient-queue", tab.id, tab.handler, location?.uuid, provider?.uuid],
    queryFn: () => getClinicalQueuePatients({ handler: tab.handler, locationUuid: location?.uuid, providerUuid: provider?.uuid }),
    enabled: allowed && Boolean(location?.uuid),
    refetchInterval: false as const,
  })) });
  const queues = useMemo(() => new Map(handlerTabs.map((tab, index) => [tab.id, queueQueries[index]])), [handlerTabs, queueQueries]);
  const selectedQueue = selectedTab?.handler ? queues.get(selectedTab.id) : undefined;
  const visibleQueue = useMemo(() => filterDocumentUploadPatients(selectedQueue?.data ?? [], filter), [selectedQueue?.data, filter]);
  const allPatients = useQuery({
    queryKey: ["document-upload-all-patients", routeQuery, location?.uuid],
    queryFn: () => searchAllClinicalPatients({ query: routeQuery, locationUuid: location?.uuid }),
    enabled: allowed && Boolean(selectedTab && !selectedTab.handler && routeQuery.trim()),
  });
  useEffect(() => {
    if (!selectedTab || selectedTab.handler || allPatients.data?.length !== 1) return;
    const patient = allPatients.data[0];
    if (patient) void router.push(documentUploadPatientDestination(selectedTab, patient, { encounterType, topLevelConcept, defaultOption }));
  }, [allPatients.data, defaultOption, encounterType, router, selectedTab, topLevelConcept]);
  const baseQuery = { encounterType, topLevelConcept, ...(defaultOption ? { defaultOption } : {}) };
  const switchTab = (tab: DocumentUploadSearchTab) => {
    setFilter("");
    void router.push({ pathname: "/document-upload", query: { ...baseQuery, tab: tab.id } }, undefined, { shallow: true });
  };
  const submit = () => {
    if (!selectedTab) return;
    if (selectedTab.handler) {
      const patient = visibleQueue.length === 1 ? visibleQueue[0] : undefined;
      if (patient) void router.push(documentUploadPatientDestination(selectedTab, patient, { encounterType, topLevelConcept, defaultOption }));
      return;
    }
    const query = filter.trim();
    if (query) void router.push({ pathname: "/document-upload", query: { ...baseQuery, tab: selectedTab.id, q: query } }, undefined, { shallow: true });
  };

  return <AppShell mainClassName="document-upload-page">
    <DocumentUploadModuleNavigation activeMode={context.mode} />
    {!allowed && <p role="alert" className="error-banner">No tiene el privilegio {context.privilege} requerido por este modulo.</p>}
    {allowed && <section className="panel clinical-search-panel document-upload-search-panel">
      <header className="clinical-search-header"><span className="clinical-search-icon"><i className={context.icon} aria-hidden="true" /></span><div><h2>{context.title}</h2><p>{context.subtitle}</p></div></header>
      {extensions.isLoading && <p role="status" className="document-upload-status">Cargando colas de pacientes...</p>}
      {extensions.isError && <p role="alert" className="error-banner">No fue posible cargar la configuracion de busqueda.</p>}
      {selectedTab && <>
        <nav className="clinical-search-tabs" role="tablist" aria-label="Tipos de busqueda de documentos">{tabs.map((tab) => {
          const queue = tab.handler ? queues.get(tab.id) : undefined;
          const count = tab.id === selectedTab?.id && tab.handler && filter ? visibleQueue.length : queue?.data?.length;
          return <button key={tab.id} type="button" role="tab" aria-selected={tab.id === selectedTab?.id} className={tab.id === selectedTab?.id ? "selected" : ""} onClick={() => switchTab(tab)}>
            <span>{String(t(tab.translationKey ?? "", { defaultValue: tab.label }))}</span>
            {tab.handler && <small aria-label={`${count ?? 0} pacientes`}>{queue?.isLoading ? "..." : count ?? 0}</small>}
          </button>;
        })}</nav>
        <form className="clinical-search-form" onSubmit={(event) => { event.preventDefault(); submit(); }}>
          <span className="p-input-icon-left"><i className="pi pi-search" /><InputText id="document-upload-search" aria-label="Paciente por nombre o identificador" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder={String(t("SEARCH_NAME_PLACEHOLDER_KEY", { defaultValue: "Buscar Nombre/ID ..." }))} /></span>
          {!selectedTab.handler && <Button type="submit" icon="pi pi-search" label={String(t("SEARCH_KEY", { defaultValue: "Buscar" }))} disabled={!filter.trim()} />}
        </form>
        {selectedTab.handler && selectedQueue?.isLoading && <p role="status" className="document-upload-status">Cargando pacientes de la cola...</p>}
        {selectedTab.handler && selectedQueue?.isError && <p role="alert" className="error-banner">No fue posible cargar esta cola.</p>}
        {selectedTab.handler && selectedQueue?.data && <PatientResults tab={selectedTab} patients={visibleQueue} encounterType={encounterType} topLevelConcept={topLevelConcept} defaultOption={defaultOption} />}
        {!selectedTab.handler && routeQuery && allPatients.isLoading && <p role="status" className="document-upload-status">Buscando pacientes...</p>}
        {!selectedTab.handler && allPatients.isError && <p role="alert" className="error-banner">No fue posible buscar pacientes.</p>}
        {!selectedTab.handler && allPatients.data && <PatientResults tab={selectedTab} patients={allPatients.data} encounterType={encounterType} topLevelConcept={topLevelConcept} defaultOption={defaultOption} />}
        {!selectedTab.handler && !routeQuery && <div className="clinical-search-empty"><i className="pi pi-search" aria-hidden="true" /><strong>{String(t("MODULE_LABEL_ALL_PATIENTS_KEY", { defaultValue: "Todos los Pacientes" }))}</strong><span>{String(t("SEARCH_NAME_PLACEHOLDER_KEY", { defaultValue: "Buscar Nombre/ID ..." }))}</span></div>}
      </>}
    </section>}
  </AppShell>;
}

function FileTiles({
  files,
  concepts,
  defaultConcept,
  conceptsLoading,
  conceptsError,
  onChange,
  onRemove,
  onPreview,
}: {
  files: PendingDocumentUploadFile[];
  concepts: Reference[];
  defaultConcept?: Reference;
  conceptsLoading: boolean;
  conceptsError: boolean;
  onChange(file: PendingDocumentUploadFile): void;
  onRemove(fileId: string): void;
  onPreview(file: DocumentPreview): void;
}) {
  const options = useMemo(() => concepts.map((concept) => ({ label: concept.name ?? concept.display, value: concept.uuid })), [concepts]);
  const conceptByUuid = useMemo(() => new Map(concepts.map((concept) => [concept.uuid, concept])), [concepts]);
  const [openNotes, setOpenNotes] = useState<Set<string>>(() => new Set(files.filter((file) => file.comment).map((file) => file.id)));
  const toggleNotes = (fileId: string) => {
    setOpenNotes((current) => {
      const next = new Set(current);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  };
  return <ul className="document-upload-files">{files.map((file) => {
    const notesVisible = openNotes.has(file.id);
    return <li key={file.id} className={notesVisible ? "notes-open" : undefined}>
      <button type="button" className="document-upload-preview" onClick={() => onPreview({ title: file.fileName, url: file.dataUrl, mimeType: file.mimeType })}>{file.mimeType.includes("pdf") ? <i className="pi pi-file-pdf" aria-hidden="true" /> : <img src={file.dataUrl} alt="" />}</button>
      <div className="document-upload-file-main">
        <div className="field document-upload-type-field">
          <label className="document-upload-sr-only">Tipo de documento</label>
          <Dropdown value={file.conceptUuid ?? defaultConcept?.uuid ?? ""} options={options} loading={conceptsLoading} disabled={conceptsLoading || conceptsError} onChange={(event) => {
            const concept = conceptByUuid.get(String(event.value));
            onChange({ ...file, conceptUuid: concept?.uuid, conceptName: concept?.name ?? concept?.display });
          }} filter scrollHeight="16rem" virtualScrollerOptions={options.length > 80 ? { itemSize: 38 } : undefined} placeholder={conceptsLoading ? "Cargando tipos..." : "Seleccione tipo"} panelClassName="document-upload-type-panel" />
          {conceptsError && <small className="field-error">No fue posible cargar tipos.</small>}
        </div>
        <span className="document-upload-file-name"><i className="pi pi-paperclip" aria-hidden="true" /><span>{file.fileName}</span></span>
      </div>
      <div className="document-upload-file-actions">
        <Button outlined severity={notesVisible ? "info" : "secondary"} icon="pi pi-file-plus" aria-label={notesVisible ? "Ocultar notas" : "Agregar notas"} title={notesVisible ? "Ocultar notas" : "Agregar notas"} onClick={() => toggleNotes(file.id)} className="document-upload-note-toggle" />
        <Button outlined severity="danger" icon="pi pi-times" aria-label="Quitar archivo" title="Quitar archivo" onClick={() => onRemove(file.id)} className="document-upload-remove" />
      </div>
      {notesVisible && <div className="field document-upload-notes-field">
        <label className="document-upload-sr-only">Notas</label>
        <InputTextarea rows={2} value={file.comment ?? ""} onChange={(event) => onChange({ ...file, comment: event.target.value })} maxLength={255} placeholder="Notas" />
      </div>}
    </li>;
  })}</ul>;
}

function ExistingFiles({
  visit,
  concepts,
  conceptsLoading,
  conceptsError,
  edits,
  currentUserPersonUuid,
  currentProviderUuid,
  onChange,
  onPreview,
}: {
  visit: DocumentUploadVisit;
  concepts: Reference[];
  conceptsLoading: boolean;
  conceptsError: boolean;
  edits: Record<string, ExistingDocumentEdit>;
  currentUserPersonUuid?: string;
  currentProviderUuid?: string;
  onChange(fileId: string, edit: ExistingDocumentEdit): void;
  onPreview(file: DocumentPreview): void;
}) {
  const [openNotes, setOpenNotes] = useState<Set<string>>(() => new Set());
  const baseOptions = useMemo(() => concepts.map((concept) => ({ label: concept.name ?? concept.display, value: concept.uuid })), [concepts]);
  const conceptByUuid = useMemo(() => new Map(concepts.map((concept) => [concept.uuid, concept])), [concepts]);
  const toggleNotes = (fileId: string) => {
    setOpenNotes((current) => {
      const next = new Set(current);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  };
  const optionsFor = (file: DocumentUploadVisit["files"][number]) => {
    if (!file.concept.uuid || baseOptions.some((option) => option.value === file.concept.uuid)) return baseOptions;
    return [{ label: file.concept.editableName || file.concept.name, value: file.concept.uuid }, ...baseOptions];
  };
  if (!visit.files.length) return null;
  return <ul className="document-upload-files document-upload-existing-files">{visit.files.map((file) => {
    const edit = edits[file.id] ?? {};
    const conceptUuid = edit.conceptUuid ?? file.concept.uuid ?? "";
    const conceptName = edit.conceptName ?? file.concept.editableName ?? file.concept.name;
    const comment = edit.comment ?? file.comment ?? "";
    const voided = edit.voided ?? file.voided ?? false;
    const notesVisible = openNotes.has(file.id);
    const fileName = documentImageName(file.encodedValue);
    const canModify = canModifyDocumentUploadFile(file, currentUserPersonUuid, currentProviderUuid);
    return <li key={file.id} className={`${notesVisible ? "notes-open " : ""}${voided ? "voided" : ""}`.trim() || undefined}>
      <button type="button" className="document-upload-preview" onClick={() => onPreview({ title: conceptName, url: file.encodedValue, mimeType: file.encodedValue.toLocaleLowerCase().includes(".pdf") ? "application/pdf" : "image/*" })}>{file.encodedValue.toLocaleLowerCase().includes(".pdf") ? <i className="pi pi-file-pdf" aria-hidden="true" /> : <img src={file.encodedValue} alt="" />}</button>
      <div className="document-upload-file-main">
        <div className="field document-upload-type-field">
          <label className="document-upload-sr-only">Tipo de documento</label>
          <Dropdown value={conceptUuid} options={optionsFor(file)} loading={conceptsLoading} disabled={!canModify || conceptsLoading || conceptsError || voided} onChange={(event) => {
            const concept = conceptByUuid.get(String(event.value));
            onChange(file.id, { ...edit, conceptUuid: concept?.uuid ?? String(event.value), conceptName: concept?.name ?? concept?.display ?? conceptName, dirty: true });
          }} filter scrollHeight="16rem" virtualScrollerOptions={baseOptions.length > 80 ? { itemSize: 38 } : undefined} placeholder={conceptsLoading ? "Cargando tipos..." : "Seleccione tipo"} panelClassName="document-upload-type-panel" />
          {conceptsError && <small className="field-error">No fue posible cargar tipos.</small>}
        </div>
        <span className="document-upload-file-name"><i className="pi pi-paperclip" aria-hidden="true" /><span>{fileName}</span></span>
      </div>
      <div className="document-upload-file-actions">
        <Button outlined severity={notesVisible ? "info" : "secondary"} icon={comment ? "pi pi-file-edit" : "pi pi-file-plus"} aria-label={notesVisible ? "Ocultar notas" : "Agregar notas"} title={notesVisible ? "Ocultar notas" : "Agregar notas"} onClick={() => toggleNotes(file.id)} className={comment ? "document-upload-note-toggle has-notes" : "document-upload-note-toggle"} />
        {canModify && <Button outlined severity={voided ? "secondary" : "danger"} icon={voided ? "pi pi-undo" : "pi pi-times"} aria-label={voided ? "Restaurar archivo" : "Quitar archivo"} title={voided ? "Restaurar archivo" : "Quitar archivo"} onClick={() => onChange(file.id, { ...edit, voided: !voided, dirty: true })} className="document-upload-remove" />}
      </div>
      {notesVisible && <div className="field document-upload-notes-field">
        <label className="document-upload-sr-only">Notas</label>
        <InputTextarea rows={2} value={comment} disabled={!canModify || voided} onChange={(event) => onChange(file.id, { ...edit, comment: event.target.value, dirty: true })} maxLength={255} placeholder="Notas" />
      </div>}
    </li>;
  })}</ul>;
}

function DocumentUploadPatient({ patientUuid, encounterType, topLevelConcept, defaultOption, context }: { patientUuid: string; encounterType: string; topLevelConcept: string; defaultOption?: string; context: DocumentUploadContext }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, provider, location } = useAuth();
  const allowed = hasPrivilege(user, context.privilege);
  const [openKey, setOpenKey] = useState("new");
  const [newVisitTypeUuid, setNewVisitTypeUuid] = useState("");
  const [newVisitStart, setNewVisitStart] = useState<Date | null>(null);
  const [newVisitEnd, setNewVisitEnd] = useState<Date | null>(null);
  const [staged, setStaged] = useState<Record<string, PendingDocumentUploadFile[]>>({});
  const [existingEdits, setExistingEdits] = useState<Record<string, Record<string, ExistingDocumentEdit>>>({});
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [preview, setPreview] = useState<DocumentPreview | null>(null);
  const [conceptsRequested, setConceptsRequested] = useState(false);
  const profile = useQuery({ queryKey: ["patient", patientUuid], queryFn: () => getPatientProfile(patientUuid), enabled: allowed && Boolean(patientUuid) });
  const visitTypes = useQuery({ queryKey: ["visit-types"], queryFn: getVisitTypes, enabled: allowed });
  const encounterTypeUuid = useQuery({ queryKey: ["document-upload", "encounter-type", encounterType], queryFn: () => getEncounterTypeUuid(encounterType), enabled: allowed && Boolean(encounterType) });
  const visits = useQuery({ queryKey: ["document-upload", "visits", patientUuid], queryFn: () => getPatientVisits(patientUuid, true), enabled: allowed && Boolean(patientUuid) });
  const concepts = useQuery({ queryKey: ["document-upload", "concepts", topLevelConcept], queryFn: () => getDocumentUploadConcepts(topLevelConcept), enabled: allowed && Boolean(topLevelConcept && conceptsRequested), staleTime: 30 * 60 * 1000 });
  const encounters = useQuery({
    queryKey: ["document-upload", "encounters", patientUuid, encounterTypeUuid.data],
    queryFn: () => getDocumentUploadEncounters(patientUuid, encounterTypeUuid.data!),
    enabled: allowed && Boolean(patientUuid && encounterTypeUuid.data),
  });
  const uploadVisits = useMemo(() => attachDocumentUploadFiles((visits.data ?? []) as Visit[], encounters.data ?? []), [encounters.data, visits.data]);
  const defaultConcept = useMemo(() => {
    const list = concepts.data ?? [];
    if (!defaultOption) return list[0];
    const normalized = defaultOption.toLocaleLowerCase("es");
    return list.find((concept) => [concept.name, concept.display].some((value) => String(value ?? "").toLocaleLowerCase("es") === normalized)) ?? list[0];
  }, [concepts.data, defaultOption]);
  const invalidNewVisitRange = useMemo(() => invalidVisitRange(newVisitStart, newVisitEnd), [newVisitEnd, newVisitStart]);
  const conflictingVisit = useMemo(() => overlappingVisit(uploadVisits, newVisitStart, newVisitEnd), [newVisitEnd, newVisitStart, uploadVisits]);
  const patient = profile.data ? patientSummary(profile.data, patientUuid) : undefined;
  const loading = profile.isLoading || visitTypes.isLoading || encounterTypeUuid.isLoading || visits.isLoading || encounters.isLoading;
  const failed = profile.isError || visitTypes.isError || encounterTypeUuid.isError || visits.isError || encounters.isError || encounterTypeUuid.data === undefined;
  const backHref = `/document-upload?${new URLSearchParams({ encounterType, topLevelConcept, ...(defaultOption ? { defaultOption } : {}) }).toString()}#/search`;
  const currentUserPersonUuid = user?.person?.uuid;

  useEffect(() => {
    if (message?.type !== "success") return undefined;
    const timeout = window.setTimeout(() => setMessage(null), 3500);
    return () => window.clearTimeout(timeout);
  }, [message]);

  const addFiles = async (visitKey: string, fileList: FileList | null) => {
    setConceptsRequested(true);
    const files = await pendingFilesFromInput(fileList, defaultConcept);
    if (!files.length) return;
    setStaged((current) => ({ ...current, [visitKey]: [...(current[visitKey] ?? []), ...files] }));
  };
  const updateFile = (visitKey: string, file: PendingDocumentUploadFile) => setStaged((current) => ({ ...current, [visitKey]: (current[visitKey] ?? []).map((candidate) => candidate.id === file.id ? file : candidate) }));
  const removeFile = (visitKey: string, fileId: string) => setStaged((current) => ({ ...current, [visitKey]: (current[visitKey] ?? []).filter((file) => file.id !== fileId) }));
  const updateExistingFile = (visitKey: string, fileId: string, edit: ExistingDocumentEdit) => setExistingEdits((current) => ({ ...current, [visitKey]: { ...(current[visitKey] ?? {}), [fileId]: edit } }));
  const toggleVisit = (visitKey: string, visit?: DocumentUploadVisit) => {
    const nextOpenKey = openKey === visitKey ? "" : visitKey;
    setOpenKey(nextOpenKey);
    if (nextOpenKey && visit?.files.length) setConceptsRequested(true);
  };
  const canSave = (visitKey: string, visit?: DocumentUploadVisit) => {
    const files = staged[visitKey] ?? [];
    const existingChanges = Object.values(existingEdits[visitKey] ?? {}).filter((edit) => edit.dirty);
    if (!files.length && !existingChanges.length) return false;
    if (files.length && (concepts.isLoading || concepts.isError || files.some((file) => !(file.conceptUuid ?? defaultConcept?.uuid)))) return false;
    if (visitKey === "new") return Boolean(newVisitTypeUuid && newVisitStart && !invalidNewVisitRange && !conflictingVisit);
    return Boolean(visit?.visitType?.uuid);
  };
  const save = useMutation({
    mutationFn: async ({ visitKey, visit }: { visitKey: string; visit?: DocumentUploadVisit }) => {
      if (visitKey === "new" && invalidNewVisitRange) throw new Error("La fecha de finalizacion no puede ser anterior a la fecha de inicio.");
      if (visitKey === "new" && conflictingVisit) throw new Error("Ya existe una visita dentro de las fechas introducidas. Cargue los documentos en la visita correspondiente.");
      const files = staged[visitKey] ?? [];
      const visitExistingEdits = existingEdits[visitKey] ?? {};
      const uploaded = await Promise.all(files.map((file) => uploadVisitDocumentFile(file, patientUuid, encounterType)));
      const visitStartDate = visitKey === "new" ? toIsoDate(newVisitStart) : visit?.startDatetime ?? null;
      const visitEndDate = visitKey === "new" ? toIsoDate(newVisitEnd) : visit?.stopDatetime ?? null;
      const encounterDateTime = visitEndDate ? visitStartDate : null;
      const newVisitType = visitTypes.data?.find((type) => type.uuid === newVisitTypeUuid);
      const visitTypeName = visitKey === "new" ? newVisitType?.name ?? newVisitType?.display : visit?.visitType?.name ?? visit?.visitType?.display;
      const existingDocuments = (visit?.files ?? []).flatMap((file) => {
        const edit = visitExistingEdits[file.id];
        if (!edit?.dirty) return [];
        return [{
          testUuid: edit.conceptUuid ?? file.concept.uuid,
          image: documentImageValue(file.encodedValue),
          voided: edit.voided ?? file.voided,
          obsUuid: file.obsUuid,
          comment: (edit.comment ?? file.comment) || undefined,
        }];
      });
      await saveVisitDocument({
        patientUuid,
        visitTypeUuid: visitKey === "new" ? newVisitTypeUuid : visit?.visitType?.uuid ?? "",
        visitStartDate,
        visitEndDate,
        encounterTypeUuid: encounterTypeUuid.data ?? "",
        encounterDateTime,
        providerUuid: provider?.uuid,
        visitUuid: visitKey === "new" ? undefined : visit?.uuid,
        locationUuid: location?.uuid,
        visitTypeName,
        encounterTypeName: encounterType,
        documents: [...existingDocuments, ...uploaded.map((image, index) => ({
          testUuid: files[index]?.conceptUuid ?? defaultConcept?.uuid,
          image,
          obsDateTime: encounterDateTime,
          comment: files[index]?.comment || undefined,
        }))],
      });
    },
    onSuccess: async (_data, variables) => {
      setMessage({ type: "success", text: "Archivo guardado correctamente." });
      setStaged((current) => ({ ...current, [variables.visitKey]: [] }));
      setExistingEdits((current) => ({ ...current, [variables.visitKey]: {} }));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["document-upload", "visits", patientUuid] }),
        queryClient.invalidateQueries({ queryKey: ["document-upload", "encounters", patientUuid] }),
      ]);
      if (variables.visitKey === "new") {
        setNewVisitStart(null);
        setNewVisitEnd(null);
        setNewVisitTypeUuid("");
      }
    },
    onError: (error) => setMessage({ type: "error", text: error instanceof Error ? error.message : "No fue posible guardar el documento." }),
  });
  const previewHeader = <div className="document-upload-preview-header">
    <span className="document-upload-preview-header-icon" aria-hidden="true"><i className={context.icon} /></span>
    <div className="document-upload-preview-heading">
      <strong>{preview?.title ?? "Documento"}</strong>
      <span>{patient ? `${patient.name} (${patient.identifier})` : context.title}</span>
    </div>
    <span className="document-upload-preview-context">{context.title}</span>
  </div>;

  return <AppShell mainClassName="document-upload-page">
    <DocumentUploadModuleNavigation activeMode={context.mode} patientUuid={patientUuid} />
    {!allowed && <p role="alert" className="error-banner">No tiene el privilegio {context.privilege} requerido por este modulo.</p>}
    {allowed && <div className="ipd-workspace document-upload-workspace">
      <aside className="panel ipd-context document-upload-context">
        <header className="ipd-context-header">
          <span className="ipd-context-avatar" aria-hidden="true">{patient?.name.charAt(0).toLocaleUpperCase() ?? "P"}</span>
          <div><small>Paciente seleccionado</small><h2>{patient?.name ?? "Paciente"}</h2>{patient && <span>{patient.identifier}</span>}</div>
        </header>
        {patient && <dl className="ipd-context-details">
          <dt>Edad / sexo</dt><dd>{patient.age ?? "-"} / {patient.gender}</dd>
          <dt>Modulo</dt><dd>{context.title}</dd>
          <dt>Visitas</dt><dd>{uploadVisits.length}</dd>
        </dl>}
        <div className="ipd-actions"><Button outlined icon="pi pi-users" label="Volver a pacientes" onClick={() => void router.push(backHref)} /></div>
      </aside>
      <section className="panel ipd-bed-map document-upload-documents">
        <header className="ipd-map-header">
          <div className="ipd-map-heading"><span><i className={context.icon} aria-hidden="true" /></span><div><small>{context.title}</small><h2>Documentos</h2><p>Seleccione una visita, adjunte archivos y guarde los documentos asociados.</p></div></div>
        </header>
        {message && <p role={message.type === "error" ? "alert" : "status"} className={`${message.type === "error" ? "error-banner" : "success-banner"} document-upload-message`}>{message.text}</p>}
        {loading && <p role="status" className="document-upload-status">Cargando documentos...</p>}
        {failed && <p role="alert" className="error-banner document-upload-message">No fue posible cargar la informacion de documentos.</p>}
        {!loading && !failed && <div className="document-upload-visit-list">
          <article className="document-upload-visit-panel">
            <button type="button" className="document-upload-visit-header" onClick={() => toggleVisit("new")}><i className={`pi ${openKey === "new" ? "pi-chevron-down" : "pi-chevron-right"}`} /><span>Nueva visita</span></button>
            {openKey === "new" && <div className="document-upload-visit-body">
              {conflictingVisit && <div className="warning-banner document-upload-date-warning">
                <span>Ya existe una visita dentro de las fechas introducidas ({visitDisplayRange(conflictingVisit)}). Por favor, cargue los documentos de la visita correspondiente.</span>
                <Button text label="Abrir visita" icon="pi pi-arrow-right" onClick={() => toggleVisit(conflictingVisit.uuid, conflictingVisit)} />
              </div>}
              {invalidNewVisitRange && <div className="warning-banner document-upload-date-warning">La fecha de finalizacion no puede ser anterior a la fecha de inicio.</div>}
              <div className="document-upload-form-grid">
                <div className="field"><label>Tipo de visita *</label><Dropdown value={newVisitTypeUuid} options={visitTypes.data ?? []} optionLabel="display" optionValue="uuid" onChange={(event) => setNewVisitTypeUuid(String(event.value ?? ""))} placeholder="Seleccione" /></div>
                <div className="field"><label>Fecha de inicio *</label><Calendar value={newVisitStart} dateFormat="dd/mm/yy" showIcon onChange={(event) => setNewVisitStart(event.value instanceof Date ? event.value : null)} /></div>
                <div className="field"><label>Fecha de finalizacion</label><Calendar value={newVisitEnd} dateFormat="dd/mm/yy" showIcon onChange={(event) => setNewVisitEnd(event.value instanceof Date ? event.value : null)} /></div>
              </div>
              <div className="document-upload-actions">
                <input id="document-upload-new-file" type="file" multiple accept="application/pdf,image/*" onChange={(event) => { void addFiles("new", event.target.files); event.currentTarget.value = ""; }} />
                <label htmlFor="document-upload-new-file" className="p-button p-component p-button-outlined document-upload-file-button"><i className="pi pi-camera" /> Escanear</label>
                <Button icon="pi pi-save" label="Guardar" disabled={!canSave("new") || save.isPending} loading={save.isPending} onClick={() => save.mutate({ visitKey: "new" })} />
              </div>
              <FileTiles files={staged.new ?? []} concepts={concepts.data ?? []} defaultConcept={defaultConcept} conceptsLoading={concepts.isLoading} conceptsError={concepts.isError} onChange={(file) => updateFile("new", file)} onRemove={(fileId) => removeFile("new", fileId)} onPreview={setPreview} />
            </div>}
          </article>
          {uploadVisits.map((visit) => {
            const visitKey = visit.uuid;
            const pending = staged[visitKey] ?? [];
            return <article key={visit.uuid} className="document-upload-visit-panel">
              <button type="button" className="document-upload-visit-header" onClick={() => toggleVisit(visitKey, visit)}>
                <i className={`pi ${openKey === visitKey ? "pi-chevron-down" : "pi-chevron-right"}`} />
                <span>Visita</span><small>Desde: {visitDisplayRange(visit)}</small>{!visit.stopDatetime && <span className="document-upload-active-visit"><i className="pi pi-star-fill" /> Activa</span>}
              </button>
              {openKey === visitKey && <div className="document-upload-visit-body">
                <div className="document-upload-actions align-end">
                  <input id={`document-upload-file-${visit.uuid}`} type="file" multiple accept="application/pdf,image/*" onChange={(event) => { void addFiles(visitKey, event.target.files); event.currentTarget.value = ""; }} />
                  <label htmlFor={`document-upload-file-${visit.uuid}`} className="p-button p-component p-button-outlined document-upload-file-button"><i className="pi pi-plus" /> Agregar documento</label>
                  <Button icon="pi pi-save" label="Guardar" disabled={!canSave(visitKey, visit) || save.isPending} loading={save.isPending} onClick={() => save.mutate({ visitKey, visit })} />
                </div>
                <ExistingFiles visit={visit} concepts={concepts.data ?? []} conceptsLoading={concepts.isLoading} conceptsError={concepts.isError} edits={existingEdits[visitKey] ?? {}} currentUserPersonUuid={currentUserPersonUuid} currentProviderUuid={provider?.uuid} onChange={(fileId, edit) => updateExistingFile(visitKey, fileId, edit)} onPreview={setPreview} />
                <FileTiles files={pending} concepts={concepts.data ?? []} defaultConcept={defaultConcept} conceptsLoading={concepts.isLoading} conceptsError={concepts.isError} onChange={(file) => updateFile(visitKey, file)} onRemove={(fileId) => removeFile(visitKey, fileId)} onPreview={setPreview} />
                {!visit.files.length && !pending.length && <p className="ipd-empty">Esta visita no tiene documentos cargados.</p>}
              </div>}
            </article>;
          })}
        </div>}
      </section>
    </div>}
    <Dialog header={previewHeader} visible={Boolean(preview)} modal draggable={false} resizable={false} className="document-upload-preview-dialog" onHide={() => setPreview(null)}>
      {preview?.mimeType?.includes("pdf") || preview?.url.toLocaleLowerCase().includes(".pdf")
        ? <iframe title={preview.title} src={preview.url} />
        : preview && <img src={preview.url} alt={preview.title} />}
    </Dialog>
  </AppShell>;
}

export default function DocumentUploadPage() {
  useDocumentUploadTranslations();
  const router = useRouter();
  const patientUuid = useLegacyDocumentUploadPatientUuid(router.asPath);
  const encounterType = configuredText(router.query.encounterType, "RADIOLOGY");
  const topLevelConcept = configuredText(router.query.topLevelConcept, "All Radiology orders");
  const defaultOption = typeof router.query.defaultOption === "string" ? router.query.defaultOption : undefined;
  const context = documentUploadContext(encounterType);
  const patientViewKey = `${patientUuid}:${context.mode}:${encounterType}:${topLevelConcept}:${defaultOption ?? ""}`;
  return <AuthGuard>{patientUuid ? <DocumentUploadPatient key={patientViewKey} patientUuid={patientUuid} encounterType={encounterType} topLevelConcept={topLevelConcept} defaultOption={defaultOption} context={context} /> : <DocumentUploadSearch encounterType={encounterType} topLevelConcept={topLevelConcept} defaultOption={defaultOption} context={context} />}</AuthGuard>;
}
