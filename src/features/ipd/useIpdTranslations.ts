import Cookies from "js-cookie";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { loadTranslations } from "@/services/bahmni/config";

export function useIpdTranslations() {
  const { i18n } = useTranslation();
  const locale = Cookies.get("bahmni.locale") ?? i18n.resolvedLanguage ?? "es";
  const language = locale.replace("-", "_").split("_")[0] ?? "es";
  const query = useQuery({
    queryKey: ["translations", "ipd-context", language, locale],
    queryFn: async () => {
      // Legacy IPD registers common, clinical and ADT locales before its own
      // bundle. IPD remains the last writer and therefore keeps precedence.
      // HCSBA ships locale_es.json while the session may expose es_CL. Load
      // the language fallback first and let a regional override win if it
      // exists, matching Angular translate's fallback behavior.
      const locales = [...new Set([language, locale])];
      const bundles = await Promise.all(locales.map(async (candidate) => {
        const [common, clinical, adt, ipd] = await Promise.all([
          loadTranslations("common", candidate),
          loadTranslations("clinical", candidate),
          loadTranslations("adt", candidate),
          loadTranslations("ipd", candidate),
        ]);
        return { ...common, ...clinical, ...adt, ...ipd };
      }));
      return Object.assign({}, ...bundles) as Record<string, string>;
    },
  });

  useEffect(() => {
    if (!query.data) return;
    i18n.addResourceBundle(locale, "translation", query.data, true, true);
    void i18n.changeLanguage(locale);
  }, [i18n, locale, query.data]);

  return query;
}
