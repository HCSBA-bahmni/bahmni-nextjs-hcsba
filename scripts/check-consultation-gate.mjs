import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const manifestUrl = new URL("../docs/migration/clinical-consultation/activation-gate.json", import.meta.url);
const manifest = JSON.parse(await readFile(fileURLToPath(manifestUrl), "utf8"));
const criteria = Array.isArray(manifest.criteria) ? manifest.criteria : [];
const pending = criteria.filter((criterion) => criterion.status !== "passed");

process.stdout.write(`${JSON.stringify({
  gate: manifest.gate,
  evaluatedAt: manifest.evaluatedAt,
  passed: criteria.length - pending.length,
  total: criteria.length,
  readyToEnable: pending.length === 0,
  pending: pending.map((criterion) => criterion.id),
}, null, 2)}\n`);

if (process.argv.includes("--require-ready") && pending.length > 0) {
  process.stderr.write(`Consulta no puede habilitarse: faltan ${pending.length} criterios de certificación.\n`);
  process.exitCode = 1;
}
