import { InputTextarea } from "primereact/inputtextarea";
import { useTranslation } from "react-i18next";
import { useConsultation } from "../ConsultationContext";
import { consultationPadDiagnoses, consultationPadHasContent, consultationPadObservations, type ConsultationPadObservation } from "../summaryPad";
import { displayName } from "./shared";

function observationValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(observationValue).filter(Boolean).join(", ");
  if (value && typeof value === "object") return displayName(value) || JSON.stringify(value);
  if (typeof value === "boolean") return value ? "Sí" : "No";
  return String(value ?? "");
}

function groupObservations(observations: ConsultationPadObservation[]): Array<[string, ConsultationPadObservation[]]> {
  const groups = new Map<string, ConsultationPadObservation[]>();
  observations.forEach((observation) => groups.set(observation.group, [...(groups.get(observation.group) ?? []), observation]));
  return [...groups.entries()];
}

export function SummaryBoard() {
  const { draft, updateDraft } = useConsultation();
  const { t } = useTranslation();
  const diagnoses = consultationPadDiagnoses(draft);
  const observations = consultationPadObservations(draft);
  const treatments = draft.drugOrders.filter((order) => order.action !== "DISCONTINUE" && !order.dateStopped);
  const hasContent = consultationPadHasContent(draft);
  const notesLabel = t("CONSULTATION_TAB_CONSULTATION_NOTES_LABEL", { defaultValue: "Notas de Consulta" });

  return <div className="consultation-board-stack">
    {!hasContent && <p className="consultation-pad-empty">{t("CONSULTATION_PAD_EMPTY_MESSAGE", { defaultValue: "Pad de Consulta vacío" })}</p>}

    {diagnoses.length > 0 && <section className="consultation-subsection consultation-pad-section">
      <h2>{t("CONSULTATION_TAB_DIAGNOSES_HEADER_LABEL", { defaultValue: "Diagnóstico" })}</h2>
      <div className="consultation-pad-list">{diagnoses.map((diagnosis) => <article key={diagnosis.clientId}>
        <strong>{diagnosis.codedAnswer ? displayName(diagnosis.codedAnswer) : diagnosis.freeTextAnswer}</strong>
        <span>{diagnosis.certainty} · {diagnosis.order}</span>
        {diagnosis.comments && <p>{diagnosis.comments}</p>}
      </article>)}</div>
    </section>}

    {observations.length > 0 && <section className="consultation-subsection consultation-pad-section">
      <h2>{t("CONSULTATION_TAB_OBSERVATIONS_HEADER_LABEL", { defaultValue: "Observaciones" })}</h2>
      <div className="consultation-observation-groups">{groupObservations(observations).map(([group, members]) => <article key={group}>
        <h3>{group}</h3>
        <dl>{members.map((observation) => <div key={observation.key}>
          <dt>{observation.label}</dt><dd>{observationValue(observation.value)}</dd>
          {observation.comment && <dd className="consultation-observation-comment">{observation.comment}</dd>}
        </div>)}</dl>
      </article>)}</div>
    </section>}

    {draft.disposition?.code && !draft.disposition.voided && <section className="consultation-subsection consultation-pad-section">
      <h2>{t("CONSULTATION_TAB_DISPOSITION_HEADER_LABEL", { defaultValue: "Disposición" })}</h2>
      <p><strong>{draft.disposition.conceptName ?? draft.disposition.code}</strong></p>
      {draft.disposition.additionalObs.map((observation, index) => observation.value ? <p key={String(observation.uuid ?? index)}>{String(observation.value)}</p> : null)}
    </section>}

    {treatments.length > 0 && <section className="consultation-subsection consultation-pad-section">
      <h2>{t("CONSULTATION_TAB_TREATMENT_HEADER_LABEL", { defaultValue: "Tratamiento" })}</h2>
      <div className="consultation-pad-list">{treatments.map((item) => <article key={item.clientId}>
        <strong>{item.drugName ?? item.drugNonCoded ?? displayName(item.drug)}</strong>
        <span>{[item.dose, item.doseUnits, item.frequency].filter((value) => value !== undefined && value !== null && value !== "").join(" · ")}</span>
      </article>)}</div>
    </section>}

    <section className="consultation-subsection consultation-notes-section">
      <h2>{notesLabel}</h2>
      <InputTextarea id="consultation-note" aria-label={notesLabel} placeholder={t("CLINICAL_ENTER_NOTES_PLACEHOLDER", { defaultValue: "Introduzca las notas aquí" })} rows={6} autoResize value={draft.consultationNote ?? ""} onChange={(event) => updateDraft((current) => ({ ...current, consultationNote: event.target.value }), "summary")} />
    </section>
  </div>;
}
