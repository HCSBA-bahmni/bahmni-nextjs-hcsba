import { ProgressSpinner } from "primereact/progressspinner";
import { Button } from "primereact/button";
import { useRouter } from "next/router";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "./AuthContext";

export function AuthGuard({ children, requireLocation = true }: { children: ReactNode; requireLocation?: boolean }) {
  const { session, location, loading, error, refresh } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading || error) return;
    if (!session?.authenticated) {
      void router.replace(`/login?returnUrl=${encodeURIComponent(router.asPath)}`);
    } else if (requireLocation && !location) {
      void router.replace(`/location?returnUrl=${encodeURIComponent(router.asPath)}`);
    }
  }, [error, loading, location, requireLocation, router, session]);

  if (loading) return <main className="centered"><ProgressSpinner aria-label="Cargando sesión" /></main>;
  if (error && !session?.authenticated) {
    return <main className="centered"><section className="auth-card"><div role="alert" className="error-banner">{error}</div><Button label="Reintentar" onClick={() => void refresh()} /></section></main>;
  }
  if (!session?.authenticated || (requireLocation && !location)) return <main className="centered"><ProgressSpinner aria-label="Preparando sesión" /></main>;
  return <>{children}</>;
}
