import Link from "next/link";
import { useAuth } from "@/features/auth/AuthContext";
import { hasPrivilege } from "@/services/bahmni/auth";
import { appointmentText } from "./translations";

export type AppointmentSection = "summary" | "calendar" | "list" | "waitlist" | "admin";
export const APPOINTMENTS_ADMIN_URL = "/appointments/admin";

const items: Array<{ id: AppointmentSection; label: string; href: string }> = [
  { id: "summary", label: appointmentText.summary, href: "/appointments/summary" },
  { id: "calendar", label: appointmentText.calendar, href: "/appointments/calendar" },
  { id: "list", label: appointmentText.list, href: "/appointments/list" },
  { id: "waitlist", label: appointmentText.waitList, href: "/appointments/waitlist" },
];

export function AppointmentNavigation({ active }: { active: AppointmentSection }) {
  const { user } = useAuth();
  const canAdministerAppointments = hasPrivilege(user, "app:appointments:adminTab") || hasPrivilege(user, "app:admin");
  return <nav className="appointments-nav" aria-label="Secciones de agenda">
    {items.map((item) => <Link key={item.id} href={item.href} aria-current={active === item.id ? "page" : undefined} className={active === item.id ? "active" : ""}>{item.label}</Link>)}
    {canAdministerAppointments && <Link className={`appointments-admin-link${active === "admin" ? " active" : ""}`} href={APPOINTMENTS_ADMIN_URL} accessKey="a" title="Administrar servicios de citas (Alt+A)"><i className="pi pi-cog" aria-hidden="true" /><span>{appointmentText.administration}</span></Link>}
  </nav>;
}
