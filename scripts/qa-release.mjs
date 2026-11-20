import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";

const catalogUrl = new URL("../docs/qa/catalogo.json", import.meta.url);
const weights = { P0: 5, P1: 3, P2: 2, P3: 1 };
const statuses = ["PENDIENTE", "APROBADO", "FALLIDO", "BLOQUEADO", "NO_APLICA"];
const phases = ["PRE", "POST"];
const nonempty = (value) => typeof value === "string" && value.trim().length > 0;
const instant = (value) => nonempty(value) && /T.*(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value));
const percentage = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
const digest = (value) => typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);

export function createCampaign(catalog, id) {
  return {
    schemaVersion: 1,
    release: { id, title: "", scope: "", revision: "", owner: "", createdAt: new Date().toISOString(), target: "https://10.68.174.225", expectedImage: "" },
    policy: { minAcceptance: 95, minExecution: 100, rationale: "Política inicial HIS; fijar antes de ejecutar." },
    deployment: { observedImage: "", observedRevision: "", deployedAt: "", evidence: "" },
    cases: catalog.map((item) => ({ ...item, profile: "", preconditions: "", source: "", status: "PENDIENTE", actual: "", evidence: [], mode: "", environment: "", revision: "", executedAt: "", tester: "", suggestion: "", owner: "", defectPriority: "", exclusionReason: "" })),
  };
}

export function validateCampaign(data, catalog) {
  const errors = [];
  if (!data || data.schemaVersion !== 1) return ["schemaVersion debe ser 1."];
  for (const key of ["release", "policy", "deployment"]) {
    if (!data[key] || typeof data[key] !== "object" || Array.isArray(data[key])) errors.push(`Falta objeto ${key}.`);
  }
  if (errors.length) return errors;
  for (const key of ["id", "title", "scope", "revision", "owner", "target", "expectedImage"]) {
    if (typeof data.release[key] !== "string") errors.push(`release.${key} debe ser texto.`);
  }
  if (data.release.target !== "https://10.68.174.225") errors.push("El destino de esta pauta debe ser https://10.68.174.225.");
  if (!instant(data.release.createdAt)) errors.push("release.createdAt requiere fecha ISO con zona horaria.");
  for (const key of ["observedImage", "observedRevision", "deployedAt", "evidence"]) {
    if (typeof data.deployment[key] !== "string") errors.push(`deployment.${key} debe ser texto.`);
  }
  if (!percentage(data.policy.minAcceptance) || !percentage(data.policy.minExecution)) errors.push("Umbrales fuera de 0..100.");
  if (!nonempty(data.policy.rationale)) errors.push("La política requiere justificación.");
  if (!Array.isArray(data.cases) || !data.cases.length) return [...errors, "Se requiere al menos un caso."];
  const seen = new Set();
  for (const row of data.cases) {
    if (!row || typeof row !== "object") { errors.push("Caso inválido."); continue; }
    const prefix = `Caso ${row.id ?? "sin ID"}`;
    if (!nonempty(row.id) || seen.has(row.id)) errors.push(`${prefix}: ID vacío o repetido.`);
    seen.add(row.id);
    if (!phases.includes(row.phase) || !Object.hasOwn(weights, row.priority) || !statuses.includes(row.status)) errors.push(`${prefix}: fase, prioridad o estado inválido.`);
    if (typeof row.mandatory !== "boolean" || typeof row.requiresReal !== "boolean") errors.push(`${prefix}: mandatory/requiresReal deben ser booleanos.`);
    for (const key of ["tested", "steps", "expected"]) if (!nonempty(row[key])) errors.push(`${prefix}: falta ${key}.`);
    for (const key of ["profile", "preconditions", "source", "actual", "mode", "environment", "revision", "executedAt", "tester", "suggestion", "owner", "defectPriority", "exclusionReason"]) {
      if (typeof row[key] !== "string") errors.push(`${prefix}: ${key} debe ser texto.`);
    }
    const hasEvidence = Array.isArray(row.evidence) && row.evidence.length > 0 && row.evidence.every(nonempty);
    if (!Array.isArray(row.evidence) || row.evidence.some((entry) => !nonempty(entry))) errors.push(`${prefix}: evidence debe ser una lista de referencias no vacías.`);
    if (["APROBADO", "FALLIDO"].includes(row.status)) {
      for (const key of ["actual", "environment", "revision", "tester", "profile", "preconditions", "source"]) if (!nonempty(row[key])) errors.push(`${prefix}: falta ${key} para un resultado ejecutado.`);
      if (!instant(row.executedAt)) errors.push(`${prefix}: falta fecha ISO con zona horaria.`);
      if (!hasEvidence) errors.push(`${prefix}: requiere evidencia.`);
      if (!["REAL", "SIMULADO", "ARTEFACTO"].includes(row.mode)) errors.push(`${prefix}: modo inválido.`);
      if (row.revision !== data.release.revision) errors.push(`${prefix}: resultado de otra revisión; requiere nueva ejecución.`);
      if (row.phase === "POST" && row.environment !== data.release.target) errors.push(`${prefix}: evidencia POST de otro ambiente.`);
      if (row.phase === "POST" && (!instant(data.deployment.deployedAt) || Date.parse(row.executedAt) < Date.parse(data.deployment.deployedAt))) errors.push(`${prefix}: el resultado POST debe ser posterior al despliegue documentado.`);
      if (row.status === "APROBADO" && row.requiresReal && row.mode !== "REAL") errors.push(`${prefix}: requiere prueba real; un mock o artefacto no acredita este caso.`);
    }
    if (["FALLIDO", "BLOQUEADO"].includes(row.status)) {
      if (!nonempty(row.actual) || !nonempty(row.suggestion) || !nonempty(row.owner)) errors.push(`${prefix}: requiere obtenido, sugerencia y responsable.`);
    }
    if (row.status === "FALLIDO" && !Object.hasOwn(weights, row.defectPriority)) errors.push(`${prefix}: clasificar severidad del hallazgo en defectPriority.`);
    if (row.status === "NO_APLICA") {
      if (row.mandatory) errors.push(`${prefix}: compuerta obligatoria no admite NO_APLICA.`);
      if (!nonempty(row.exclusionReason) || !nonempty(row.owner)) errors.push(`${prefix}: exclusión sin motivo/responsable.`);
    }
  }
  for (const base of catalog) {
    const row = data.cases.find((candidate) => candidate?.id === base.id);
    if (!row) errors.push(`Falta caso base ${base.id}; usar NO_APLICA justificado cuando corresponda.`);
    else if (["phase", "priority", "mandatory", "requiresReal"].some((key) => row[key] !== base[key])) errors.push(`Caso base ${base.id}: no cambiar fase, prioridad ni compuertas; ampliar con casos nuevos.`);
  }
  return errors;
}

