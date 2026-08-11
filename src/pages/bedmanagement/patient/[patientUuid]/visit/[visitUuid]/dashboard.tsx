import { useRouter } from "next/router";
import { IpdDashboard } from "@/features/ipd/IpdDashboard";
export default function DashboardPage() { const router = useRouter(); const patientUuid = Array.isArray(router.query.patientUuid) ? router.query.patientUuid[0] : router.query.patientUuid; const visitUuid = Array.isArray(router.query.visitUuid) ? router.query.visitUuid[0] : router.query.visitUuid; return patientUuid && visitUuid ? <IpdDashboard patientUuid={patientUuid} visitUuid={visitUuid} /> : null; }
