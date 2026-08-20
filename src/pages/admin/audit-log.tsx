import Cookies from "js-cookie";
import { useMutation, useQuery } from "@tanstack/react-query";
import { DateTime } from "luxon";
import { Button } from "primereact/button";
import { Calendar } from "primereact/calendar";
import { InputText } from "primereact/inputtext";
import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/AppShell";
import { AuthGuard } from "@/features/auth/AuthGuard";
import { useAuth } from "@/features/auth/AuthContext";
import { auditLogIndexes, buildAuditLogRequest, displayEntriesForAction, isFutureAuditLogDay, type AuditLogAction, type AuditLogEntry, type AuditLogIndexes } from "@/features/admin/auditLog";
import { getAuditLogs } from "@/services/bahmni/adminAudit";
import { hasPrivilege } from "@/services/bahmni/auth";
import { loadTranslations } from "@/services/bahmni/config";

const emptyIndexes: AuditLogIndexes = { first: 0, last: 0 };

function startOfToday(): Date {
  const value = new Date();
  value.setHours(0, 0, 0, 0);
  return value;
}

function endOfToday(): Date {
  const value = new Date();
  value.setHours(23, 59, 59, 999);
  return value;
}

function formatAuditDate(value: string | number, locale: string): string {
  let date = typeof value === "number" ? DateTime.fromMillis(value) : DateTime.fromISO(value);
  if (!date.isValid && typeof value === "string") date = DateTime.fromSQL(value);
  return date.isValid ? date.setLocale(locale).toFormat("LLLL d, yyyy 'at' h:mm:ss a") : String(value);
}

