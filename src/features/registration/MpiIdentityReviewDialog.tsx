import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { InputTextarea } from "primereact/inputtextarea";
import type { IdentityCapabilities, IdentityMatch, IdentityPatient } from "@/services/mpi/localIdentity";
import { comparisonState, documentOverlap, reviewDate, reviewDocuments, reviewName, type ReviewDocument } from "./mpiIdentityComparison";
import styles from "./MpiIdentityReviewDialog.module.css";
import { useIssuerCountries } from "./useIssuerCountries";

export interface PendingIdentityReview {
  result: IdentityMatch;
  patient: IdentityPatient;
  mapping: IdentityCapabilities["identifierMap"];
  patientUuid?: string;
  clinicalNumber?: string;
  addedRun?: string;
  requestReason?: string;
}
interface Props {
  mode?: "admission" | "resolution";
  busy?: boolean;
  error?: string;
  allowRejectRun?: boolean;
  onDefer?: () => void;
  pending?: PendingIdentityReview;
  selected: string;
  reason: string;
  canConfirm: boolean;
  onSelect: (value: string) => void;
  onReason: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  onOpenExisting: (uuid: string) => void;
}
const genderLabel = (value?: string) => ({ male: "Masculino", female: "Femenino", other: "Otro", unknown: "Desconocido" }[value || ""] || value || "No informado");
const stateLabel = { same: "Igual", different: "Diferente", unknown: "Sin dato para comparar" };

function Documents({ documents, countries, empty = "Sin documentos visibles en esta respuesta" }: { documents: ReviewDocument[]; countries: { code: string; label: string }[]; empty?: string }) {
  return documents.length ? <ul className={styles.documents}>{documents.map(doc => <li key={doc.key}>
    <strong>{doc.label}: {doc.value}</strong>
    {doc.country && doc.code !== "01" && <span>País emisor: {countries.find(c => c.code === doc.country)?.label || doc.country}</span>}
  </li>)}</ul> : <span className={styles.muted}>{empty}</span>;
}

