import { mergeConfig, mergeExtensions, shouldOverrideConfig, type JsonObject } from "@/config-compat/merge";
import type { AppExtension } from "@/types/bahmni";
import { flattenFormTranslations } from "@/config-compat/formTranslations";

const baseConfig = process.env.NEXT_PUBLIC_CONFIG_BASE ?? "/bahmni_config/openmrs/apps";
const implementationConfig = process.env.NEXT_PUBLIC_IMPLEMENTATION_CONFIG_BASE ?? "/implementation_config/openmrs/apps";
const bundledI18n = process.env.NEXT_PUBLIC_BUNDLED_I18N_BASE ?? "/bahmni/i18n";
const baseI18n = process.env.NEXT_PUBLIC_I18N_BASE ?? "/bahmni_config/openmrs/i18n";
const implementationI18n = process.env.NEXT_PUBLIC_IMPLEMENTATION_I18N_BASE ?? "/implementation_config/openmrs/i18n";

async function getJson(path: string, optional = false): Promise<JsonObject> {
  const response = await fetch(path, { credentials: "include", cache: "no-store" });
  if (optional && response.status === 404) return {};
  if (!response.ok) throw new Error(`No se pudo cargar configuración: ${path} (${response.status})`);
  return await response.json() as JsonObject;
}

export async function loadAppConfig(app: string): Promise<JsonObject> {
  const [standard, custom] = await Promise.all([
    getJson(`${baseConfig}/${app}/app.json`),
    getJson(`${implementationConfig}/${app}/app.json`, true),
  ]);
  return shouldOverrideConfig(custom) ? custom : mergeConfig(standard, custom);
}

export async function loadAppFile(app: string, fileName: string): Promise<JsonObject> {
  if (!/^[A-Za-z0-9._-]+\.json$/.test(fileName)) throw new Error("Nombre de archivo de configuración no permitido.");
  const [standard, custom] = await Promise.all([
    getJson(`${baseConfig}/${app}/${fileName}`),
    getJson(`${implementationConfig}/${app}/${fileName}`, true),
  ]);
  return shouldOverrideConfig(custom) ? custom : mergeConfig(standard, custom);
}

export async function loadAppTextAsset(app: string, fileName: string): Promise<string> {
  if (!/^[A-Za-z0-9._-]+\.(?:csv|txt)$/.test(fileName)) throw new Error("Nombre de recurso de configuración no permitido.");
  const custom = await fetch(`${implementationConfig}/${app}/${fileName}`, { credentials: "include", cache: "no-store" });
  if (custom.ok) return custom.text();
  if (custom.status !== 404) throw new Error(`No se pudo cargar configuración: ${fileName} (${custom.status})`);
  const standard = await fetch(`${baseConfig}/${app}/${fileName}`, { credentials: "include", cache: "no-store" });
  if (!standard.ok) throw new Error(`No se pudo cargar configuración: ${fileName} (${standard.status})`);
  return standard.text();
}

export async function loadExtensions(app: string): Promise<AppExtension[]> {
  const [standard, custom] = await Promise.all([
    getJson(`${baseConfig}/${app}/extension.json`, true),
    getJson(`${implementationConfig}/${app}/extension.json`, true),
  ]);
  const merged = mergeExtensions(standard, custom);
  const extensions: AppExtension[] = Object.entries(merged).map(([id, value]) => ({ id, ...(value as Omit<AppExtension, "id">) }));
  return extensions.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export async function loadWhiteLabel(): Promise<JsonObject> {
  const [standard, custom] = await Promise.all([
    getJson(`${baseConfig}/home/whiteLabel.json`, true),
    getJson(`${implementationConfig}/home/whiteLabel.json`, true),
  ]);
  return mergeConfig(standard, custom);
}

export async function loadLocaleLanguages(): Promise<JsonObject> {
  return getJson(`${baseConfig}/home/locale_languages.json`, true);
}

export async function loadLoginConfig(): Promise<JsonObject> {
  const [standard, custom] = await Promise.all([
    getJson(`${baseConfig}/home/login_config.json`, true),
    getJson(`${implementationConfig}/home/login_config.json`, true),
  ]);
  return shouldOverrideConfig(custom) ? custom : mergeConfig(standard, custom);
}

function stringTranslations(source: JsonObject): Record<string, string> {
  return Object.fromEntries(Object.entries(source).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

export async function loadTranslations(app: string, locale: string): Promise<Record<string, string>> {
  const safeLocale = /^[a-z]{2}(?:[-_][A-Za-z]{2})?$/.test(locale) ? locale : "es";
  const [bundled, standard, custom] = await Promise.all([
    getJson(`${bundledI18n}/${app}/locale_${safeLocale}.json`, true),
    getJson(`${baseI18n}/${app}/locale_${safeLocale}.json`, true),
    getJson(`${implementationI18n}/${app}/locale_${safeLocale}.json`, true),
  ]);
  return { ...stringTranslations(bundled), ...stringTranslations(standard), ...stringTranslations(custom) };
}

export async function loadFormTranslationOverrides(formUuid: string, locale: string): Promise<Record<string, string>> {
  const safeUuid = /^[A-Za-z0-9-]+$/.test(formUuid) ? formUuid : "invalid";
  const safeLocale = /^[a-z]{2}(?:[-_][A-Za-z]{2})?$/.test(locale) ? locale : "es";
  const language = safeLocale.replace("-", "_").split("_")[0] ?? safeLocale;
  const locales = [...new Set([language, safeLocale])];
  const sources = await Promise.all(locales.map(async (candidate) => {
    const relativePath = `forms/${safeUuid}/locale_${candidate}.json`;
    const [bundled, standard, custom] = await Promise.all([
      getJson(`${bundledI18n}/${relativePath}`, true),
      getJson(`${baseI18n}/${relativePath}`, true),
      getJson(`${implementationI18n}/${relativePath}`, true),
    ]);
    return {
      ...flattenFormTranslations(bundled, candidate),
      ...flattenFormTranslations(standard, candidate),
      ...flattenFormTranslations(custom, candidate),
    };
  }));
  return Object.assign({}, ...sources) as Record<string, string>;
}