export default function AuditLogPage() {
  const { user } = useAuth();
  const { i18n, t } = useTranslation();
  const locale = Cookies.get("bahmni.locale") ?? i18n.resolvedLanguage ?? "es";
  const [initialStartFrom] = useState(startOfToday);
  const [startFrom, setStartFrom] = useState(initialStartFrom);
  const [username, setUsername] = useState("");
  const [patientId, setPatientId] = useState("");
  const [view, setView] = useState<{ logs: AuditLogEntry[]; indexes: AuditLogIndexes; noticeKey: string | null } | null>(null);
  const [validationKey, setValidationKey] = useState<string | null>(null);
  const allowed = hasPrivilege(user, "app:admin");

  const translations = useQuery({
    queryKey: ["translations", "admin", locale],
    queryFn: () => loadTranslations("admin", locale),
    enabled: allowed,
  });
  useEffect(() => {
    if (!translations.data) return;
    i18n.addResourceBundle(locale, "translation", translations.data, true, true);
    void i18n.changeLanguage(locale);
  }, [i18n, locale, translations.data]);

  const initial = useQuery({
    queryKey: ["admin-audit-log", "initial", initialStartFrom.toISOString()],
    queryFn: () => getAuditLogs(buildAuditLogRequest({ startFrom: initialStartFrom }, "initial")),
    enabled: allowed,
  });
  const initialLogs = displayEntriesForAction(initial.data ?? [], "initial");
  const logs = view?.logs ?? initialLogs;
  const indexes = view?.indexes ?? auditLogIndexes(initialLogs, emptyIndexes);
  const noticeKey = view?.noticeKey ?? (initial.data && initialLogs.length === 0 ? "NO_EVENTS_FOUND" : null);

  const pageRequest = useMutation({ mutationFn: getAuditLogs });

  async function load(action: Exclude<AuditLogAction, "initial" | "default">) {
    setValidationKey(null);
    if (isFutureAuditLogDay(startFrom)) {
      setValidationKey("INVALID_DATE");
      return;
    }
    const effectiveAction: AuditLogAction = action === "previous" && indexes.first === 0 && indexes.last === 0 ? "default" : action;
    const filters = { startFrom, username, patientId };
    try {
      const response = await pageRequest.mutateAsync(buildAuditLogRequest(filters, effectiveAction, indexes));
      const displayed = displayEntriesForAction(response, effectiveAction);
      if (action === "filter") {
        setView({ logs: displayed, indexes: auditLogIndexes(displayed), noticeKey: displayed.length === 0 ? "MATCHING_EVENTS_NOT_FOUND" : null });
      } else if (displayed.length > 0) {
        setView({ logs: displayed, indexes: auditLogIndexes(displayed, indexes), noticeKey: null });
      } else {
        setView({ logs, indexes, noticeKey: "NO_MORE_EVENTS_FOUND" });
      }
    } catch { /* React Query exposes the request error in the result panel. */ }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void load("filter");
  }

  const requestFailed = initial.isError || translations.isError || pageRequest.isError;
  const busy = initial.isLoading || pageRequest.isPending;
  const label = (key: string, fallback: string) => String(t(key, { defaultValue: fallback }));
  const message = (entry: AuditLogEntry) => String(t(entry.messageKey, { ...entry, params: entry.params, defaultValue: entry.messageKey }));

  return <AuthGuard><AppShell title={label("ADMIN_APP_HEADER", "Administración")}>
    {!allowed && <p role="alert" className="error-banner">No tiene el privilegio app:admin requerido por el módulo de Administración.</p>}
    {allowed && <main className="audit-log-page">
      <section className="panel audit-log-hero">
        <div className="audit-log-heading"><span className="audit-log-icon"><i className="pi pi-eye" aria-hidden="true" /></span><div><p className="audit-log-eyebrow">{label("ADMIN_APP_HEADER", "Administración")}</p><h2>Registro de auditoría</h2><p>Consulta de eventos registrados por Bahmni.</p></div></div>
        <a className="audit-log-back" href="/bahmni/admin"><i className="pi pi-arrow-left" aria-hidden="true" /> Panel de Administración</a>
      </section>

      <section className="panel audit-log-filters" aria-labelledby="audit-log-filters-title">
        <h3 id="audit-log-filters-title">{label("FILTERS_HEADER_LABEL", "Filtros")}</h3>
        <form onSubmit={submit}>
          <label><span>{label("START_FROM_FILTER_LABEL", "Desde")}</span><Calendar value={startFrom} onChange={(event) => event.value instanceof Date && setStartFrom(event.value)} maxDate={endOfToday()} showTime hourFormat="24" showIcon dateFormat="dd/mm/yy" aria-label={label("START_FROM_FILTER_LABEL", "Desde")} /></label>
          <label><span>{label("USERNAME_FILTER_LABEL", "Nombre de usuario")}</span><InputText value={username} onChange={(event) => setUsername(event.target.value)} placeholder={label("USERNAME_FILTER_PLACEHOLDER", "Nombre de usuario")} /></label>
          <label><span>{label("PATIENT_ID_FILTER_LABEL", "ID del paciente")}</span><InputText value={patientId} onChange={(event) => setPatientId(event.target.value)} placeholder={label("PATIENT_ID_FILTER_PLACEHOLDER", "ID del paciente")} /></label>
          <Button type="submit" icon="pi pi-filter" label={label("FILTER_BUTTON_LABEL", "Filtrar")} loading={pageRequest.isPending} />
        </form>
        {validationKey && <p role="alert" className="audit-log-notice audit-log-warning">{label(validationKey, "La fecha no puede estar en el futuro.")}</p>}
      </section>

      <section className="panel audit-log-results" aria-labelledby="audit-log-results-title">
        <header><div><h3 id="audit-log-results-title">Registro de auditoría</h3><span>{logs.length} eventos en esta página</span></div></header>
        {busy && <p role="status" className="audit-log-loading"><i className="pi pi-spin pi-spinner" aria-hidden="true" /> Cargando eventos…</p>}
        {requestFailed && <p role="alert" className="error-banner">No fue posible consultar el registro de auditoría de Bahmni.</p>}
        {noticeKey && <p role="status" className="audit-log-notice">{label(noticeKey, noticeKey)}</p>}
        {!busy && logs.length > 0 && <div className="audit-log-table-wrap"><table>
          <thead><tr><th>{label("EVENT_ID", "ID del Evento")}</th><th>{label("CREATED_AT", "Creado En")}</th><th>{label("EVENT_TYPE", "Tipo de Evento")}</th><th>{label("USERNAME", "Nombre de usuario")}</th><th>{label("PATIENT_ID", "ID del Paciente")}</th><th>{label("MESSAGE", "Mensaje")}</th><th>{label("MODULE", "Módulo")}</th></tr></thead>
          <tbody>{logs.map((entry) => <tr key={entry.uuid ?? entry.auditLogId}><td><strong>#{entry.auditLogId}</strong></td><td>{formatAuditDate(entry.dateCreated, locale)}</td><td><span className="audit-log-event">{label(entry.eventType, entry.eventType)}</span></td><td>{entry.userId || "—"}</td><td>{entry.patientId || "—"}</td><td className="audit-log-message">{message(entry)}</td><td>{label(entry.module, entry.module) || "—"}</td></tr>)}</tbody>
        </table></div>}
        <footer className="audit-log-pagination">
          <Button type="button" outlined icon="pi pi-arrow-left" aria-label="Eventos anteriores" tooltip="Eventos anteriores" tooltipOptions={{ position: "top" }} onClick={() => void load("previous")} disabled={busy} />
          <span>IDs {indexes.first || "—"} a {indexes.last || "—"}</span>
          <Button type="button" outlined icon="pi pi-arrow-right" aria-label="Eventos siguientes" tooltip="Eventos siguientes" tooltipOptions={{ position: "top" }} onClick={() => void load("next")} disabled={busy} />
        </footer>
      </section>
    </main>}
  </AppShell></AuthGuard>;
}
