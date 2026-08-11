import { useQuery } from "@tanstack/react-query";
import { Dropdown } from "primereact/dropdown";
import { InputTextarea } from "primereact/inputtextarea";
import { getDispositionConfiguration } from "@/services/bahmni/consultation";
import { getVisitSummary } from "@/services/bahmni/visits";
import { useConsultation } from "../ConsultationContext";
import { displayName, object, text } from "./shared";

const emrapiMappingSource = "org.openmrs.module.emrapi";

/** Mirrors DispostionActionMapper.getMappingCode from the legacy client. */
export function dispositionCode(value: Record<string, unknown>): string {
  const mappings = Array.isArray(value.mappings) ? value.mappings.map(object) : [];
  const emrapiMapping = mappings.find((mapping) => {
    const display = text(mapping.display);
    return display.slice(0, display.indexOf(":")).trim() === emrapiMappingSource;
  });
  const mappingDisplay = text(emrapiMapping?.display);
  const mappedCode = mappingDisplay.includes(":") ? mappingDisplay.slice(mappingDisplay.indexOf(":") + 1).trim() : "";
  return mappedCode || text(emrapiMapping?.code) || text(value.code) || displayName(value);
}

export function filterDispositionActions(actions: Record<string, unknown>[], visitSummary?: Record<string, unknown>, visitOpen = false): Record<string, unknown>[] {
  const defaults = ["UNDO_DISCHARGE", "ADMIT", "TRANSFER", "DISCHARGE"];
  const result = actions.filter((action) => !defaults.includes(dispositionCode(action)));
  const admission = object(visitSummary?.admissionDetails);
  const discharge = object(visitSummary?.dischargeDetails);
  const allowed = Object.keys(discharge).length > 0 && visitOpen
    ? ["UNDO_DISCHARGE"]
    : Object.keys(admission).length > 0 && visitOpen
      ? ["TRANSFER", "DISCHARGE"]
      : ["ADMIT"];
  const configuredDefaults = allowed.flatMap((code): Record<string, unknown>[] => {
    const action = actions.find((candidate) => dispositionCode(candidate) === code);
    return action ? [action] : [];
  });
  return [...result, ...configuredDefaults];
}

export function DispositionBoard() {
  const { context, draft, updateDraft } = useConsultation();
  const config = useQuery({ queryKey: ["consultation-dispositions"], queryFn: getDispositionConfiguration });
  const visitSummary = useQuery({ queryKey: ["consultation-visit-summary", context.visit?.uuid], queryFn: () => getVisitSummary(context.visit!.uuid), enabled: Boolean(context.visit?.uuid) });
  if (context.mode === "retrospective") return <p className="warning-banner">La disposición no está disponible en entradas retrospectivas, igual que en el sistema legacy.</p>;
  const actions = filterDispositionActions(config.data?.actions ?? [], visitSummary.data, Boolean(context.visit && !context.visit.stopDatetime));
  const note = draft.disposition?.additionalObs[0];
  const setCode = (code?: string) => updateDraft((current) => {
    if (!code) return { ...current, disposition: current.disposition ? { ...current.disposition, voided: true, voidReason: "Cancelled during encounter" } : undefined };
    const selected = actions.find((action) => dispositionCode(action) === code);
    return { ...current, disposition: { code, conceptName: selected ? displayName(selected) : code, dispositionDateTime: current.disposition?.dispositionDateTime, additionalObs: current.disposition?.additionalObs ?? [] } };
  }, "disposition");
  const setNote = (value: string) => updateDraft((current) => ({ ...current, disposition: { ...(current.disposition ?? { additionalObs: [] }), additionalObs: config.data?.noteConcept ? [{ ...(note ?? {}), concept: config.data.noteConcept, value, voided: !value }] : [] } }), "disposition");
  return <section className="consultation-subsection"><h2>Disposición</h2>
    {(config.isLoading || visitSummary.isLoading) && <p role="status">Cargando acciones…</p>}
    {(config.isError || visitSummary.isError) && <p role="alert" className="error-banner">No fue posible cargar completamente la configuración de disposición.</p>}
    <div className="field"><label>Acción</label><Dropdown value={draft.disposition?.voided ? null : draft.disposition?.code ?? null} options={actions.map((action) => ({ label: displayName(action), value: dispositionCode(action) }))} showClear placeholder="Seleccione una disposición" onChange={(event) => setCode(event.value as string | undefined)} /></div>
    {draft.disposition?.voided && note && <p className="warning-banner">La disposición anterior y su nota serán anuladas al guardar.</p>}
    <div className="field"><label>Nota de disposición</label><InputTextarea autoResize rows={5} value={text(note?.value)} onChange={(event) => setNote(event.target.value)} /></div>
  </section>;
}
