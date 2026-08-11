import Link from "next/link";

export type IpdModuleMode = "patients" | "beds" | "care-view";

interface Props {
  activeMode: IpdModuleMode;
}

const links: Array<{ mode: IpdModuleMode; href: string; label: string; icon: string }> = [
  { mode: "patients", href: "/bedmanagement", label: "Lista de Pacientes", icon: "pi pi-users" },
  { mode: "beds", href: "/bedmanagement/manage", label: "Gestión de las camas", icon: "pi pi-th-large" },
  { mode: "care-view", href: "/bedmanagement/care-view", label: "Vista de cuidados", icon: "pi pi-heart" },
];

export function IpdModuleNavigation({ activeMode }: Props) {
  return <nav className="ipd-module-navigation" aria-label="Secciones de gestión de camas">
    {links.map((link) => <Link
      key={link.mode}
      href={link.href}
      className={activeMode === link.mode ? "selected" : undefined}
      aria-current={activeMode === link.mode ? "page" : undefined}
    >
      <i className={link.icon} aria-hidden="true" />
      <span>{link.label}</span>
    </Link>)}
  </nav>;
}
