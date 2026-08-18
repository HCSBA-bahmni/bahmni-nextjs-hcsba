import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const manifestUrl = new URL("../docs/migration/phase2-gate.json", import.meta.url);
const manifest = JSON.parse(await readFile(fileURLToPath(manifestUrl), "utf8"));
const localCriteria = Array.isArray(manifest.localCriteria) ? manifest.localCriteria : [];
const hcsbaCriteria = Array.isArray(manifest.hcsbaCriteria) ? manifest.hcsbaCriteria : [];
const pendingLocal = localCriteria.filter((criterion) => criterion.status !== "passed");
const pendingHcsba = hcsbaCriteria.filter((criterion) => criterion.status !== "passed");

process.stdout.write(`${JSON.stringify({
  gate: manifest.gate,
  evaluatedAt: manifest.evaluatedAt,
  status: manifest.status,
  campaigns: (manifest.campaigns ?? []).map((campaign) => ({ id: campaign.id, localStatus: campaign.localStatus })),
  local: { passed: localCriteria.length - pendingLocal.length, total: localCriteria.length, ready: pendingLocal.length === 0, pending: pendingLocal.map((criterion) => criterion.id) },
  hcsba: { passed: hcsbaCriteria.length - pendingHcsba.length, total: hcsbaCriteria.length, certified: pendingHcsba.length === 0, pending: pendingHcsba.map((criterion) => criterion.id) },
}, null, 2)}\n`);

if (process.argv.includes("--require-local") && pendingLocal.length > 0) {
  process.stderr.write(`Fase 2 local incompleta: faltan ${pendingLocal.length} criterios.\n`);
  process.exitCode = 1;
}
if (process.argv.includes("--require-hcsba") && pendingHcsba.length > 0) {
  process.stderr.write(`Fase 2 no puede declararse certificada en HCSBA: faltan ${pendingHcsba.length} criterios institucionales.\n`);
  process.exitCode = 1;
}
