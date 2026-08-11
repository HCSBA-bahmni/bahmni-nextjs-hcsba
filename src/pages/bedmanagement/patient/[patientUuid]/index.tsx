import { useRouter } from "next/router";
import { BedManagementWorkspace } from "@/features/ipd/BedManagementWorkspace";
export default function PatientBedPage() { const router = useRouter(); const patientUuid = Array.isArray(router.query.patientUuid) ? router.query.patientUuid[0] : router.query.patientUuid; return <BedManagementWorkspace patientUuid={patientUuid} />; }
