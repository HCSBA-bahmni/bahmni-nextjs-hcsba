import { useQuery } from "@tanstack/react-query";
import { getAssignedBed, ipdQueryKeys } from "@/services/bahmni/ipd";
import { BedIcon } from "./BedIcon";

interface Props {
  patientUuid: string;
  showAdmittedWithoutBed?: boolean;
}

export function AssignedBedBadge({ patientUuid, showAdmittedWithoutBed = false }: Props) {
  const assignedBed = useQuery({
    queryKey: ipdQueryKeys.assignedBed(patientUuid),
    queryFn: () => getAssignedBed(patientUuid),
    enabled: Boolean(patientUuid),
    staleTime: 30_000,
  });

  if (!assignedBed.data) {
    return assignedBed.isSuccess && showAdmittedWithoutBed
      ? <span className="clinical-admission-state" role="status">Admitido sin cama</span>
      : null;
  }

  const label = assignedBed.data.bedNumber
    ? `Cama asignada: ${assignedBed.data.bedNumber}`
    : "Paciente con cama asignada";

  return <span className="clinical-bed-badge" title={label} aria-label={label}><BedIcon /></span>;
}
