import { resolveExtensionUrl, type ResolvedExtensionUrl } from "@/config-compat/legacyRoutes";

const adminIcons: Record<string, string> = {
  "fa-upload": "pi pi-upload",
  "fa-download": "pi pi-download",
  "fa-eye": "pi pi-eye",
  "icon-bahmni-inpatient": "pi pi-building",
};

const adminLabels: Record<string, string> = {
  "bahmni.admin.csv": "Cargar CSV",
  "bahmni.admin.csvExport": "Exportar CSV",
  "bahmni.admin.auditLog": "Registro de auditoría",
  "bahmni.admin.orderSet": "Conjuntos de órdenes",
  "bahmni.admin.adt": "Camas",
};

export function resolveAdminLabel(id: string, configuredLabel: string): string {
  return adminLabels[id] ?? configuredLabel;
}

export function resolveAdminExtensionUrl(rawUrl?: string): ResolvedExtensionUrl {
  if (rawUrl === "#/auditLog") return { href: "/bahmni/admin/audit-log", kind: "next" };
  if (rawUrl?.startsWith("#/")) return { href: `/bahmni/admin-legacy/${rawUrl}`, kind: "legacy" };
  if (rawUrl?.startsWith("/bahmni/admin/audit-log")) return { href: rawUrl, kind: "next" };
  if (rawUrl?.startsWith("/bahmni/admin/beds")) return { href: "/bahmni/admin/beds", kind: "next" };
  return resolveExtensionUrl(rawUrl);
}

export function resolveAdminIcon(icon?: string): string {
  if (!icon) return "pi pi-cog";
  const legacyClass = icon.trim().split(/\s+/).at(-1) ?? icon;
  return adminIcons[legacyClass] ?? "pi pi-cog";
}
