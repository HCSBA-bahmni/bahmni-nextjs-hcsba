import assert from "node:assert/strict";
import test from "node:test";
import { readFile, mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createCampaign, validateCampaign, evaluateCampaign, renderHtml } from "./qa-release.mjs";

const catalog = JSON.parse(await readFile(new URL("../docs/qa/catalogo.json", import.meta.url), "utf8"));
const script = fileURLToPath(new URL("./qa-release.mjs", import.meta.url));

function completed() {
  const data = createCampaign(catalog, "AUTOPRUEBA-NO-CLINICA");
  Object.assign(data.release, { title: "Prueba del harness", scope: "Sólo fixture de software", revision: "fixture-revision-1", owner: "QA fixture", expectedImage: `sha256:${"a".repeat(64)}` });
  Object.assign(data.deployment, { observedImage: data.release.expectedImage, observedRevision: data.release.revision, deployedAt: "2026-11-02T09:00:00-03:00", evidence: "fixture:deployment" });
  for (const row of data.cases) Object.assign(row, { status: "APROBADO", actual: "Resultado de fixture, no clínico", evidence: ["fixture:assertion"], mode: row.requiresReal ? "REAL" : "ARTEFACTO", environment: row.phase === "POST" ? data.release.target : "https://localhost", revision: data.release.revision, executedAt: "2026-11-02T09:01:00-03:00", tester: "Fixture", profile: "Fixture", preconditions: "Fixture aislado", source: "fixture:requirement" });
  return data;
}

test("una pauta inicial no contiene resultados aprobados ni aprueba fases", () => {
  const data = createCampaign(catalog, "sin-ejecutar");
  assert.deepEqual(validateCampaign(data, catalog), []);
  const result = evaluateCampaign(data);
  for (const phase of [result.pre, result.post]) {
    assert.equal(phase.acceptance, 0);
    assert.equal(phase.execution, 0);
    assert.equal(phase.ready, false);
  }
});

test("un registro completo de la revisión e imagen coincidentes aprueba ambas fases", () => {
  const data = completed();
  assert.deepEqual(validateCampaign(data, catalog), []);
  const result = evaluateCampaign(data);
  assert.equal(result.pre.ready, true);
  assert.equal(result.post.ready, true);
  assert.equal(result.post.acceptance, 100);
});

test("una falla P0 bloquea aunque la política porcentual fuera permisiva", () => {
  const data = completed();
  data.policy.minAcceptance = 0;
  Object.assign(data.cases.find((r) => r.id === "POST-04"), { status: "FALLIDO", actual: "Fixture falla", suggestion: "Corregir fixture", owner: "QA", defectPriority: "P0" });
  assert.deepEqual(validateCampaign(data, catalog), []);
  assert.equal(evaluateCampaign(data).post.ready, false);
});

test("una falla P2 admite observaciones sobre 95% pero una severidad P1 detectada bloquea", () => {
  const data = completed();
  const row = data.cases.find((r) => r.id === "POST-11");
  Object.assign(row, { status: "FALLIDO", suggestion: "Corregir espaciado", owner: "QA", defectPriority: "P2" });
  assert.deepEqual(validateCampaign(data, catalog), []);
  const result = evaluateCampaign(data).post;
  assert.equal(result.ready, true);
  assert.equal(result.execution, 100);
  assert.ok(result.acceptance >= 95 && result.acceptance < 100);
  row.defectPriority = "P1";
  assert.equal(evaluateCampaign(data).post.ready, false);
});

test("bloqueados y pendientes permanecen en los denominadores; N/A sólo se excluye justificadamente", () => {
  const data = completed();
  const row = data.cases.find((r) => r.id === "POST-11");
  row.status = "PENDIENTE";
  const pending = evaluateCampaign(data).post;
  assert.equal(pending.executed, pending.applicable - 1);
  assert.ok(pending.acceptance < 100 && pending.execution < 100);
  row.status = "BLOQUEADO";
  Object.assign(row, { actual: "Navegador no disponible", suggestion: "Restaurar herramienta y repetir", owner: "QA" });
  assert.deepEqual(validateCampaign(data, catalog), []);
  assert.equal(evaluateCampaign(data).post.execution, pending.execution);
  Object.assign(row, { status: "NO_APLICA", exclusionReason: "Sin cambio de presentación" });
  assert.deepEqual(validateCampaign(data, catalog), []);
  const excluded = evaluateCampaign(data).post;
  assert.equal(excluded.excluded, 1);
  assert.equal(excluded.applicable, pending.applicable - 1);
  assert.equal(excluded.acceptance, 100);
  assert.equal(excluded.ready, true);
});

