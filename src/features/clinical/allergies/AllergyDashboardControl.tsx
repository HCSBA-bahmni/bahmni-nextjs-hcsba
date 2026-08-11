import { useQuery } from "@tanstack/react-query";
import { Button } from "primereact/button";
import { Column } from "primereact/column";
import { DataTable, type DataTableExpandedRows } from "primereact/datatable";
import { Tag } from "primereact/tag";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { loadAppConfig } from "@/services/bahmni/config";
import { getPatientAllergies } from "@/services/bahmni/clinical";
import type { DashboardControlProps } from "../dashboardContext";
import { mapAllergyIntolerances, type AllergyDashboardRecord } from "./allergyRecords";

const severityLabels: Record<string, string> = { severe: "Grave", moderate: "Moderada", mild: "Leve" };
const severityStyles: Record<string, "danger" | "warning" | "success" | "secondary"> = { severe: "danger", moderate: "warning", mild: "success" };

function dateLabel(value: string | undefined, locale: string, timeZone: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone }).format(date);
}

function configuredAbnormalText(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const root = value as Record<string, unknown>;
  const config = root.config && typeof root.config === "object" && !Array.isArray(root.config) ? root.config as Record<string, unknown> : root;
  return config.showTextAsAbnormal === true;
}

export function AllergyDashboardControl(props: DashboardControlProps) {
  const { t } = useTranslation();
  const { patient, locale, timeZone } = props.context;
  const [expandedRows, setExpandedRows] = useState<DataTableExpandedRows>({});
  const query = useQuery({ queryKey: ["clinical-dashboard", "allergy", patient.uuid, props.context.visit?.uuid], queryFn: () => getPatientAllergies(patient.uuid) });
  const appConfig = useQuery({ queryKey: ["app-config", "clinical"], queryFn: () => loadAppConfig("clinical") });
  const records = useMemo(() => mapAllergyIntolerances(query.data ?? []), [query.data]);
  const legacyIpdColumns = props.section.dashboardConfig?.legacyIpdColumns === true;
  const showTextAsAbnormal = configuredAbnormalText(appConfig.data);
  useEffect(() => props.reportState({ settled: !query.isLoading && !query.error, empty: !query.isLoading && !query.error && records.length === 0 }), [props, query.error, query.isLoading, records.length]);

  if (query.isLoading) return <p role="status">Cargando…</p>;
  if (query.error) return <div role="alert" className="error-banner dashboard-control-error"><span>No fue posible cargar las alergias.</span><Button text label="Reintentar" icon="pi pi-refresh" onClick={() => void query.refetch()} /></div>;
  if (!records.length) return <p className="muted-text">Sin alergias registradas.</p>;

  const allergen = (item: AllergyDashboardRecord) => <span className="allergy-allergen"><strong>{item.allergen}</strong><small>{dateLabel(item.recordedDate, locale, timeZone)}</small>{item.comment && <Tag icon="pi pi-comment" value={t("COMMENTS", { defaultValue: "Comentario" })} severity="info" />}</span>;
  const reactions = (item: AllergyDashboardRecord) => item.reactions.length ? item.reactions.join(", ") : "—";
  const severity = (item: AllergyDashboardRecord) => {
    const value = item.severity.toLowerCase();
    return item.severity ? <Tag value={severityLabels[value] ?? item.severity} severity={severityStyles[value] ?? "secondary"} /> : "—";
  };
  const detail = (item: AllergyDashboardRecord) => <div className="allergy-detail">
    {item.comment && <section><strong><i className="pi pi-comment" /> {t("COMMENTS", { defaultValue: "Comentario" })}</strong><p>{item.comment}</p></section>}
    <dl>
      <div><dt>Registrado por</dt><dd>{item.provider || "—"}</dd></div>
      <div><dt>Fecha de registro</dt><dd>{dateLabel(item.recordedDate, locale, timeZone)}</dd></div>
      <div><dt>Estado clínico</dt><dd>{item.clinicalStatus || "—"}</dd></div>
      <div><dt>Criticidad FHIR</dt><dd>{item.criticality || "—"}</dd></div>
      <div><dt>Categoría</dt><dd>{item.category.join(", ") || "—"}</dd></div>
      <div><dt>Tipo</dt><dd>{item.type || "—"}</dd></div>
    </dl>
  </div>;
  const rowClassName = (item: AllergyDashboardRecord) => ({ "allergy-row-abnormal": showTextAsAbnormal || item.severity.toLowerCase() === "severe" });

  if (legacyIpdColumns) return <div className="ipd-legacy-table-scroll"><table className="ipd-legacy-table ipd-allergy-table">
    <thead><tr><th>Alérgeno</th><th>Severidad</th><th>Reacción</th><th>Comentarios</th><th>Profesional</th><th>Fecha</th></tr></thead>
    <tbody>{records.map((item) => <tr className={rowClassName(item)["allergy-row-abnormal"] ? "allergy-row-abnormal" : undefined} key={item.id}>
      <td><strong>{item.allergen}</strong></td>
      <td>{severity(item)}</td>
      <td>{reactions(item)}</td>
      <td>{item.comment || "—"}</td>
      <td>{item.provider || "—"}</td>
      <td>{dateLabel(item.recordedDate, locale, timeZone)}</td>
    </tr>)}</tbody>
  </table></div>;

  return <DataTable className="allergy-table" value={records} dataKey="id" expandedRows={expandedRows} onRowToggle={(event) => setExpandedRows(event.data as DataTableExpandedRows)} rowExpansionTemplate={detail} rowClassName={rowClassName} size="small" stripedRows>
    <Column expander style={{ width: "3rem" }} aria-label="Ver detalles" />
    <Column header={t("ALLERGEN", { defaultValue: "Alérgeno" })} body={allergen} />
    <Column header={t("REACTIONS", { defaultValue: "Reacciones" })} body={reactions} />
    <Column header={t("SEVERITY", { defaultValue: "Severidad" })} body={severity} />
  </DataTable>;
}
