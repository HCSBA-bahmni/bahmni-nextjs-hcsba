import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const projectRoot = resolve(process.cwd());
const workspaceRoot = dirname(projectRoot);
const dashboardPath = process.env.HCSBA_DASHBOARD_CONFIG ?? join(workspaceRoot, "standard-config-HCSBA", "openmrs", "apps", "clinical", "dashboard.json");
const auditPath = join(projectRoot, "docs", "clinical-dashboard-functional-audit.json");

if (!existsSync(dashboardPath)) throw new Error(`No se encontró dashboard.json: ${dashboardPath}`);
const dashboard = JSON.parse(readFileSync(dashboardPath, "utf8"));
const audit = JSON.parse(readFileSync(auditPath, "utf8"));
if (audit.schemaVersion !== 1 || !Array.isArray(audit.instances)) throw new Error("El manifiesto funcional del dashboard no cumple su esquema.");

const configured = Object.entries(dashboard).flatMap(([tabId, tab]) => Object.entries(tab.sections ?? {}).map(([sectionId, section]) => ({ path: `${tabId}/${sectionId}`, type: section.type })));
const audited = new Map(audit.instances.map((entry) => [entry.path, entry]));
const errors = [];
for (const section of configured) {
  const entry = audited.get(section.path);
  if (!entry) errors.push(`Sin auditoría: ${section.path}`);
  else if (entry.type !== section.type) errors.push(`Tipo divergente ${section.path}: config=${section.type}, auditoría=${entry.type}`);
  else if (!Array.isArray(entry.legacyFunctions) || !entry.legacyFunctions.length) errors.push(`Sin funciones legacy: ${section.path}`);
  else if (!entry.remaining) errors.push(`Sin criterio restante: ${section.path}`);
}
for (const path of audited.keys()) if (!configured.some((section) => section.path === path)) errors.push(`Auditoría obsoleta: ${path}`);
if (configured.length !== 39) errors.push(`Se esperaban 39 instancias HCSBA y se encontraron ${configured.length}`);
if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}
const totals = audit.instances.reduce((result, entry) => ({ ...result, [entry.status]: (result[entry.status] ?? 0) + 1 }), {});
console.log(`Dashboard functional audit passed (${configured.length}/39 trazadas; ${totals.implemented ?? 0} implementadas; ${totals.partial ?? 0} parciales).`);
