import type { PropsWithChildren } from "react";
import { useRouter } from "next/router";
import { useAuth } from "@/features/auth/AuthContext";
import { AuthGuard } from "@/features/auth/AuthGuard";
import { ClinicalChartGuard } from "./ClinicalChartGuard";

/** Resolve historical patient UUIDs before mounting clinical consumers or their queries. */
export function PatientRouteGuard({children}:PropsWithChildren) {
  const router=useRouter();
  const {user,loading}=useAuth();
  const patientUuid=typeof router.query.patientUuid==='string'?router.query.patientUuid:'';
  const clinicalConsumer=/^\/(clinical|orders|bedmanagement|appointments|document-upload)(\/|$)/.test(router.pathname);
  if(!patientUuid||!clinicalConsumer)return <>{children}</>;
  if(loading||!user)return <AuthGuard><p role="status">Comprobando la ficha vigente…</p></AuthGuard>;
  return <ClinicalChartGuard patientUuid={patientUuid} currentHref={current=>({pathname:router.pathname,query:{...router.query,patientUuid:current}})}>{children}</ClinicalChartGuard>;
}
