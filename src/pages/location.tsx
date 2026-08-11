import { Button } from "primereact/button";
import { Dropdown } from "primereact/dropdown";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/router";
import { useState } from "react";
import { resolveLoginDestination } from "@/config-compat/legacyRoutes";
import { AuthGuard } from "@/features/auth/AuthGuard";
import { useAuth } from "@/features/auth/AuthContext";
import { getPersistedLocation } from "@/services/bahmni/auth";
import { audit } from "@/services/bahmni/audit";
import { loadLoginConfig } from "@/services/bahmni/config";
import type { BahmniLocation } from "@/types/bahmni";

export default function LocationPage() {
  const router = useRouter();
  const { selectLocation, loginLocations, location } = useAuth();
  const [selected, setSelected] = useState<BahmniLocation | null>(null);
  const [persistedLocationUuid] = useState(() => getPersistedLocation()?.uuid);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const serverTime = useQuery({
    queryKey: ["server-time"],
    queryFn: async () => {
      const response = await fetch("/cgi-bin/systemdate", { credentials: "include", cache: "no-store" });
      return response.ok ? await response.json() as { date?: string; offset?: string } : {};
    },
  });
  const loginConfig = useQuery({ queryKey: ["login-config"], queryFn: loadLoginConfig });
  const timezoneMismatch = Boolean(serverTime.data?.offset && !new Date().toString().includes(serverTime.data.offset));
  const locale = typeof router.query.locale === "string" ? router.query.locale : "es";
  const whiteListedDomains = Array.isArray(loginConfig.data?.whiteListedDomains)
    ? loginConfig.data.whiteListedDomains.filter((value): value is string => typeof value === "string")
    : [];
  const effectiveSelected = selected ?? location ?? loginLocations.find((candidate) => candidate.uuid === persistedLocationUuid) ?? null;

  const submit = async () => {
    if (!effectiveSelected) return;
    setBusy(true);
    setError("");
    try {
      await selectLocation(effectiveSelected, locale);
      void audit("USER_LOGIN_LOCATION_SUCCESS", "USER_LOGIN_LOCATION_SUCCESS");
      const destination = resolveLoginDestination(router.query.returnUrl, whiteListedDomains, window.location.origin);
      if (destination.external) window.location.replace(destination.href);
      else await router.replace(destination.href);
    } catch {
      void audit("USER_LOGIN_LOCATION_FAILED", "USER_LOGIN_LOCATION_FAILED");
      setError("No fue posible establecer la ubicación en la sesión de OpenMRS.");
    } finally {
      setBusy(false);
    }
  };

  return <AuthGuard requireLocation={false}><main className="centered"><section className="auth-card">
    <h1>Seleccione ubicación</h1>
    {error && <div role="alert" className="error-banner">{error}</div>}
    {timezoneMismatch && <div role="alert" className="warning-banner">La zona horaria del servidor ({serverTime.data?.offset}) difiere de la estación de trabajo.</div>}
    {!loginLocations.length && <div role="alert" className="error-banner">No hay ubicaciones de inicio de sesión habilitadas.</div>}
    <div className="field"><label htmlFor="location">Ubicación de atención</label><Dropdown inputId="location" value={effectiveSelected} options={loginLocations} optionLabel="display" onChange={(event) => setSelected(event.value as BahmniLocation)} filter emptyMessage="No hay ubicaciones" /></div>
    <Button label="Continuar" loading={busy} disabled={!effectiveSelected || !loginLocations.length} onClick={() => void submit()} />
  </section></main></AuthGuard>;
}
