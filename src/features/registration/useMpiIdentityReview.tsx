import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { IdentifierType } from "@/services/bahmni/metadata";
import type { PatientFormValues } from "@/types/bahmni";
import { lookupLocalPatientByRun, lookupMpiIdentityForAdmission, mpiAdmissionMode, runFromForm } from "@/services/mpi/admission";
import { getIdentityCapabilities, identityFromForm, listIdentityReviews, matchLocalIdentity, requestIdentityReview, type IdentityReview } from "@/services/mpi/localIdentity";

import { MpiIdentityReviewDialog, type PendingIdentityReview } from "./MpiIdentityReviewDialog";

export function useMpiIdentityReview(openExisting: (uuid: string) => void) {
  const capabilities = useQuery({ queryKey: ["mpi-identity-capabilities"], queryFn: getIdentityCapabilities,
    enabled: mpiAdmissionMode === "integrated", staleTime: 60_000, retry: false });
  const [pending, setPending] = useState<PendingIdentityReview>();
  const [selected, setSelected] = useState("");
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const resolver = useRef<((value: IdentityReview | null) => void) | undefined>(undefined);
  useEffect(() => () => resolver.current?.(null), []);
  const close = (review: IdentityReview | null) => { const resolve = resolver.current; resolver.current = undefined; setPending(undefined); resolve?.(review); };
  const prepare = async (values: PatientFormValues, types: IdentifierType[], patientUuid?: string, original?: Partial<PatientFormValues>): Promise<IdentityReview | null | undefined> => {
    if (mpiAdmissionMode !== "integrated") return undefined;
    if (capabilities.isError || !capabilities.data) throw new Error("No se pudo comprobar la configuración del MPI. Reintente antes de guardar.");
    if (!capabilities.data.enabled) return undefined;
    if (!capabilities.data.deferredReviews) throw new Error("El servicio de revisión de identidad no está disponible. Reintente antes de guardar.");
    if (patientUuid && original) {
      const active = (await listIdentityReviews(patientUuid)).find(c => ["pending", "resolving", "clinical-review"].includes(c.status));
      if (active) {
        const baseline = identityFromForm(original as PatientFormValues, types, capabilities.data.identifierMap);
        const proposed = identityFromForm(values, types, capabilities.data.identifierMap);
        if (JSON.stringify(baseline) !== JSON.stringify(proposed)) throw new Error("La identidad tiene una revisión pendiente. El gestor debe resolverla antes de cambiar los nombres, la fecha de nacimiento o los documentos. Puede actualizar los datos de contacto.");
        return undefined;
      }
    }
    const run = runFromForm(values, types);
    const oldRun = original ? runFromForm(original, types) : undefined;
    if (patientUuid && run && !oldRun) {
      const previousDocuments = (original?.additionalIdentifiers || []).filter(i => !i.voided && i.identifier);
      if (previousDocuments.some(old => !(values.additionalIdentifiers || []).some(i => !i.voided && i.identifierTypeUuid === old.identifierTypeUuid && i.identifier === old.identifier))) {
        throw new Error("Conserve los documentos previos al incorporar el RUN. Su retiro requiere una revisión separada.");
      }
      const local = await lookupLocalPatientByRun(run);
      // A RUN already assigned locally is a clinical duplication review, not a new
      // identity assertion. Keep it held in the proposal even if MINSAL is unavailable.
      if (!local.length) {
        const mpi = await lookupMpiIdentityForAdmission(run);
        if (mpi.stale || mpi.outcome === "ambiguous") throw new Error("El RUN requiere verificación vigente y sin ambigüedad antes de incorporarlo.");
      }
    }
    const patient = identityFromForm(values, types, capabilities.data.identifierMap);
    const result = await matchLocalIdentity(patient, patientUuid);
    if (result.alreadyReviewed) return undefined;
    if (!result.candidates.length && !(patientUuid && run && !oldRun)) return { token: result.token, patientUuid };
    setSelected(""); setReason(""); setSendError(""); setPending({ result, patientUuid, patient, mapping: capabilities.data.identifierMap, clinicalNumber: values.identifier,
      addedRun: patientUuid && run && !oldRun ? run : undefined });
    return new Promise(resolve => { resolver.current = resolve; });
  };
  const canConfirm = reason.trim().length >= 5 && !sending && !(!pending?.patientUuid && pending?.result.candidates.some(c => ["auto", "conflict"].includes(c.category) && c.localPatientUuid));
  const dialog = <MpiIdentityReviewDialog pending={pending} selected={selected} reason={reason} canConfirm={canConfirm} mode="admission" busy={sending} error={sendError}
    onSelect={setSelected} onReason={setReason} onCancel={() => close(null)}
    onOpenExisting={uuid => { close(null); openExisting(uuid); }}
    onConfirm={async () => {
      if (!pending || sending) return;
      setSending(true); setSendError("");
      try {
        const result = await requestIdentityReview(pending.patient, pending.patientUuid, pending.result.token, reason.trim());
        close({ caseId: result.id, patientUuid: pending.patientUuid, heldRun: result.heldRun });
      } catch (error) { setSendError(error instanceof Error ? error.message : "No fue posible enviar la revisión."); }
      finally { setSending(false); }
    }} />;
  return { enabled: capabilities.data?.enabled === true, prepare, dialog };
}