export function evaluatePhase(data, phase) {
  const rows = data.cases.filter((row) => row.phase === phase);
  const applicable = rows.filter((row) => row.status !== "NO_APLICA");
  const passed = applicable.filter((row) => row.status === "APROBADO");
  const executed = applicable.filter((row) => ["APROBADO", "FALLIDO"].includes(row.status));
  const totalWeight = applicable.reduce((sum, row) => sum + weights[row.priority], 0);
  const passedWeight = passed.reduce((sum, row) => sum + weights[row.priority], 0);
  const acceptance = totalWeight ? 100 * passedWeight / totalWeight : 0;
  const execution = applicable.length ? 100 * executed.length / applicable.length : 0;
  const blockers = [];
  if (!applicable.length) blockers.push("No hay casos aplicables.");
  if (acceptance < data.policy.minAcceptance) blockers.push(`Aceptación inferior a ${data.policy.minAcceptance}%.`);
  if (execution < data.policy.minExecution) blockers.push(`Ejecución inferior a ${data.policy.minExecution}%.`);
  const gates = applicable.filter((row) => ((row.mandatory || ["P0", "P1"].includes(row.priority)) && row.status !== "APROBADO") || (row.status === "FALLIDO" && ["P0", "P1"].includes(row.defectPriority)));
  if (gates.length) blockers.push(`Compuertas/P0/P1 sin aprobar: ${gates.map((row) => row.id).join(", ")}.`);
  for (const key of ["id", "title", "scope", "revision", "owner"]) if (!nonempty(data.release[key])) blockers.push(`Completar release.${key}.`);
  if (!digest(data.release.expectedImage)) blockers.push("Falta digest sha256 de la imagen candidata.");
  if (phase === "POST") {
    if (!digest(data.deployment.observedImage) || data.deployment.observedImage !== data.release.expectedImage) blockers.push("La imagen observada en .225 no coincide con la candidata.");
    if (!nonempty(data.deployment.observedRevision) || data.deployment.observedRevision !== data.release.revision) blockers.push("La revisión desplegada no coincide con la evaluada.");
    if (!nonempty(data.deployment.evidence)) blockers.push("Falta evidencia del despliegue observado.");
    if (!instant(data.deployment.deployedAt)) blockers.push("Falta fecha del despliegue con zona horaria.");
  }
  return { phase, total: rows.length, applicable: applicable.length, excluded: rows.length - applicable.length, passed: passed.length, failed: applicable.filter((row) => row.status === "FALLIDO").length, blocked: applicable.filter((row) => row.status === "BLOQUEADO").length, pending: applicable.filter((row) => row.status === "PENDIENTE").length, executed: executed.length, acceptance, execution, passedWeight, totalWeight, blockers, ready: blockers.length === 0 };
}

