import { useRouter } from "next/router";
import { BedManagementWorkspace } from "@/features/ipd/BedManagementWorkspace";
export default function BedPage() { const router = useRouter(); const value = Array.isArray(router.query.bedId) ? router.query.bedId[0] : router.query.bedId; const bedId = value ? Number(value) : undefined; return <BedManagementWorkspace bedId={Number.isFinite(bedId) ? bedId : undefined} />; }
