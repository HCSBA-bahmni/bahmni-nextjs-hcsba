import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AutoComplete, type AutoCompleteCompleteEvent } from "primereact/autocomplete";
import { Button } from "primereact/button";
import { Controller, useForm } from "react-hook-form";
import { IconField } from "primereact/iconfield";
import { InputIcon } from "primereact/inputicon";
import { InputTextarea } from "primereact/inputtextarea";
import { MultiSelect } from "primereact/multiselect";
import { RadioButton } from "primereact/radiobutton";
import { Sidebar } from "primereact/sidebar";
import { Tag } from "primereact/tag";
import { Toast } from "primereact/toast";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import type { ClinicalDashboardSection } from "@/config-compat/clinicalConfig";
import { loadAppConfig } from "@/services/bahmni/config";
import {
  allergyConceptMapSchema,
  getAllergyCatalogs,
  savePatientAllergy,
  type AllergenOption,
} from "@/services/bahmni/allergies";
import type { ClinicalDashboardContext } from "../dashboardContext";

const formSchema = z.object({
  reactionUuids: z.array(z.string()).min(1, "Seleccione al menos una reacción."),
  severityUuid: z.string().min(1, "Seleccione la severidad."),
  comment: z.string().optional(),
});
type FormValues = z.infer<typeof formSchema>;

function configuredConceptMap(value: unknown) {
  const root = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const config = root.config && typeof root.config === "object" && !Array.isArray(root.config) ? root.config as Record<string, unknown> : root;
  return allergyConceptMapSchema.parse(config.allergyControlConceptIdMap);
}

function normalized(value: string) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

export function filterAllergens(allergens: AllergenOption[], query: string): AllergenOption[] {
  const needle = normalized(query.trim());
  if (!needle) return allergens;
  const matches = (item: AllergenOption) => [item.name, item.kind].some((value) => normalized(value).includes(needle));
  const begins = (item: AllergenOption) => [item.name, item.kind].some((value) => normalized(value).startsWith(needle));
  return [...allergens.filter((item) => begins(item)), ...allergens.filter((item) => matches(item) && !begins(item))];
}

const kindLabels: Record<AllergenOption["kind"], string> = {
  Drug: "Medicamento",
  Food: "Alimento",
  Environment: "Ambiente",
};

