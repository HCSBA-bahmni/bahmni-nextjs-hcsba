import { AppShell } from "@/components/AppShell";
import { AdminBedsWorkspace } from "@/features/admin/AdminBedsWorkspace";
import { AuthGuard } from "@/features/auth/AuthGuard";
import { useAuth } from "@/features/auth/AuthContext";
import { hasPrivilege } from "@/services/bahmni/auth";

export default function AdminBedsPage() {
  const { user } = useAuth();
  const allowed = hasPrivilege(user, "app:admin");
  return <AuthGuard><AppShell title="Administración">{allowed ? <AdminBedsWorkspace /> : <p role="alert" className="error-banner">No tiene el privilegio app:admin requerido por el módulo de Administración.</p>}</AppShell></AuthGuard>;
}
