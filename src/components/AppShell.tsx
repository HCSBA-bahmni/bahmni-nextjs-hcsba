import Link from "next/link";
import { useRouter } from "next/router";
import { Button } from "primereact/button";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/features/auth/AuthContext";
import { isKeycloakAuth } from "@/features/auth/authMode";
import { hasPrivilege } from "@/services/bahmni/auth";

export function AppShell({ children, title, mainClassName }: { children: ReactNode; title?: string; mainClassName?: string }) {
  const { user, location, quickLogoutComboKey, signOut } = useAuth();
  const keycloakAuth = isKeycloakAuth();
  const router = useRouter();
  const isActive = (href: string) => router.pathname === href || router.pathname.startsWith(`${href}/`);

  useEffect(() => {
    const quickLogout = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === quickLogoutComboKey) {
        event.preventDefault();
        void signOut();
      }
    };
    window.addEventListener("keydown", quickLogout);
    return () => window.removeEventListener("keydown", quickLogout);
  }, [quickLogoutComboKey, signOut]);

  return <div className="app-shell">
    <header className="topbar">
      <Link href="/home" className="brand" aria-label="Inicio HIS HCSBA">HIS <span>HCSBA</span></Link>
      <nav aria-label="Navegación principal">
        <Link href="/home" className={isActive("/home") ? "active" : undefined}>Inicio</Link>
        {hasPrivilege(user, "app:registration") && <Link href="/registration" className={isActive("/registration") ? "active" : undefined}>Registro</Link>}
        {hasPrivilege(user, "Manage MPI Identity Reviews") && <Link href="/patient-management" className={isActive("/patient-management") ? "active" : undefined} aria-current={isActive("/patient-management") ? "page" : undefined}>Gestión de pacientes</Link>}
        {hasPrivilege(user, "app:clinical") && <Link href="/clinical" className={isActive("/clinical") ? "active" : undefined}>Clínico</Link>}
        {hasPrivilege(user, "app:appointments") && <Link href="/appointments" className={isActive("/appointments") ? "active" : undefined}>Citas</Link>}
        {hasPrivilege(user, "app:orders") && <Link href="/orders" className={isActive("/orders") ? "active" : undefined}>Órdenes</Link>}
        {hasPrivilege(user, "app:adt") && <Link href="/bedmanagement" className={isActive("/bedmanagement") ? "active" : undefined}>Camas</Link>}
        {hasPrivilege(user, "app:admin") && <Link href="/admin" className={isActive("/admin") ? "active" : undefined}>Admin</Link>}
      </nav>
      <div className="session-summary">
        {keycloakAuth
          ? <span>{user?.display ?? user?.username}</span>
          : <Link className="session-user-link" href="/change-password" title="Cambiar contraseña">{user?.display ?? user?.username}</Link>}
        <Link className="muted session-location-link" href="/location" title="Cambiar ubicación">{location?.display ?? location?.name}</Link>
        <Button text severity="secondary" icon="pi pi-sign-out" label="Salir" onClick={() => void signOut()} />
      </div>
    </header>
    <main className={`page-container${mainClassName ? ` ${mainClassName}` : ""}`}>
      {title && <header className="app-page-heading"><span className="clinical-eyebrow">HCSBA</span><h1>{title}</h1></header>}
      {children}
    </main>
  </div>;
}
