import { useEffect } from "react";
import { useRouter } from "next/router";
import { resolveLegacyRoute } from "@/config-compat/legacyRoutes";

export default function ClinicalLegacyBridge() {
  const router = useRouter();
  useEffect(() => {
    const destination = resolveLegacyRoute(window.location.pathname, window.location.hash);
    void router.replace(destination);
  }, [router]);
  return <main className="centered"><p>Abriendo Clínico…</p></main>;
}
