import { useRouter } from "next/router";import { useEffect } from "react";import { resolveLegacyRoute } from "@/config-compat/legacyRoutes";
export function LegacyBridge(){const router=useRouter();useEffect(()=>{void router.replace(resolveLegacyRoute(window.location.pathname,window.location.hash));},[router]);return <main className="centered"><p>Redirigiendo a la nueva interfaz…</p></main>}
