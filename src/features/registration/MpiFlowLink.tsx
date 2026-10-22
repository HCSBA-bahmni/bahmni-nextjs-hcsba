import Link from "next/link";
import { mpiAdmissionMode } from "@/services/mpi/admission";
import { useAuth } from "@/features/auth/AuthContext";
import { hasPrivilege } from "@/services/bahmni/auth";

export function MpiFlowLink() {
  const { user } = useAuth();
  if (mpiAdmissionMode !== "integrated" || !hasPrivilege(user, "Manage MPI Identity Reviews")) return null;

  return <Link className="mpi-flow-link" href="/patient-management"><span className="pi pi-inbox" aria-hidden="true" /><span>Gestión de pacientes</span></Link>;
}
