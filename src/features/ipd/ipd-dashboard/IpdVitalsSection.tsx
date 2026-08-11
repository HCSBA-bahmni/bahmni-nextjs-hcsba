import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { IpdDashboardConfig } from "@/config-compat/ipdDashboardConfig";
import { getDiseaseSummaryData } from "@/services/bahmni/dashboard";

interface Props {
  patientUuid: string;
  config: IpdDashboardConfig["vitalsConfig"];
  locale: string;
  timeZone: string;
}

type JsonRecord = Record<string, unknown>;
const record = (value: unknown): JsonRecord => value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
const records = (value: unknown): JsonRecord[] => Array.isArray(value) ? value.map(record) : [];
const text = (value: unknown): string => value === undefined || value === null || value === "" ? "—" : String(value);

function conceptMap(root: JsonRecord, configured: Record<string, string>) {
  const details = records(root.conceptDetails);
  return Object.fromEntries(Object.entries(configured).map(([key, fullName]) => {
    const detail = details.find((candidate) => String(candidate.fullName ?? "").toLocaleLowerCase() === fullName.toLocaleLowerCase());
    return [key, { name: String(detail?.name ?? fullName), unit: String(detail?.units ?? "") }];
  }));
}

function cell(row: JsonRecord, concept?: { name: string; unit: string }) {
  const value = concept ? record(row[concept.name]) : {};
  return { value: text(value.value ?? value.valueAsString), abnormal: value.abnormal === true, unit: concept?.unit ?? "" };
}

function formattedDate(value: string, locale: string, timeZone: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone }).format(date);
}

export function IpdVitalsSection({ patientUuid, config, locale, timeZone }: Props) {
  const latestNames = Object.values(config.latestVitalsConceptValues);
  const historyNames = Object.values(config.vitalsHistoryConceptValues);
  const latest = useQuery({
    queryKey: ["ipd", "patient-dashboard", "vitals", "latest", patientUuid, latestNames],
    queryFn: () => getDiseaseSummaryData({ patientUuid, config: { latestCount: 1, obsConcepts: latestNames } }),
  });
  const history = useQuery({
    queryKey: ["ipd", "patient-dashboard", "vitals", "history", patientUuid, historyNames],
    queryFn: () => getDiseaseSummaryData({ patientUuid, config: { groupBy: "obstime", obsConcepts: historyNames } }),
  });
  const model = useMemo(() => {
    const latestRoot = record(latest.data);
    const historyRoot = record(history.data);
    const concepts = conceptMap({
      conceptDetails: [...records(latestRoot.conceptDetails), ...records(historyRoot.conceptDetails)],
    }, { ...config.latestVitalsConceptValues, ...config.vitalsHistoryConceptValues });
    const latestRows = record(latestRoot.tabularData);
    const historyRows = record(historyRoot.tabularData);
    const latestKey = Object.keys(latestRows).sort().at(-1);
    const latestRow = latestKey ? record(latestRows[latestKey]) : {};
    return { concepts, latestKey, latestRow, historyRows: Object.entries(historyRows).sort(([left], [right]) => right.localeCompare(left)) };
  }, [config.latestVitalsConceptValues, config.vitalsHistoryConceptValues, history.data, latest.data]);
  const loading = latest.isLoading || history.isLoading;
  const error = latest.error ?? history.error;
  if (loading) return <p role="status" className="muted-text">Cargando signos vitales…</p>;
  if (error) return <div className="error-banner" role="alert">No fue posible cargar los signos vitales. <button type="button" onClick={() => { void latest.refetch(); void history.refetch(); }}>Reintentar</button></div>;
  if (!model.latestKey) return <p className="muted-text">Sin datos registrados.</p>;

  const latestValues = [
    ["Pulso", "pulse"], ["Saturación O2", "spO2"], ["Frec. respiratoria", "respiratoryRate"], ["Temperatura", "temperature"],
    ["TA", "bloodPressure"], ["Altura", "height"], ["Peso", "weight"], ["IMC", "bmi"],
  ] as const;
  const reading = (key: string, row = model.latestRow) => cell(row, model.concepts[key]);
  const bloodPressure = (row = model.latestRow) => {
    const systolic = reading("systolicPressure", row); const diastolic = reading("diastolicPressure", row);
    return { value: systolic.value === "—" && diastolic.value === "—" ? "—" : `${systolic.value}/${diastolic.value}`, unit: systolic.unit, abnormal: systolic.abnormal || diastolic.abnormal };
  };
  return <div className="ipd-vitals">
    <div className="ipd-vitals-date">{formattedDate(model.latestKey, locale, timeZone)}</div>
    <div className="ipd-vitals-latest">{latestValues.map(([label, key]) => {
      const value = key === "bloodPressure" ? bloodPressure() : reading(key);
      return <article className={`ipd-vital-value${value.abnormal ? " abnormal" : ""}`} key={key}><small>{label}</small><strong>{value.value}</strong><span>{value.value !== "—" ? value.unit : ""}</span></article>;
    })}</div>
    <details className="ipd-vitals-history"><summary>Histórico de signos vitales</summary>
      <div className="ipd-legacy-table-scroll"><table className="ipd-legacy-table"><thead><tr><th>Fecha y hora</th><th>Pulso</th><th>SpO2</th><th>Frec. respiratoria</th><th>Temperatura</th><th>TA</th><th>Altura</th><th>Peso</th><th>IMC</th><th>MUAC</th></tr></thead>
        <tbody>{model.historyRows.map(([date, raw]) => { const row = record(raw); return <tr key={date}><th>{formattedDate(date, locale, timeZone)}</th>{["pulse", "spO2", "respiratoryRate", "temperature"].map((key) => { const value = reading(key, row); return <td className={value.abnormal ? "abnormal" : undefined} key={key}>{value.value}</td>; })}<td className={bloodPressure(row).abnormal ? "abnormal" : undefined}>{bloodPressure(row).value}</td>{["height", "weight", "bmi", "muac"].map((key) => { const value = reading(key, row); return <td className={value.abnormal ? "abnormal" : undefined} key={key}>{value.value}</td>; })}</tr>; })}</tbody>
      </table></div>
    </details>
  </div>;
}
