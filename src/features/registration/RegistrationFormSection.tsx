import Cookies from "js-cookie";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { Form2Renderer } from "@/features/forms/Form2Renderer";
import { form2DefinitionSchema, type Form2Observation } from "@/features/forms/form2";
import { getFormDefinition, getFormTranslations, type PublishedForm } from "@/services/bahmni/forms";
import { RegistrationLatestObservations } from "./RegistrationLatestObservations";

interface Props {
  form: PublishedForm;
  patientUuid: string;
  observations: Array<Record<string, unknown>>;
  latest?: { show: boolean; conceptNames: string[] };
  onChange(key: string, observations: Form2Observation[], valid: boolean): void;
}

export function publishedFormIdentity(form: PublishedForm) {
  return {
    uuid: form.formUuid ?? form.uuid ?? "",
    name: form.formName ?? form.name ?? "Formulario",
    version: String(form.formVersion ?? form.version ?? "1"),
  };
}

export function RegistrationFormSection({ form, patientUuid, observations, latest, onChange }: Props) {
  const identity = publishedFormIdentity(form);
  const locale = Cookies.get("bahmni.locale") ?? "es";
  const definition = useQuery({ queryKey: ["form-definition", identity.uuid], queryFn: async () => form2DefinitionSchema.parse(await getFormDefinition(identity.uuid)), enabled: Boolean(identity.uuid) });
  const translations = useQuery({ queryKey: ["form-translations", identity.uuid, identity.version, locale], queryFn: () => getFormTranslations({ formName: identity.name, formVersion: identity.version, locale, formUuid: identity.uuid }), enabled: Boolean(identity.uuid) });
  const report = useCallback((formObservations: Form2Observation[], valid: boolean) => onChange(identity.uuid, formObservations, valid), [identity.uuid, onChange]);
  const parsed = useMemo(() => definition.data ? { ...definition.data, version: identity.version } : undefined, [definition.data, identity.version]);

  if (definition.isLoading) return <section className="panel"><p role="status">Cargando {identity.name}…</p></section>;
  if (definition.isError || !parsed) return <section className="panel"><p role="alert" className="error-banner">No fue posible cargar la definición publicada de {identity.name}.</p></section>;
  return <section className="panel registration-dynamic-form"><h2>{translations.data?.FORM_NAME ?? identity.name}</h2><div className={`registration-form-workspace${latest?.show ? " has-latest" : ""}`}><Form2Renderer definition={parsed} observations={observations} translations={translations.data} onChange={report} />{latest?.show && <RegistrationLatestObservations patientUuid={patientUuid} conceptNames={latest.conceptNames} />}</div></section>;
}
