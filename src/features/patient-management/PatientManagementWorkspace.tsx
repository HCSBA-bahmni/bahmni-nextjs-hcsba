import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/router";
import { Button } from "primereact/button";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AuthGuard } from "@/features/auth/AuthGuard";
import { useAuth } from "@/features/auth/AuthContext";
import { MpiIdentityReviewDialog } from "@/features/registration/MpiIdentityReviewDialog";
import { ClinicalRecordsDialog } from "@/features/registration/ClinicalRecordsDialog";
import { IdentityTraceDialog } from "./IdentityTraceDialog";
import { prepareClinicalCase, prepareSeparationCase, consolidateCase, separateCase, type ClinicalCase } from "@/services/mpi/clinicalConsolidation";
import { reviewStatusLabels } from "@/features/registration/IdentityReviewStatus";
import { reviewName } from "@/features/registration/mpiIdentityComparison";
import { hasPrivilege } from "@/services/bahmni/auth";
import { getIdentityCapabilities, listIdentityReviews, prepareIdentityResolution, resolveIdentityCase, type IdentityCase } from "@/services/mpi/localIdentity";

export default function PatientManagementWorkspace() {
  const { user } = useAuth();
  const allowed = hasPrivilege(user, "Manage MPI Identity Reviews");
  const router = useRouter();
  const client = useQueryClient();
  const [pageIndex, setPageIndex] = useState(0);
  const cases = useQuery({ queryKey: ["identity-reviews", "all", user?.uuid, pageIndex], queryFn: () => listIdentityReviews(undefined, pageIndex * 100), enabled: allowed, retry: false });
  const capabilities = useQuery({ queryKey: ["mpi-identity-capabilities", user?.uuid], queryFn: getIdentityCapabilities, enabled: allowed, retry: false });
  const [active, setActive] = useState<IdentityCase>();
  const [selected, setSelected] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [clinical, setClinical] = useState<ClinicalCase>();
  const [trace, setTrace] = useState<IdentityCase>();
  const openClinical = async (id: string, separation: boolean, preferredUuid?: string) => {
    setBusy(true); setError(""); setMessage("");
    try { setClinical(await (separation ? prepareSeparationCase(id) : prepareClinicalCase(id, preferredUuid))); }
    catch(e) { setError(e instanceof Error ? e.message : "No fue posible consultar los antecedentes clínicos."); }
    finally { setBusy(false); }
  };
  const submitClinical = async (reason: string, assignments: Record<string,string>, splitIdentity: boolean) => {
    if(!clinical || busy) return;
    setBusy(true); setError("");
    try {
      const result = clinical.clinical.separation ? await separateCase(clinical,reason,assignments,splitIdentity) : await consolidateCase(clinical,reason);
      setMessage(result.status === "separated" ? "Fichas separadas. Se restituyeron los antecedentes a su origen y se verificó la asociación de identidad elegida."
        : "Consolidación verificada en OpenMRS y en el registro de identidad local. Ambas historias están disponibles en la ficha vigente. Se conserva el diario para una separación posterior.");
      setClinical(undefined);
      await client.invalidateQueries({queryKey:["identity-reviews"]});
      await client.invalidateQueries({queryKey:["patient"]});
    } catch(e) { setError(e instanceof Error ? e.message : "No fue posible completar la operación."); await client.invalidateQueries({queryKey:["identity-reviews"]}); }
    finally {setBusy(false);}
  };
  const open = async (id: string) => {
    setBusy(true); setError(""); setMessage("");
    try { setActive(await prepareIdentityResolution(id)); setSelected(""); setReason(""); }
    catch (e) { setError(e instanceof Error ? e.message : "No fue posible abrir la revisión."); }
    finally { setBusy(false); }
  };
  const resolve = async (decision: "same" | "different" | "defer") => {
    if (!active || busy) return;
    setBusy(true); setError("");
    try {
      const result = await resolveIdentityCase(active.id, { version: active.version, decision,
        selectedCrid: decision === "same" ? selected : undefined, reason });
      setMessage(result.status === "clinical-review" ? "Identidad revisada. Hay dos fichas: abra «Revisar consolidación» para comparar sus historias y elegir la ficha vigente."
        : result.status === "pending" ? "La revisión sigue pendiente y conserva la observación del gestor."
          : decision === "different" ? "Revisión finalizada. Se conservaron separados los registros y los documentos anteriores de la ficha."
            : "Identidad asociada correctamente. Se conservó la misma ficha y sus documentos anteriores.");
      setActive(undefined);
      await client.invalidateQueries({ queryKey: ["identity-reviews"] });
      await client.invalidateQueries({ queryKey: ["patient", active.patientUuid] });
    } catch (e) { setError(e instanceof Error ? e.message : "No fue posible resolver la revisión."); }
    finally { setBusy(false); }
  };
  const exact = active?.candidates?.filter(c => ["auto", "conflict"].includes(c.category)) || [];
  const selectedCandidate = active?.candidates?.find(c => c.crid === selected);
  const canConfirm = reason.trim().length >= 10 && (selected === "new" ? Boolean(active?.heldRun || !exact.length) : Boolean(selectedCandidate));
  const rows = (cases.data || []).filter(c => showAll || ["pending", "resolving", "clinical-review", "draft", "consolidating", "consolidated", "separating"].includes(c.status));
  return <AuthGuard><AppShell title="Gestión de pacientes">
    {!allowed ? <section className="panel" role="alert"><h2>Acceso reservado al gestor de identidad</h2><p>El perfil de admisión puede enviar alertas. La resolución requiere un permiso específico.</p></section> : <>
      <section className="panel identity-review-intro"><div><h2>Revisión de identidad y fichas clínicas</h2><p>Revise las posibles coincidencias, unifique las fichas que correspondan a una misma persona o revise una separación.</p></div>
        <div className="actions"><Button label="Actualizar bandeja" outlined icon="pi pi-refresh" loading={cases.isFetching} onClick={() => void cases.refetch()} /><Button label={showAll ? "Ver pendientes" : "Ver también finalizadas"} text onClick={() => { setShowAll(!showAll); setPageIndex(0); }} /></div></section>
      {message && <p className="success-banner" role="status">{message}</p>}
      {error && !active && !clinical && <p className="error-banner" role="alert">{error}</p>}
      {(cases.isError || capabilities.isError) && <p className="error-banner" role="alert">No fue posible cargar la bandeja. Actualice para volver a consultar.</p>}
      {cases.isLoading && <p role="status">Cargando revisiones…</p>}
      {!cases.isLoading && !cases.isError && !rows.length && <section className="panel"><p>{pageIndex ? "No hay más revisiones pendientes en esta página." : "No hay revisiones pendientes."}</p></section>}
      <div className="identity-review-list">{rows.map(row => { const name = reviewName(row.patient); return <article className="panel identity-review-card" key={row.id}>
        <header><div><span className={`identity-state ${["resolved","consolidated","separated"].includes(row.status) ? "identity-state-complete" : ""}`}>{reviewStatusLabels[row.status] || row.status}</span><h2>{name.given} {name.family}</h2><p>{row.clinicalNumber ? `Ficha ${row.clinicalNumber}` : "Ficha por completar"}{row.heldRun ? ` · RUN ${["resolved","consolidated","separated"].includes(row.status) ? "revisado" : "propuesto"} ${row.heldRun}` : ""}</p></div>
          {["clinical-review","consolidating","consolidated","separating"].includes(row.status)
            ? <Button label={row.status === "consolidated" ? "Revisar separación" : row.status === "separating" ? "Recuperar separación" : row.status === "consolidating" ? "Recuperar consolidación" : "Revisar consolidación"}
              icon={row.status === "consolidated" ? "pi pi-clone" : "pi pi-link"} outlined={row.status === "consolidated"} disabled={busy} onClick={()=>void openClinical(row.id,["consolidated","separating"].includes(row.status))}/>
            : <Button label={row.status === "resolving" ? "Revisar y recuperar" : "Revisar antecedentes"} icon="pi pi-search" disabled={busy || !["pending", "resolving"].includes(row.status) || !capabilities.data} onClick={() => void open(row.id)} />}</header>
        <p><strong>Observación de admisión:</strong> {row.reason}</p><small>Enviado por {row.requestedBy} · {new Date(row.createdAt).toLocaleString("es-CL")}</small>
        {row.resolution && <p><strong>Decisión de identidad registrada:</strong> {row.resolution.reason} · {row.resolution.actor}</p>}
        <Button label="Ver historial" icon="pi pi-history" outlined onClick={() => setTrace(row)} />
      </article>; })}</div>
      {(pageIndex > 0 || (cases.data?.length || 0) === 100) && <nav className="actions" aria-label="Páginas de revisiones"><Button label="Página anterior" outlined disabled={!pageIndex || cases.isFetching} onClick={() => setPageIndex(pageIndex - 1)} /><span>Página {pageIndex + 1}</span><Button label="Página siguiente" outlined disabled={(cases.data?.length || 0) < 100 || cases.isFetching} onClick={() => setPageIndex(pageIndex + 1)} /></nav>}
      <MpiIdentityReviewDialog mode="resolution" busy={busy} error={error} pending={active && capabilities.data ? {
        result: { token: active.token || "", candidates: active.candidates || [], provider: "opencr" }, patient: active.patient,
        patientUuid: active.patientUuid, clinicalNumber: active.clinicalNumber, addedRun: active.heldRun, requestReason: active.reason, mapping: capabilities.data.identifierMap,
      } : undefined} selected={selected} reason={reason} canConfirm={canConfirm} allowRejectRun={Boolean(active?.heldRun)}
        onSelect={setSelected} onReason={setReason} onCancel={() => { if (!busy) { setActive(undefined); setError(""); } }}
        onConfirm={() => void resolve(selected === "new" ? "different" : "same")} onDefer={() => void resolve("defer")}
        onOpenExisting={uuid => void router.push(`/registration/patient/${encodeURIComponent(uuid)}`)} />
      <ClinicalRecordsDialog key={clinical?.clinical.operationId || "closed"} row={clinical} busy={busy} error={error}
        onCancel={()=>{if(!busy){setClinical(undefined);setError("");}}}
        onChangePreferred={uuid=>{if(clinical)void openClinical(clinical.id,Boolean(clinical.clinical.separation),uuid);}}
        onSubmit={(reason,assignments,splitIdentity)=>void submitClinical(reason,assignments,splitIdentity)}/>
      <IdentityTraceDialog row={trace} onHide={() => setTrace(undefined)} />
    </>}
  </AppShell></AuthGuard>;
}
