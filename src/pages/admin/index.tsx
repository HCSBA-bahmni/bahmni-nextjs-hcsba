import Cookies from "js-cookie";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/AppShell";
import { resolveAdminExtensionUrl, resolveAdminIcon, resolveAdminLabel } from "@/features/admin/dashboard";
import { AuthGuard } from "@/features/auth/AuthGuard";
import { useAuth } from "@/features/auth/AuthContext";
import { hasPrivilege } from "@/services/bahmni/auth";
import { loadExtensions, loadTranslations } from "@/services/bahmni/config";

export default function AdminDashboardPage() {
  const { user } = useAuth();
  const { i18n, t } = useTranslation();
  const allowed = hasPrivilege(user, "app:admin");
  const locale = Cookies.get("bahmni.locale") ?? i18n.resolvedLanguage ?? "es";
  const extensions = useQuery({ queryKey: ["extensions", "admin"], queryFn: () => loadExtensions("admin"), enabled: allowed });
  const translations = useQuery({ queryKey: ["translations", "admin", locale], queryFn: () => loadTranslations("admin", locale), enabled: allowed });

  useEffect(() => {
    if (!translations.data) return;
    i18n.addResourceBundle(locale, "translation", translations.data, true, true);
    void i18n.changeLanguage(locale);
  }, [i18n, locale, translations.data]);

  const visible = (extensions.data ?? []).filter((extension) => extension.extensionPointId === "org.bahmni.admin.dashboard" && hasPrivilege(user, extension.requiredPrivilege) && extension.online !== false);

  return <AuthGuard><AppShell title="Administración" mainClassName="admin-dashboard-page">
    {!allowed && <p role="alert" className="error-banner">No tiene el privilegio app:admin requerido por el módulo de Administración.</p>}
    {allowed && <>
      <section className="panel admin-dashboard-hero">
        <span className="admin-dashboard-hero-icon"><i className="pi pi-cog" aria-hidden="true" /></span>
        <div><p>HCSBA Bahmni</p><h2>Administración</h2><span>Herramientas administrativas configuradas para esta instalación.</span></div>
      </section>
      {(extensions.isLoading || translations.isLoading) && <p role="status">Cargando herramientas de Administración…</p>}
      <nav className="admin-dashboard-grid" aria-label="Herramientas de Administración">
        {visible.map((extension) => {
          const destination = resolveAdminExtensionUrl(extension.url);
          const label = resolveAdminLabel(extension.label, extension.translationKey, extension.id, (key, fallback) => String(t(key, { defaultValue: fallback })));
          return <a key={extension.id} className="admin-dashboard-tile" href={destination.href} data-navigation={destination.kind}>
            <span><i className={resolveAdminIcon(extension.icon)} aria-hidden="true" /></span>
            <strong>{label}</strong>
          </a>;
        })}
      </nav>
      {extensions.isError && <p role="alert" className="error-banner">No fue posible cargar admin/extension.json.</p>}
      {translations.isError && <p role="alert" className="error-banner">No fue posible cargar las traducciones de Administración.</p>}
    </>}
  </AppShell></AuthGuard>;
}
