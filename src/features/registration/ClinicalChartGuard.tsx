import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/router";
import Link from "next/link";
import { bahmniRequest, BahmniApiError } from "@/services/bahmni/http";
import type { PropsWithChildren } from "react";
import type { UrlObject } from "url";

/** Resolve historical chart URLs before mounting editable patient workflows. */
export function ClinicalChartGuard({patientUuid,children,currentHref}:PropsWithChildren<{patientUuid:string;currentHref?:(uuid:string)=>UrlObject}>) {
  const router=useRouter();
  const alias=useQuery({queryKey:["clinical-chart-alias",patientUuid],enabled:Boolean(patientUuid),retry:false,staleTime:0,refetchOnMount:"always",
    queryFn:async()=>{
      try{return await bahmniRequest<{preferred_uuid?:string}>(`/ws/rest/v1/eisidentity/consolidations/redirect?patientUuid=${encodeURIComponent(patientUuid)}`);}
      catch(error){if(error instanceof BahmniApiError && error.status===404)return {};throw error;}
    }});
  if(alias.isPending)return <p role="status">Comprobando la ficha vigente…</p>;
  if(alias.isError)return <p className="error-banner" role="alert">No fue posible comprobar si esta ficha fue consolidada. Actualice la página antes de continuar.</p>;
  const current=alias.data?.preferred_uuid;
  if(current&&current!==patientUuid)return <section className="warning-banner" role="status"><h2>Esta ficha fue incorporada a otra ficha vigente</h2>
    <p>Sus antecedentes están conservados en la ficha activa. Continúe allí para registrar nuevas atenciones.</p>
    <Link href={currentHref?currentHref(current):`/registration/patient/${encodeURIComponent(current)}${router.pathname.endsWith("/visit")?"/visit":""}`}>Abrir ficha vigente</Link></section>;
  return <>{children}</>;
}