test("no se puede borrar, excluir ni degradar una compuerta base", () => {
  const missing = completed();
  missing.cases = missing.cases.filter((r) => r.id !== "PRE-01");
  assert.ok(validateCampaign(missing, catalog).some((e) => e.includes("Falta caso base PRE-01")));
  const excluded = completed();
  Object.assign(excluded.cases[0], { status: "NO_APLICA", exclusionReason: "No quiero ejecutarlo", owner: "QA" });
  assert.ok(validateCampaign(excluded, catalog).some((e) => e.includes("obligatoria")));
  excluded.cases[0].priority = "P3";
  assert.ok(validateCampaign(excluded, catalog).some((e) => e.includes("Caso base PRE-01")));
});

test("rechaza IDs duplicados, estados desconocidos y exclusiones sin responsable", () => {
  const data = completed();
  data.cases.push({ ...data.cases[0] });
  assert.ok(validateCampaign(data, catalog).some((e) => e.includes("repetido")));
  data.cases.pop();
  data.cases[0].status = "PASSED";
  assert.ok(validateCampaign(data, catalog).some((e) => e.includes("estado inválido")));
  const row = data.cases.find((r) => !r.mandatory);
  Object.assign(row, { status: "NO_APLICA", exclusionReason: "", owner: "" });
  assert.ok(validateCampaign(data, catalog).some((e) => e.includes("exclusión sin")));
});

test("una aprobación no admite evidencia faltante, fechas sin zona ni valores mal tipados", () => {
  const data = completed();
  Object.assign(data.cases[0], { evidence: [], executedAt: "2026-11-02 09:00" });
  const errors = validateCampaign(data, catalog);
  assert.ok(errors.some((e) => e.includes("requiere evidencia")));
  assert.ok(errors.some((e) => e.includes("fecha ISO")));
  data.cases[0].evidence = "archivo.log";
  assert.ok(validateCampaign(data, catalog).some((e) => e.includes("lista de referencias")));
  data.policy.minAcceptance = "95";
  assert.ok(validateCampaign(data, catalog).some((e) => e.includes("Umbrales")));
});

test("fallos o bloqueos exigen sugerencia y responsable; fallos también severidad", () => {
  for (const status of ["FALLIDO", "BLOQUEADO"]) {
    const data = completed();
    Object.assign(data.cases[0], { status, suggestion: "", owner: "" });
    assert.ok(validateCampaign(data, catalog).some((e) => e.includes("sugerencia y responsable")));
    if (status === "FALLIDO") assert.ok(validateCampaign(data, catalog).some((e) => e.includes("defectPriority")));
  }
});

test("mocks, resultados de otro ambiente/revisión o anteriores al despliegue no acreditan POST real", () => {
  const data = completed();
  const row = data.cases.find((r) => r.id === "POST-04");
  Object.assign(row, { mode: "SIMULADO", environment: "https://localhost", revision: "otra", executedAt: "2026-11-02T08:59:00-03:00" });
  const errors = validateCampaign(data, catalog);
  for (const fragment of ["requiere prueba real", "otro ambiente", "otra revisión", "posterior al despliegue"]) assert.ok(errors.some((e) => e.includes(fragment)));
});

test("imagen/revisión equivocadas y ausencia de PRE aprobado bloquean POST", () => {
  const data = completed();
  data.deployment.observedImage = `sha256:${"b".repeat(64)}`;
  data.deployment.observedRevision = "otra";
  data.cases[0].status = "PENDIENTE";
  const result = evaluateCampaign(data);
  assert.equal(result.post.ready, false);
  for (const fragment of ["imagen observada", "revisión desplegada", "fase PRE"]) assert.ok(result.post.blockers.some((e) => e.includes(fragment)));
});

test("sin casos aplicables no se aprueba y no hay NaN en porcentajes", () => {
  const data = completed();
  data.cases = [];
  const result = evaluateCampaign(data);
  assert.equal(result.pre.ready, false);
  assert.equal(result.pre.acceptance, 0);
  assert.equal(result.post.execution, 0);
});

test("el informe escapa texto del usuario sin ejecutar HTML", () => {
  const data = completed();
  data.cases[0].actual = '<script>alert("x")</script>';
  const html = renderHtml(data, evaluateCampaign(data));
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;"));
});

test("CLI genera snapshots, CSV y HTML, devuelve 1 para pendientes y preserva corridas", async () => {
  const dir = await mkdtemp(join(tmpdir(), "his-qa-check-"));
  const file = join(dir, "pauta.json");
  const output = join(dir, "corrida-01");
  const cli = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
  assert.equal(cli("init", file).status, 0);
  assert.equal(cli("init", file).status, 2);
  assert.equal(cli("report", file, output, "PRE").status, 1);
  for (const name of ["informe.html", "pauta.csv", "pauta.json", "resumen.json"]) assert.ok((await stat(join(output, name))).isFile());
  const csv = await readFile(join(output, "pauta.csv"), "utf8");
  assert.ok(csv.startsWith("\ufeff"));
  assert.ok(csv.includes('"Resultado esperado";"Resultado obtenido"'));
  assert.equal(cli("report", file, output, "PRE").status, 2);
  assert.equal(cli("report", file, join(dir, "invalid"), "OTRA").status, 2);
});