export function evaluateCampaign(data) {
  const pre = evaluatePhase(data, "PRE");
  const post = evaluatePhase(data, "POST");
  if (!pre.ready) { post.blockers.push("La fase PRE no está aprobada para esta revisión."); post.ready = false; }
  return { release: data.release.id, revision: data.release.revision, target: data.release.target, policy: data.policy, pre, post };
}

const columns = [
  ["ID", (r) => r.id], ["Fase", (r) => r.phase], ["Lo probado", (r) => r.tested],
  ["Resultado esperado", (r) => r.expected], ["Resultado obtenido", (r) => r.actual], ["Estado", (r) => r.status],
  ["Aceptación %", (r) => r.status === "APROBADO" ? 100 : r.status === "NO_APLICA" ? "N/A" : 0],
  ["Sugerencia de solución", (r) => r.suggestion], ["Responsable", (r) => r.owner],
  ["Prioridad", (r) => r.priority], ["Peso", (r) => weights[r.priority]], ["Obligatoria", (r) => r.mandatory ? "Sí" : "No"],
  ["Perfil", (r) => r.profile], ["Precondiciones", (r) => r.preconditions], ["Pasos", (r) => r.steps], ["Fuente/criterio", (r) => r.source],
  ["Severidad del hallazgo", (r) => r.defectPriority], ["Evidencia", (r) => r.evidence.join("; ")],
  ["Modo", (r) => r.mode], ["Ambiente", (r) => r.environment], ["Revisión", (r) => r.revision], ["Fecha", (r) => r.executedAt],
  ["Ejecutor", (r) => r.tester], ["Motivo no aplica", (r) => r.exclusionReason],
];
const escapeHtml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const escapeCsv = (value) => { const text = String(value); return `"${(/^[\s]*[=+@-]/.test(text) ? "'" : "") + text.replaceAll('"', '""')}"`; };
const table = (rows) => `<div class="scroll"><table><thead><tr>${columns.map(([label]) => `<th>${label}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${columns.map(([, get]) => `<td>${escapeHtml(get(row))}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;

export function renderHtml(data, summary) {
  return `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pauta QA ${escapeHtml(data.release.id)}</title>
<style>body{font:16px system-ui;margin:2rem;color:#172b4d;background:#f5f7fa}h1{font-size:1.7rem}section{background:white;border:1px solid #cbd5e1;border-radius:8px;padding:1.2rem;margin:1rem 0}.scroll{overflow:auto;max-height:65vh}table{border-collapse:collapse;font-size:.85rem}th,td{text-align:left;vertical-align:top;padding:.65rem;border:1px solid #cbd5e1;min-width:140px;white-space:pre-wrap}th{position:sticky;top:0;background:#e2e8f0}li{margin:.4rem 0}.metric{font-size:1.1rem}small{color:#475569}@media print{.scroll{max-height:none;overflow:visible}body{margin:0}}</style>
<h1>Pauta QA · ${escapeHtml(data.release.id)}</h1><p>${escapeHtml(data.release.title || "Título pendiente")}</p>
<p>Alcance: ${escapeHtml(data.release.scope || "Pendiente")}<br>Revisión: ${escapeHtml(data.release.revision || "Pendiente")}<br>Destino: ${escapeHtml(data.release.target)} · Responsable: ${escapeHtml(data.release.owner || "Pendiente")}</p>
<p>Umbral de aceptación: ${data.policy.minAcceptance}%; ejecución: ${data.policy.minExecution}%. ${escapeHtml(data.policy.rationale)}</p>
<small>El harness calcula resultados declarados con evidencia referenciada. La revisión de esa evidencia corresponde al ejecutor. No ejecuta pruebas clínicas ni despliega.</small>
${[summary.pre, summary.post].map((phase) => `<section><h2>${phase.phase === "PRE" ? "Antes de desplegar" : "Después de desplegar en .225"}: ${phase.ready ? phase.failed ? "APROBADO CON OBSERVACIONES" : "APROBADO" : "NO APROBADO"}</h2>
<p class="metric">Aceptación ponderada: ${phase.acceptance.toFixed(2)}% · Ejecución: ${phase.execution.toFixed(2)}%</p>
<p>${phase.passed} aprobadas · ${phase.failed} fallidas · ${phase.blocked} bloqueadas · ${phase.pending} pendientes · ${phase.excluded} no aplican. Peso aprobado: ${phase.passedWeight}/${phase.totalWeight}.</p>
${phase.blockers.length ? `<ul>${phase.blockers.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}</ul>` : "<p>Compuertas aprobadas para el alcance y revisión declarados.</p>"}${table(data.cases.filter((row) => row.phase === phase.phase))}</section>`).join("")}
<p>Una prueba pendiente o bloqueada no cuenta como ejecutada. NO_APLICA se excluye del denominador y exige justificación. Una repetición sustituye el resultado vigente del mismo ID; conservar corridas anteriores aparte.</p></html>`;
}

export async function main(args) {
  const [command, file, output] = args;
  const catalog = JSON.parse(await readFile(catalogUrl, "utf8"));
  if (command === "init" && file && !output && args.length === 2) {
    const path = resolve(file);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(createCampaign(catalog, path.split(/[\\/]/).at(-1).replace(/\.json$/i, "")), null, 2) + "\n", { encoding: "utf8", flag: "wx" });
    process.stdout.write(`Pauta creada sin resultados: ${path}\n`);
    return 0;
  }
  if (command !== "report" || !file || !output || args.length !== 4 || !["PRE", "POST"].includes(args[3])) throw new Error("Uso: node scripts/qa-release.mjs init <pauta.json> | report <pauta.json> <directorio-nuevo> <PRE|POST>");
  const data = JSON.parse(await readFile(resolve(file), "utf8"));
  const errors = validateCampaign(data, catalog);
  if (errors.length) throw new Error(errors.join("\n"));
  const summary = evaluateCampaign(data);
  const target = resolve(output);
  // Cada corrida se conserva: no sobrescribir informes anteriores ni resultados originales.
  await mkdir(dirname(target), { recursive: true });
  await mkdir(target);
  await writeFile(resolve(target, "pauta.json"), JSON.stringify(data, null, 2) + "\n", "utf8");
  await writeFile(resolve(target, "resumen.json"), JSON.stringify(summary, null, 2) + "\n", "utf8");
  const csv = [columns.map(([label]) => escapeCsv(label)).join(";"), ...data.cases.map((row) => columns.map(([, get]) => escapeCsv(get(row))).join(";"))].join("\r\n");
  await writeFile(resolve(target, "pauta.csv"), "\ufeff" + csv + "\r\n", "utf8");
  await writeFile(resolve(target, "informe.html"), renderHtml(data, summary), "utf8");
  const gate = summary[args[3].toLowerCase()];
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\nInforme: ${resolve(target, "informe.html")}\n`);
  return gate.ready ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { process.exitCode = await main(process.argv.slice(2)); }
  catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 2; }
}
