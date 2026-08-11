import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/AppShell";
import { resolveExtensionUrl, resolveLegacyIcon } from "@/config-compat/legacyRoutes";
import { AuthGuard } from "@/features/auth/AuthGuard";
import { useAuth } from "@/features/auth/AuthContext";
import { useHomeTranslations } from "@/features/home/useHomeTranslations";
import { hasPrivilege } from "@/services/bahmni/auth";
import { loadExtensions } from "@/services/bahmni/config";

export default function HomePage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const translations = useHomeTranslations();
  const extensions = useQuery({ queryKey: ["extensions", "home"], queryFn: () => loadExtensions("home") });
  const visible = (extensions.data ?? []).filter((extension) => hasPrivilege(user, extension.requiredPrivilege) && extension.online !== false);

  return <AuthGuard><AppShell title="Aplicaciones">
    {(extensions.isLoading || translations.isLoading) && <p role="status">Cargando aplicaciones…</p>}
    <div className="app-grid">
      {visible.map((extension) => {
        const destination = resolveExtensionUrl(extension.url);
        const fallback = extension.label ?? extension.translationKey ?? extension.id;
        const label = extension.translationKey ? t(extension.translationKey, { defaultValue: fallback }) : fallback;
        return <a key={extension.id} className="app-tile" href={destination.href} data-navigation={destination.kind}>
          <i aria-hidden="true" className={resolveLegacyIcon(extension.icon)} />
          <strong>{label}</strong>
        </a>;
      })}
    </div>
    {extensions.isError && <p role="alert" className="error-banner">No se pudo cargar home/extension.json.</p>}
    {translations.isError && <p role="alert" className="error-banner">No se pudieron cargar las traducciones de Inicio.</p>}
  </AppShell></AuthGuard>;
}
