import { Dialog } from "primereact/dialog";
import type { PabellonItem } from "@/services/bahmni/pabellon";
import { ClinicalBlock, ClinicalField } from "./PabellonClinicalBlock";
import styles from "./PabellonProtocols.module.css";
import { formatPabellonDateTime } from "./pabellonDates";
export function PabellonNewbornsDialog({ item, onHide }: { item: PabellonItem; onHide(): void }) {
  const registry = item.newborns; if (!registry) return null;
  const patient = item.request?.patientAtRegistration;
  return <Dialog draggable={false} visible modal blockScroll maximizable className={styles.dialog} header="Registro de recién nacidos" onHide={onHide} style={{ width: "min(1100px, 95vw)", maxHeight: "94dvh" }}>
    <p role="note">Consulta del módulo de recién nacidos de Pabellón. No modifica la solicitud ni permite registrar o editar recién nacidos. Sin PDF en este flujo.</p>
    <ClinicalBlock title="Información de la madre / paciente" icon="pi-user"><dl className={styles.grid}>
      <ClinicalField title="N° solicitud">{item.request?.requestNumber}</ClinicalField>
      <ClinicalField title="Nombre según snapshot de solicitud">{[patient?.givenNames, patient?.familyName, patient?.secondFamilyName].filter(Boolean).join(" ")}</ClinicalField>
      <ClinicalField title="Diagnóstico según snapshot">{item.request?.diagnosis}</ClinicalField>
    </dl></ClinicalBlock>
    {registry.records.length === 0 ? <p role="status">No hay registros de recién nacidos para esta cirugía.</p> : registry.records.map((rn, index) => <ClinicalBlock key={rn.id} title={"Recién nacido " + (index + 1)} icon="pi-user"><dl className={styles.grid}>
      <ClinicalField title="Condición de salida">{rn.alive ? "Vivo(a)" : "Fallecido(a)"}</ClinicalField>
      <ClinicalField title="Fecha y hora de nacimiento (registro original)">{formatPabellonDateTime(rn.bornAt)}</ClinicalField><ClinicalField title="Sexo">{rn.sex}</ClinicalField>
      <ClinicalField title="Peso RN (gramos)">{String(rn.weightGrams)}</ClinicalField><ClinicalField title="Talla RN (cm)">{String(rn.heightCM)}</ClinicalField>
      <ClinicalField title="APGAR minuto 1">{String(rn.apgar1)}</ClinicalField><ClinicalField title="APGAR minuto 5">{String(rn.apgar5)}</ClinicalField>
      {rn.apgar10 !== null && <ClinicalField title="APGAR minuto 10">{String(rn.apgar10)}</ClinicalField>}
      <ClinicalField title="Estudio placenta">{rn.placentaStudy ? "Sí" : "No"}</ClinicalField>
      {rn.placentaWeight !== null && <ClinicalField title="Peso placenta (gramos)">{String(rn.placentaWeight)}</ClinicalField>}
      {rn.observation && <ClinicalField title="Observación">{rn.observation}</ClinicalField>}
    </dl></ClinicalBlock>)}
  </Dialog>;
}
