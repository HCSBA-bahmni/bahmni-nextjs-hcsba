import { mpiAdmissionMode, mpiDemoHref } from "@/services/mpi/admission";

export function MpiFlowLink() {
  if (mpiAdmissionMode !== "integrated") return null;

  return <a className="mpi-flow-link" href={mpiDemoHref()} target="_blank" rel="noopener noreferrer"
    aria-label="Comprobar flujo MPI (abre en una pestaña nueva)">
    <span className="pi pi-sitemap" aria-hidden="true" />
    <span>Comprobar flujo MPI</span>
    <span className="pi pi-external-link" aria-hidden="true" />
  </a>;
}
