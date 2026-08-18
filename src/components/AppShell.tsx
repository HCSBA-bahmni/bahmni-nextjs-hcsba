import Link from "next/link";
import { Button } from "primereact/button";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/features/auth/AuthContext";
import { isKeycloakAuth } from "@/features/auth/authMode";
import { hasPrivilege } from "@/services/bahmni/auth";

export function AppShell({ children, title, mainClassName }: { children: ReactNode; title?: string; mainClassName?: string }) {
  const { user, location, quickLogoutComboKey, signOut } = useAuth();
  const keycloakAuth = isKeycloakAuth();

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
      <Link href="/home" className="brand" aria-label="Inicio HCSBA">HCSBA <span>Bahmni</span></Link>
      <nav aria-label="Navegación principal">
        <Link href="/home">Inicio</Link>
        <Link href="/registration">Registro</Link>
        <Link href="/clinical">Clínico</Link>
        {hasPrivilege(user, "app:appointments") && <Link href="/appointments">Citas</Link>}
        {hasPrivilege(user, "app:adt") && <Link href="/bedmanagement">Camas</Link>}
      </nav>
      <div className="session-summary">
        {keycloakAuth
          ? <span>{user?.display ?? user?.username}</span>
          : <Link className="session-user-link" href="/change-password" title="Cambiar contraseña">{user?.display ?? user?.username}</Link>}
        <Link className="muted session-location-link" href="/location" title="Cambiar ubicación">{location?.display ?? location?.name}</Link>
        <Button text severity="secondary" icon="pi pi-sign-out" label="Salir" onClick={() => void signOut()} />
      </div>
    </header>
    <main className={`page-container${mainClassName ? ` ${mainClassName}` : ""}`}>{title && <h1>{title}</h1>}{children}</main>
  </div>;
}