export function AllergyHeaderAction({ context }: { section: ClinicalDashboardSection; context: ClinicalDashboardContext }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const toast = useRef<Toast>(null);
  const [visible, setVisible] = useState(false);
  const [allergenInput, setAllergenInput] = useState<string | AllergenOption>("");
  const [selectedAllergen, setSelectedAllergen] = useState<AllergenOption | null>(null);
  const [allergenSuggestions, setAllergenSuggestions] = useState<AllergenOption[]>([]);
  const activeVisit = context.visits.find((visit) => !visit.stopDatetime);
  const appConfig = useQuery({
    queryKey: ["app-config", "clinical"],
    queryFn: () => loadAppConfig("clinical"),
    enabled: visible,
  });
  const conceptMap = useMemo(() => {
    if (!appConfig.data) return undefined;
    try { return configuredConceptMap(appConfig.data); } catch { return undefined; }
  }, [appConfig.data]);
  const catalogs = useQuery({
    queryKey: ["clinical", "allergy-catalogs", context.locale, conceptMap],
    queryFn: () => getAllergyCatalogs(conceptMap!, context.locale),
    enabled: visible && Boolean(conceptMap),
    staleTime: 30 * 60 * 1000,
  });
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    mode: "onChange",
    defaultValues: { reactionUuids: [], severityUuid: "", comment: "" },
  });
  const save = useMutation({
    mutationFn: (values: FormValues) => savePatientAllergy(context.patient.uuid, { allergen: selectedAllergen!, ...values }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["clinical-dashboard", "allergy", context.patient.uuid] });
      close();
      toast.current?.show({ severity: "success", summary: t("ALLERGY_SAVED_SUCCESSFULLY", { defaultValue: "Alergia guardada correctamente" }), life: 3500 });
    },
    onError: () => toast.current?.show({ severity: "error", summary: t("ERROR_SAVING_ALLERGY", { defaultValue: "No fue posible guardar la alergia" }), life: 5000 }),
  });

  function clearSelection() {
    setAllergenInput("");
    setSelectedAllergen(null);
    setAllergenSuggestions([]);
    form.reset({ reactionUuids: [], severityUuid: "", comment: "" });
  }
  function close() {
    setVisible(false);
    clearSelection();
  }
  function completeAllergen(event: AutoCompleteCompleteEvent) {
    setAllergenSuggestions(filterAllergens(catalogs.data?.allergens ?? [], event.query));
  }

  if (!activeVisit) return null;
  const loading = appConfig.isLoading || catalogs.isLoading;
  const configMissing = appConfig.isSuccess && !conceptMap;
  const error = appConfig.error ?? catalogs.error;
  const kindTemplate = (option: AllergenOption) => <div className="allergy-option"><span>{option.name}</span><Tag value={kindLabels[option.kind]} /></div>;

  return <>
    <Toast ref={toast} position="top-right" />
    <Button className="allergy-add-button" text icon="pi pi-plus" label={t("ADD_BUTTON_TEXT", { defaultValue: "Añadir" })} onClick={() => setVisible(true)} />
    <Sidebar visible={visible} position="right" className="allergy-sidebar" header={t("ALLERGIES_HEADING", { defaultValue: "Alergias y reacciones" })} onHide={close}>
      {loading && <div className="allergy-sidebar-state" role="status"><i className="pi pi-spin pi-spinner" /><span>{t("LOADING_MESSAGE", { defaultValue: "Cargando catálogos…" })}</span></div>}
      {(error || configMissing) && <div className="error-banner" role="alert">{configMissing ? "La configuración allergyControlConceptIdMap está incompleta." : "No fue posible cargar los catálogos configurados de alergias."}</div>}
      {!loading && !error && !configMissing && !selectedAllergen && <section className="allergy-step">
        <div><h3>{t("SEARCH_ALLERGEN", { defaultValue: "Buscar alérgeno" })}</h3><p className="muted-text">Busque por nombre o por tipo configurado.</p></div>
        <IconField iconPosition="left" className="allergy-search">
          <InputIcon className="pi pi-search" />
          <AutoComplete inputId="allergen-search" value={allergenInput} suggestions={allergenSuggestions} completeMethod={completeAllergen} field="name" itemTemplate={kindTemplate} dropdown forceSelection placeholder={t("SEARCH_ALLERGEN", { defaultValue: "Buscar alérgeno" })} onChange={(event) => setAllergenInput(event.value as string | AllergenOption)} onSelect={(event) => { const option = event.value as AllergenOption; setAllergenInput(option); setSelectedAllergen(option); }} />
        </IconField>
        {(catalogs.data?.allergens.length ?? 0) === 0 && <p className="muted-text">No hay alérgenos configurados.</p>}
      </section>}
      {!loading && selectedAllergen && <form className="allergy-form" onSubmit={form.handleSubmit((values) => save.mutate(values))}>
        <Button type="button" text icon="pi pi-arrow-left" label={t("BACK_TO_ALLERGEN", { defaultValue: "Volver a alérgenos" })} onClick={clearSelection} />
        <div className="allergy-selected"><span>{selectedAllergen.name}</span><Tag value={kindLabels[selectedAllergen.kind]} /></div>
        <Controller name="reactionUuids" control={form.control} render={({ field, fieldState }) => <div className="field"><label htmlFor="allergy-reactions">{t("REACTIONS", { defaultValue: "Reacciones" })} <span className="form2-required">*</span></label><MultiSelect inputId="allergy-reactions" value={field.value} options={catalogs.data?.reactions ?? []} optionLabel="name" optionValue="uuid" filter display="chip" placeholder="Seleccione una o más reacciones" onChange={(event) => field.onChange(event.value ?? [])} />{fieldState.error && <small className="field-error">{fieldState.error.message}</small>}</div>} />
        <Controller name="severityUuid" control={form.control} render={({ field, fieldState }) => <fieldset className="allergy-severity"><legend>{t("SEVERITY", { defaultValue: "Severidad" })} <span className="form2-required">*</span></legend>{(catalogs.data?.severities ?? []).map((option) => <label key={option.uuid}><RadioButton inputId={`severity-${option.uuid}`} value={option.uuid} checked={field.value === option.uuid} onChange={(event) => field.onChange(event.value)} /><span>{option.name}</span></label>)}{fieldState.error && <small className="field-error">{fieldState.error.message}</small>}</fieldset>} />
        <Controller name="comment" control={form.control} render={({ field }) => <div className="field"><label htmlFor="allergy-comment">{t("NOTES", { defaultValue: "Comentarios" })}</label><InputTextarea id="allergy-comment" value={field.value ?? ""} rows={4} autoResize placeholder={t("ALLERGY_COMMENT_PLACEHOLDER", { defaultValue: "Comentarios adicionales, como la fecha de inicio, etc." })} onChange={field.onChange} /></div>} />
        {save.isError && <div className="error-banner" role="alert">No fue posible guardar la alergia. Los datos permanecen en el formulario.</div>}
        <footer className="allergy-sidebar-actions"><Button type="button" outlined label={t("CLOSE", { defaultValue: "Cerrar" })} onClick={close} /><Button type="submit" icon="pi pi-save" label={t("SAVE", { defaultValue: "Guardar" })} loading={save.isPending} disabled={!form.formState.isValid || !selectedAllergen} /></footer>
      </form>}
    </Sidebar>
  </>;
}