export function MpiIdentityReviewDialog({ pending, selected, reason, canConfirm, onSelect, onReason, onCancel, onConfirm, onOpenExisting, mode = "resolution", busy = false, error, allowRejectRun, onDefer }: Props) {
  const admission = mode === "admission";
  const countries = useIssuerCountries(Boolean(pending));
  const exact = pending?.result.candidates.filter(c => ["auto", "conflict"].includes(c.category)) || [];
  const documents = pending ? reviewDocuments(pending.patient, pending.mapping) : [];
  const enteredName = pending ? reviewName(pending.patient) : { given: "", family: "" };
  const chosen = pending?.result.candidates.find(c => c.crid === selected);
  const selectedName = chosen ? reviewName(chosen.patient) : undefined;
  const consequence = admission ? `La ficha se guardará con una alerta pendiente. Un gestor revisará los antecedentes antes de asociar identidades.${pending?.addedRun ? " El RUN nuevo quedará como propuesta; el documento anterior se conservará." : ""}` : selected === "new"
    ? allowRejectRun ? "Se descartará el RUN propuesto. La ficha y sus documentos anteriores se conservarán."
      : pending?.patientUuid ? "Se conservará esta ficha y sus documentos, sin asociarla a los otros candidatos." : "Se creará una ficha para una identidad nueva. Los candidatos no se asociarán a ella."
    : chosen ? pending?.patientUuid
      ? `Se asociará esta misma ficha${pending.clinicalNumber ? ` ${pending.clinicalNumber}` : ""} a la identidad seleccionada: ${selectedName?.given} ${selectedName?.family}. Se conservarán sus documentos previos.`
      : `Se registrará la ficha asociada a la identidad seleccionada: ${selectedName?.given} ${selectedName?.family}.`
    : "Seleccione una identidad o revise las alternativas antes de guardar.";
  return <Dialog header={admission ? "Enviar identidad a revisión" : "Resolver revisión de identidad"} visible={Boolean(pending)} modal draggable={false}
    closable={!busy} onHide={() => !busy && onCancel()} className={styles.dialog} footer={<div className={styles.footer}>
      <span>{admission ? "El gestor resolverá la asociación. No se unirán fichas desde este ingreso." : canConfirm ? "Decisión lista para guardar" : "Seleccione una opción y describa la evidencia (mínimo 10 caracteres)."}</span>
      <div><Button type="button" outlined label="Cancelar" disabled={busy} onClick={onCancel} />
        {onDefer && <Button type="button" outlined label="Mantener pendiente" disabled={busy || reason.trim().length < 10} onClick={onDefer} />}
        <Button type="button" label={admission ? "Guardar y enviar a revisión" : "Guardar resolución"} loading={busy} disabled={!canConfirm || busy} onClick={onConfirm} /></div>
    </div>}>
    <div className={styles.content}>
      <section className={styles.context} aria-label="Qué se está verificando">
        <i className="pi pi-id-card" aria-hidden="true" />
        <div><h2>{pending?.addedRun ? `Estás incorporando el RUN ${pending.addedRun}` : "Verifica a quién pertenecen estos datos"}</h2>
          <p>{pending?.patientUuid
            ? `En la ficha existente${pending.clinicalNumber ? ` ${pending.clinicalNumber}` : ""} de ${enteredName.given} ${enteredName.family}.`
            : `Antes de crear la ficha de ${enteredName.given} ${enteredName.family}.`}
            {pending?.addedRun && " El documento anterior debe mantenerse en la misma ficha."}</p>
          <Documents documents={documents} countries={countries} empty="No ingresaste un documento de identidad." /></div>
      </section>
      {!admission && pending?.requestReason && <p className={styles.guide}><strong>Observación de admisión:</strong> {pending.requestReason}</p>}
      <p className={styles.guide}><strong>Compara los documentos y los datos de la persona.</strong> {admission ? "Describe las diferencias para que un gestor las revise. No necesitas decidir si es la misma persona." : "Tu resolución determina la asociación. Una semejanza en el nombre no basta para confirmar."}</p>
      {error && <div className={styles.alert} role="alert">{error}</div>}
      {exact.length > 1 && <div className={styles.alert} role="alert"><strong>El documento aparece asociado a más de una persona.</strong> {admission ? "Deja la observación y envía los antecedentes al gestor." : "Mantenga el caso pendiente para revisar el conflicto de documentos."}</div>}
      <section aria-label="Coincidencias encontradas en el MPI local" className={styles.candidates}>
        <h2>{pending?.result.candidates.length || 0} {pending?.result.candidates.length === 1 ? "posible coincidencia" : "posibles coincidencias"}</h2>
        {pending?.result.candidates.map((candidate, index) => {
          const foundName = reviewName(candidate.patient);
          const foundDocuments = reviewDocuments(candidate.patient, pending.mapping);
          const shared = documentOverlap(documents, foundDocuments);
          const rows = [
            { label: "Nombres", left: enteredName.given, right: foundName.given },
            { label: "Apellidos", left: enteredName.family, right: foundName.family },
            { label: "Fecha de nacimiento", left: pending.patient.birthDate, right: candidate.patient.birthDate, date: true },
            { label: "Género registrado", left: pending.patient.gender, right: candidate.patient.gender, gender: true },
          ];
          const documentary = shared.length > 0;
          const exactCandidate = ["auto", "conflict"].includes(candidate.category);
          const blockedByExact = exact.length > 0 && !(exact.length === 1 && exact[0]?.crid === candidate.crid);
          const otherChart = candidate.clinicalConflict || (candidate.localPatientUuid && candidate.localPatientUuid !== pending.patientUuid);
          return <article key={candidate.crid} className={`${styles.candidate} ${selected === candidate.crid ? styles.selected : ""}`} aria-label={`Candidato ${index + 1}: ${foundName.given} ${foundName.family}`}>
            <header className={styles.candidateHeader}><div><span className={styles.kicker}>Candidato {index + 1}</span><h3>{foundName.given} {foundName.family}</h3></div>
              <span className={`${styles.badge} ${documentary ? styles.documentary : styles.possible}`}><i className={`pi ${documentary ? "pi-id-card" : "pi-users"}`} aria-hidden="true" />
                {documentary ? "Mismo documento" : exactCandidate ? "Revisión necesaria" : "Datos parecidos"}</span></header>
            <div className={styles.why}><strong>¿Por qué aparece?</strong> {documentary
              ? <>El documento {shared.map(d => `${d.label} ${d.value}${d.code !== "01" && d.country ? ` (${countries.find(c => c.code === d.country)?.label || d.country})` : ""}`).join(", ")} coincide con lo que ingresaste. Coteja el documento presentado.</>
              : exactCandidate ? "El registro de identidad detectó una coincidencia que requiere revisión. Compare los datos y documentos disponibles."
              : "Se encontraron semejanzas en los datos de la persona. Es necesario cotejar los documentos para determinar si es la misma persona."}</div>
            <div role="table" aria-label={`Comparación con candidato ${index + 1}`} className={styles.comparison}>
              <div role="row" className={styles.comparisonHead}><span role="columnheader">Dato a revisar</span><span role="columnheader">Datos ingresados</span><span role="columnheader">Datos encontrados</span></div>
              <div role="row" className={styles.comparisonRow}><strong role="rowheader">Documentos</strong><div role="cell"><span className={styles.mobileLabel}>Ingresados</span><Documents documents={documents} countries={countries} /></div><div role="cell"><span className={styles.mobileLabel}>Encontrados</span><Documents documents={foundDocuments} countries={countries} />{documentary && <span className={styles.same}>{shared.every(d => d.code === "01") ? "RUN coincidente" : "Documento y país coinciden"}</span>}</div></div>
              {rows.map(row => {
                const state = comparisonState(row.left, row.right);
                const format = (v?: string) => row.date ? reviewDate(v) : row.gender ? genderLabel(v) : v || "No informado";
                return <div role="row" className={styles.comparisonRow} key={row.label}><strong role="rowheader">{row.label}</strong><div role="cell"><span className={styles.mobileLabel}>Ingresados</span>{format(row.left)}</div><div role="cell"><span className={styles.mobileLabel}>Encontrados</span>{format(row.right)}<span className={styles[state]}>{stateLabel[state]}</span></div></div>;
              })}
            </div>
            {candidate.clinicalConflict ? <p className={styles.alert} role="alert">Esta identidad tiene más de una ficha clínica vinculada. Solicite resolución de duplicados.</p>
              : candidate.localPatientUuid ? <div className={styles.existing}><p><strong>Esta identidad ya tiene una ficha clínica{candidate.clinicalNumber ? `: ${candidate.clinicalNumber}` : ""}.</strong> Ábrala para revisarla y evitar crear otra.</p><Button type="button" outlined label="Abrir ficha existente" icon="pi pi-folder-open" onClick={() => onOpenExisting(candidate.localPatientUuid!)} /></div>
              : null}
            {!admission && !otherChart && <label className={styles.choice}><input type="radio" name="mpi-identity-choice" value={candidate.crid} checked={selected === candidate.crid} disabled={blockedByExact} onChange={() => onSelect(candidate.crid)} /><span><strong>Confirmo que corresponde a esta persona</strong><small>{blockedByExact ? "Primero debe resolverse la coincidencia obligatoria del documento." : `He cotejado los documentos y los datos del candidato ${index + 1}.`}</small></span></label>}
            {!admission && <details className={styles.technical}><summary>Referencia para soporte</summary><code>CRID: {candidate.crid}</code></details>}
            {!admission && otherChart && <label className={styles.choice}><input type="radio" name="mpi-identity-choice" value={candidate.crid} checked={selected === candidate.crid} disabled={blockedByExact} onChange={() => onSelect(candidate.crid)} /><span><strong>Es la misma persona; requiere revisar sus fichas</strong><small>Se registrará la decisión para el procedimiento de unificación. Esta acción no fusiona historias clínicas.</small></span></label>}
          </article>;
        })}
        {!pending?.result.candidates.length && <p>No se encontraron otros candidatos. Confirme el cotejo del nuevo documento con la persona de esta ficha.</p>}
      </section>
      {!admission && (!exact.length || allowRejectRun) && <label className={`${styles.choice} ${styles.newIdentity}`}><input type="radio" name="mpi-identity-choice" value="new" checked={selected === "new"} onChange={() => onSelect("new")} /><span><strong>{allowRejectRun ? "El RUN propuesto no corresponde a este paciente" : pending?.patientUuid ? "Confirmo los documentos de esta misma ficha; no corresponde a los otros candidatos" : "Revisé los candidatos; corresponde una identidad nueva"}</strong><small>Seleccione esta opción solo después de revisar los documentos.</small></span></label>}
      {exact.length === 1 && <p className={styles.exactNotice}><i className="pi pi-info-circle" aria-hidden="true" /> {admission ? "Hay un documento coincidente. El gestor revisará las diferencias antes de asociar los registros." : "Esta coincidencia debe resolverse. Si falta evidencia, mantenga el caso pendiente."}</p>}
      <section className={styles.decision} aria-label="Efecto de la decisión"><h2>Al confirmar</h2><p role="status">{consequence}</p>
        <label htmlFor="mpi-review-reason">{admission ? "Observación para el gestor" : "Motivo y evidencia de la verificación"}</label>
        <InputTextarea id="mpi-review-reason" value={reason} maxLength={500} rows={2} autoResize onChange={e => onReason(e.target.value)} aria-describedby="mpi-reason-help" />
        <small id="mpi-reason-help">{admission ? "Indique qué documento presentó la persona y qué diferencia encontró." : "Indique los documentos cotejados y la evidencia de su decisión. La resolución quedará registrada."}</small>
      </section>
    </div>
  </Dialog>;
}
