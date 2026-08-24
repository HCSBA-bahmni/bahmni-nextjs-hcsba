import { access, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const catalogPath = path.join(root, "docs", "architecture", "backend-flow-catalog.json");
const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
const errors = [];

if (catalog.schemaVersion !== 1) errors.push("schemaVersion must be 1");
if (!Array.isArray(catalog.flows) || catalog.flows.length === 0) errors.push("flows must not be empty");
if (!Array.isArray(catalog.directDataAccess) || catalog.directDataAccess.length === 0) errors.push("directDataAccess must not be empty");

const ensureUnique = (items, label) => {
  const ids = items.map((item) => item.id);
  const duplicate = ids.find((id, index) => ids.indexOf(id) !== index);
  if (duplicate) errors.push(`${label} contains duplicate id ${duplicate}`);
};

ensureUnique(catalog.flows ?? [], "flows");
ensureUnique(catalog.directDataAccess ?? [], "directDataAccess");

const evidence = [
  ...(catalog.flows ?? []).flatMap((flow) => flow.localEvidence ?? []),
  ...(catalog.directDataAccess ?? []).flatMap((entry) => entry.localEvidence ?? []),
];

for (const relativePath of [...new Set(evidence)]) {
  try {
    await access(path.resolve(root, relativePath));
  } catch {
    errors.push(`missing evidence: ${relativePath}`);
  }
}

for (const flow of catalog.flows ?? []) {
  if (!flow.menus?.length) errors.push(`${flow.id}: menus must not be empty`);
  if (!flow.backendHops?.length) errors.push(`${flow.id}: backendHops must not be empty`);
  for (const hop of flow.backendHops ?? []) {
    if (!hop.kind || !hop.owner || !hop.endpoints?.length || !hop.dataStores?.length) {
      errors.push(`${flow.id}: incomplete backend hop for ${hop.owner ?? "unknown owner"}`);
    }
    if (!catalog.confidenceLevels?.[hop.confidence]) errors.push(`${flow.id}: invalid confidence ${hop.confidence}`);
  }
}

for (const entry of catalog.directDataAccess ?? []) {
  if (typeof entry.bypassesOpenmrsApi !== "boolean") errors.push(`${entry.id}: bypassesOpenmrsApi must be boolean`);
  if (!catalog.confidenceLevels?.[entry.confidence]) errors.push(`${entry.id}: invalid confidence ${entry.confidence}`);
}

const output = {
  catalog: path.relative(root, catalogPath),
  flows: catalog.flows?.length ?? 0,
  backendHops: (catalog.flows ?? []).reduce((total, flow) => total + (flow.backendHops?.length ?? 0), 0),
  directDataPaths: catalog.directDataAccess?.length ?? 0,
  apiBypasses: (catalog.directDataAccess ?? []).filter((entry) => entry.bypassesOpenmrsApi).length,
  evidenceFiles: new Set(evidence).size,
  valid: errors.length === 0,
  errors,
};

console.log(JSON.stringify(output, null, 2));
if (errors.length) process.exitCode = 1;
