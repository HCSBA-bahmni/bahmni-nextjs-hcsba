import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/AuthContext";
import { hasPrivilege } from "@/services/bahmni/auth";
import { listIdentityReviews } from "@/services/mpi/localIdentity";
import { mpiAdmissionMode } from "@/services/mpi/admission";

export const reviewStatusLabels: Record<string, string> = {
  draft: "Guardado por completar", pending: "Revisión pendiente", resolving: "Resolución en curso", resolved: "Revisión finalizada",
  "clinical-review": "Unificación de fichas por revisar", superseded: "Reemplazada por una nueva revisión",
  consolidating: "Consolidación en curso", consolidated: "Historias clínicas consolidadas",
  separating: "Separación en curso", separated: "Fichas separadas y verificadas",
};
export function IdentityReviewStatus({ patientUuid }: { patientUuid: string }) {
  const { user } = useAuth();
  const cases = useQuery({ queryKey: ["identity-reviews", patientUuid], queryFn: () => listIdentityReviews(patientUuid),
    enabled: Boolean(patientUuid) && mpiAdmissionMode === "integrated", retry: false, refetchOnWindowFocus: true });
  const active = cases.data?.find(c => ["pending", "resolving", "clinical-review", "draft", "consolidating", "separating"].includes(c.status));
  const latest = active || cases.data?.find(c => ["resolved","consolidated","separated"].includes(c.status));
  if (!latest) return cases.isError ? <p className="warning-banner" role="status">No se pudo comprobar si hay revisiones de identidad pendientes.</p> : null;
  return <section className={active ? "warning-banner identity-review-notice" : "success-banner identity-review-notice"} aria-label="Estado de revisión de identidad">
    <div><strong>{reviewStatusLabels[latest.status]}</strong><p>{active
      ? latest.status === "clinical-review" ? "Se detectaron fichas que requieren un procedimiento de unificación. No se han unido sus historias clínicas."
        : "La ficha puede utilizarse. El gestor revisará los documentos antes de asociar la identidad."
      : latest.status === "consolidated" ? "Ambas historias están disponibles en la ficha vigente. Se conserva su procedencia para una separación posterior."
        : latest.status === "separated" ? "Se restituyeron los antecedentes a sus fichas y se verificó su identidad según la decisión del gestor."
          : "La revisión de los documentos fue resuelta por el gestor."}</p>
      {active?.heldRun && <p>RUN propuesto: <strong>{active.heldRun}</strong>. Su incorporación está pendiente.</p>}
      {latest.resolution && <small>Última revisión: {new Date(latest.resolution.at).toLocaleString("es-CL")} · {latest.resolution.actor}</small>}
    </div>
    {hasPrivilege(user, "Manage MPI Identity Reviews") && <Link className="mpi-flow-link" href="/patient-management">Abrir Gestión de pacientes</Link>}
  </section>;
}
