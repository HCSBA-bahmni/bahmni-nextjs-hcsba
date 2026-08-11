import { useEffect } from "react";
import { useRouter } from "next/router";
import { resolveLegacyRoute } from "@/config-compat/legacyRoutes";

export default function AdtLegacyEntry() {
  const router = useRouter();

  useEffect(() => {
    const target = resolveLegacyRoute(window.location.pathname, window.location.hash);
    void router.replace(target);
  }, [router]);

  return (
    <main className="page-shell">
      <section className="panel empty-state" aria-live="polite">
        Cargando gestión ADT del paciente…
      </section>
    </main>
  );
}
