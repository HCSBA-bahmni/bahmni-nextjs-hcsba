import fs from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const workspaceRoot = path.dirname(projectRoot);
const legacyRoot = process.env.LEGACY_BAHMNI_ROOT ?? path.join(workspaceRoot, "openmrs-module-bahmniapps-hcsba-2024");
const configRoot = process.env.HCSBA_CONFIG_ROOT ?? path.join(workspaceRoot, "standard-config-HCSBA", "openmrs", "apps");
const configI18nRoot = path.join(path.dirname(configRoot), "i18n");
const outputPath = path.join(projectRoot, "docs", "legacy-inventory.generated.json");

function filesBelow(root, predicate = () => true) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) return filesBelow(absolute, predicate);
    return predicate(absolute) ? [absolute] : [];
  });
}

const relative = (root, file) => path.relative(root, file).replaceAll("\\", "/");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const slug = (value) => value.replace(/\.spec\.js$/, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
const unique = (values) => [...new Set(values)].sort();
function translationMetadata(file) {
  const source = fs.readFileSync(file, "utf8");
  try { return { keys: Object.keys(JSON.parse(source)).length, malformed: false }; }
  catch { return { keys: [...source.matchAll(/^\s*"[^"]+"\s*:/gm)].length, malformed: true }; }
}

function configuredUrls(value, prefix = "") {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap((entry, index) => configuredUrls(entry, `${prefix}[${index}]`));
  return Object.entries(value).flatMap(([key, entry]) => {
    const pathName = prefix ? `${prefix}.${key}` : key;
    if (/url/i.test(key) && typeof entry === "string") return [{ key: pathName, value: entry }];
    return configuredUrls(entry, pathName);
  });
}

if (!fs.existsSync(legacyRoot) || !fs.existsSync(configRoot)) {
  if (process.argv.includes("--check") && fs.existsSync(outputPath)) {
    const generated = readJson(outputPath);
    if (generated.schemaVersion !== 2 || generated.totals?.legacyUnitSpecs !== 293 || !Array.isArray(generated.contracts?.endpointConstants)) {
      throw new Error("El inventario generado no cumple el contrato transversal esperado.");
    }
    process.stdout.write("Referencias externas no disponibles; inventario generado validado estructuralmente.\n");
    process.exit(0);
  }
  throw new Error(`No se encontraron las referencias legacy/config. Legacy=${legacyRoot}; config=${configRoot}`);
}

const angularAppRoot = path.join(legacyRoot, "ui", "app");
const unitRoot = path.join(legacyRoot, "ui", "test", "unit");
const moduleNames = fs.readdirSync(angularAppRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && !["components", "i18n", "images", "lib", "styles", "micro-frontends-dist"].includes(entry.name))
  .map((entry) => entry.name)
  .sort();

const modules = moduleNames.map((moduleName) => {
  const moduleRoot = path.join(angularAppRoot, moduleName);
  const js = filesBelow(moduleRoot, (file) => file.endsWith(".js"));
  const templates = filesBelow(moduleRoot, (file) => file.endsWith(".html"));
  const appFile = path.join(moduleRoot, "app.js");
  const appSource = fs.existsSync(appFile) ? fs.readFileSync(appFile, "utf8") : "";
  const states = [...appSource.matchAll(/\.state\(\s*['"]([^'"]+)['"]/g)].map((match) => match[1]).sort();
  return { module: moduleName, javascriptFiles: js.length, templateFiles: templates.length, states };
});

const specs = filesBelow(unitRoot, (file) => file.endsWith(".spec.js")).map((file) => {
  const legacyPath = relative(legacyRoot, file);
  const unitRelative = relative(unitRoot, file);
  const moduleName = unitRelative.split("/")[0];
  return {
    legacyPath,
    module: moduleName,
    disposition: "port",
    status: "inventoried",
    targetSuite: `src/characterization/${moduleName}/${slug(unitRelative)}.test.ts`,
  };
}).sort((a, b) => a.legacyPath.localeCompare(b.legacyPath));

const configuredApps = fs.readdirSync(configRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort().map((app) => {
  const appRoot = path.join(configRoot, app);
  const appConfigPath = path.join(appRoot, "app.json");
  const extensionPath = path.join(appRoot, "extension.json");
  const appConfig = fs.existsSync(appConfigPath) ? readJson(appConfigPath) : {};
  const extensions = fs.existsSync(extensionPath) ? readJson(extensionPath) : {};
  return {
    app,
    configKeys: Object.keys(appConfig.config ?? {}).sort(),
    configuredUrls: configuredUrls(appConfig.config ?? {}),
    extensions: Object.entries(extensions).map(([id, value]) => ({
      id,
      extensionPointId: value.extensionPointId ?? null,
      type: value.type ?? null,
      requiredPrivilege: value.requiredPrivilege ?? null,
      translationKey: value.translationKey ?? null,
      url: value.url ?? null,
      order: value.order ?? null,
    })).sort((a, b) => a.id.localeCompare(b.id)),
  };
});

const configurableScripts = filesBelow(configRoot, (file) => file.endsWith(".js")).map((file) => relative(configRoot, file)).sort();
const configuredTemplates = filesBelow(configRoot, (file) => file.endsWith(".html")).map((file) => relative(configRoot, file)).sort();
const microFrontendFiles = filesBelow(path.join(legacyRoot, "micro-frontends", "src"), (file) => /\.(js|jsx)$/.test(file)).map((file) => relative(legacyRoot, file)).sort();
const legacyJavaScript = filesBelow(angularAppRoot, (file) => file.endsWith(".js")).map((file) => fs.readFileSync(file, "utf8")).join("\n");
const constantsSource = fs.readFileSync(path.join(angularAppRoot, "common", "constants.js"), "utf8");
const endpointConstants = [...constantsSource.matchAll(/^\s*([A-Za-z0-9_]*(?:Url|URL)):\s*([^,\n]+),?/gm)].map((match) => ({ name: match[1], expression: match[2].trim() })).sort((a, b) => a.name.localeCompare(b.name));
const configuredPrivileges = configuredApps.flatMap((app) => app.extensions.flatMap((extension) => Array.isArray(extension.requiredPrivilege) ? extension.requiredPrivilege : extension.requiredPrivilege ? [extension.requiredPrivilege] : []));
const literalPrivileges = [...legacyJavaScript.matchAll(/(?:hasPrivilege|privileges?\.includes|privileges?\.indexOf)\(\s*['"]([^'"]+)['"]/g)].map((match) => match[1]);
const privileges = unique([...configuredPrivileges, ...literalPrivileges]);
const translationFiles = [
  ...filesBelow(path.join(angularAppRoot, "i18n"), (file) => /locale_[^/\\]+\.json$/.test(file)),
  ...filesBelow(configI18nRoot, (file) => /locale_[^/\\]+\.json$/.test(file)),
];
const translations = translationFiles.map((file) => {
  const root = file.startsWith(configI18nRoot) ? configI18nRoot : path.join(angularAppRoot, "i18n");
  const source = file.startsWith(configI18nRoot) ? "standard-config" : "legacy-bundled";
  return { source, path: relative(root, file), ...translationMetadata(file) };
}).sort((a, b) => `${a.source}/${a.path}`.localeCompare(`${b.source}/${b.path}`));

const inventory = {
  schemaVersion: 2,
  precedence: ["HCSBA development", "HCSBA remote", "local reference"],
  modules,
  configuredApps,
  configurableScripts,
  configuredTemplates,
  microFrontends: { sourceFiles: microFrontendFiles },
  contracts: { endpointConstants, privileges, translations },
  legacyTests: specs,
  totals: {
    angularModules: modules.length,
    angularStates: modules.reduce((total, module) => total + module.states.length, 0),
    configuredApps: configuredApps.length,
    configurableScripts: configurableScripts.length,
    configuredTemplates: configuredTemplates.length,
    microFrontendSourceFiles: microFrontendFiles.length,
    legacyUnitSpecs: specs.length,
    endpointConstants: endpointConstants.length,
    privileges: privileges.length,
    translationFiles: translations.length,
  },
};

const serialized = `${JSON.stringify(inventory, null, 2)}\n`;
if (process.argv.includes("--check")) {
  if (!fs.existsSync(outputPath) || fs.readFileSync(outputPath, "utf8") !== serialized) {
    throw new Error("El inventario legacy está desactualizado. Ejecute npm run inventory:legacy");
  }
} else {
  fs.writeFileSync(outputPath, serialized, "utf8");
  process.stdout.write(`Inventario generado: ${outputPath}\n`);
}
