import { useEffect } from "react";
import { useRouter } from "next/router";
import { IpdHome } from "@/features/ipd/IpdHome";

function legacyHashRoute(hash: string): string | undefined {
  const value = hash.replace(/^#\/?/, "");
  const bed = value.match(/^bedManagement\/bed\/(\d+)/i);
  if (bed?.[1]) return `/bedmanagement/bed/${bed[1]}`;
  const patient = value.match(/^bedManagement\/patient\/([^/?]+)/i);
  if (patient?.[1]) return `/bedmanagement/patient/${patient[1]}`;
  const dashboard = value.match(/^patient\/([^/]+)\/visit\/([^/]+)\/dashboard/i);
  if (dashboard?.[1] && dashboard[2]) return `/bedmanagement/patient/${dashboard[1]}/visit/${dashboard[2]}/dashboard`;
  if (/^home\/careViewDashboard/i.test(value)) return "/bedmanagement/care-view";
  if (/^bedManagement/i.test(value)) return "/bedmanagement/manage";
  return undefined;
}

export default function BedmanagementIndex() {
  const router = useRouter();
  useEffect(() => { const target = legacyHashRoute(window.location.hash); if (target) void router.replace(target); }, [router]);
  return <IpdHome />;
}

export { legacyHashRoute };
