import Cookies from "js-cookie";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { loadTranslations } from "@/services/bahmni/config";

export function useHomeTranslations() {
  const { i18n } = useTranslation();
  const locale = Cookies.get("bahmni.locale") ?? i18n.resolvedLanguage ?? "es";
  const query = useQuery({
    queryKey: ["translations", "home", locale],
    queryFn: () => loadTranslations("home", locale),
  });

  useEffect(() => {
    if (!query.data) return;
    i18n.addResourceBundle(locale, "translation", query.data, true, true);
    void i18n.changeLanguage(locale);
  }, [i18n, locale, query.data]);

  return query;
}
