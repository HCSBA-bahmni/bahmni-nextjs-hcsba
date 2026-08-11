import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "primereact/button";
import { Calendar } from "primereact/calendar";
import { ConfirmDialog, confirmDialog } from "primereact/confirmdialog";
import { InputText } from "primereact/inputtext";
import { SelectButton } from "primereact/selectbutton";
import { getBacteriologyConceptSet } from "@/services/bahmni/consultation";
import {
  bacteriologyConceptSetByClass,
  bacteriologySampleOptions,
  isOtherSpecimenType,
} from "../bacteriology";
import { useConsultation } from "../ConsultationContext";
import type { ConsultationSpecimen } from "../types";
import { BacteriologyConceptSetEditor } from "./BacteriologyConceptSetEditor";
import { clientId, localDate } from "./shared";

function blankSpecimen(): ConsultationSpecimen {
  return { clientId: clientId("specimen"), dirty: false };
}

function specimenDate(value: string | undefined, locale: string, timeZone: string): string {
  if (!value) return "Fecha no informada";
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale || "es", { dateStyle: "medium", timeZone }).format(date);
}

function specimenName(specimen: ConsultationSpecimen): string {
  if (isOtherSpecimenType(specimen)) return specimen.typeFreeText?.trim() || "Other";
  return specimen.type?.name ?? specimen.type?.display ?? "Muestra";
}

export function BacteriologyBoard() {
  const { context, draft, updateDraft } = useConsultation();
  const config = useQuery({ queryKey: ["consultation-bacteriology-config"], queryFn: getBacteriologyConceptSet });
  const options = useMemo(() => bacteriologySampleOptions(config.data), [config.data]);
  const additionalAttributesConcept = bacteriologyConceptSetByClass(config.data, "Bacteriology Attributes");
  const resultsConcept = bacteriologyConceptSetByClass(config.data, "Bacteriology Results");

  useEffect(() => {
    if (draft.specimens.some((item) => !item.voided && !item.uuid)) return;
    updateDraft((current) => current.specimens.some((item) => !item.voided && !item.uuid)
      ? current
      : { ...current, specimens: [...current.specimens, blankSpecimen()] });
  }, [draft.specimens, updateDraft]);

  const patch = (id: string, value: Partial<ConsultationSpecimen>) => updateDraft((current) => ({
    ...current,
    specimens: current.specimens.map((item) => item.clientId === id ? { ...item, ...value, dirty: true } : item),
  }), "bacteriology");

  const add = () => updateDraft((current) => ({ ...current, specimens: [...current.specimens, blankSpecimen()] }));

  const remove = (specimen: ConsultationSpecimen) => confirmDialog({
    header: specimen.uuid ? "Anular muestra" : "Limpiar muestra",
    message: specimen.uuid
      ? "Se anulará la muestra y se limpiarán sus atributos y resultados. ¿Desea continuar?"
      : "Se descartarán los datos ingresados para esta muestra. ¿Desea continuar?",
    icon: "pi pi-exclamation-triangle",
    acceptLabel: "Continuar",
    rejectLabel: "Cancelar",
    acceptClassName: specimen.uuid ? "p-button-danger" : undefined,
    accept: () => {
      updateDraft((current) => ({
        ...current,
        specimens: specimen.uuid
          ? current.specimens.map((item) => item.clientId === specimen.clientId ? { ...item, voided: true, dirty: true } : item)
          : current.specimens.filter((item) => item.clientId !== specimen.clientId),
      }), specimen.uuid ? "bacteriology" : undefined);
    },
  });

  if (context.mode === "retrospective") return <p className="warning-banner">Bacteriología no está disponible en entradas retrospectivas.</p>;

  const active = draft.specimens.filter((item) => !item.voided);
  const editors = active.filter((item) => !item.uuid || item.editing);
  const saved = active.filter((item) => item.uuid && !item.editing);
  const configUnavailable = config.isError || (!config.isLoading && !config.data);

  return <div className="consultation-board-stack bacteriology-board">
    <ConfirmDialog />
    {configUnavailable && <p role="alert" className="error-banner">No fue posible cargar BACTERIOLOGY CONCEPT SET. Reintente antes de registrar una muestra.</p>}
    {!configUnavailable && !config.isLoading && options.length === 0 && <p role="alert" className="warning-banner">La configuración no contiene respuestas para Specimen Sample Source.</p>}
    {editors.map((specimen) => <section className="consultation-subsection bacteriology-editor" key={specimen.clientId}>
      <header>
        <h2>Detalles de la muestra</h2>
        <div className="bacteriology-editor-actions">
          <Button type="button" size="small" label="Añadir muestra" icon="pi pi-plus" onClick={add} />
          <Button type="button" size="small" outlined severity="secondary" label="Limpiar" onClick={() => remove(specimen)} />
        </div>
      </header>
      {config.isLoading && <p className="consultation-form-loading" role="status"><i className="pi pi-spin pi-spinner" /> Cargando configuración de Bacteriología…</p>}
      <div className="bacteriology-primary-fields">
        <label htmlFor={`specimen-date-${specimen.clientId}`}>Fecha de recolección de la muestra <span aria-hidden="true">*</span></label>
        <Calendar inputId={`specimen-date-${specimen.clientId}`} value={specimen.dateCollected ? new Date(`${specimen.dateCollected}T00:00:00`) : null} dateFormat="dd/mm/yy" showIcon maxDate={new Date()} onChange={(event) => patch(specimen.clientId, { dateCollected: localDate(event.value instanceof Date ? event.value : null) })} />

        <span className="field-label" id={`specimen-type-${specimen.clientId}`}>Tipo de muestra <span aria-hidden="true">*</span></span>
        <SelectButton aria-labelledby={`specimen-type-${specimen.clientId}`} value={specimen.type?.uuid ?? null} options={options.map((option) => ({ label: option.label, value: option.value.uuid }))} optionLabel="label" optionValue="value" allowEmpty={false} disabled={configUnavailable || config.isLoading || options.length === 0} onChange={(event) => {
          const type = options.find((option) => option.value.uuid === event.value)?.value;
          patch(specimen.clientId, { type, ...((type?.name ?? type?.display ?? "").toLocaleLowerCase() === "other" ? {} : { typeFreeText: undefined }) });
        }} />

        {isOtherSpecimenType(specimen) && <><label htmlFor={`specimen-other-${specimen.clientId}`}>Otro tipo de muestra <span aria-hidden="true">*</span></label><InputText id={`specimen-other-${specimen.clientId}`} value={specimen.typeFreeText ?? ""} onChange={(event) => patch(specimen.clientId, { typeFreeText: event.target.value })} /></>}

        <label htmlFor={`specimen-id-${specimen.clientId}`}>ID de muestra</label>
        <InputText id={`specimen-id-${specimen.clientId}`} value={specimen.identifier ?? ""} onChange={(event) => patch(specimen.clientId, { identifier: event.target.value })} />
      </div>
      {additionalAttributesConcept && <div className="bacteriology-additional-attributes"><BacteriologyConceptSetEditor concept={additionalAttributesConcept} observations={specimen.additionalAttributes ?? []} conceptSetUI={context.appConfig.conceptSetUI} maxDepth={context.appConfig.maxConceptSetLevels} showTitle={false} onChange={(additionalAttributes) => patch(specimen.clientId, { additionalAttributes })} /></div>}
      {specimen.dateCollected && resultsConcept && <div className="bacteriology-results"><BacteriologyConceptSetEditor concept={resultsConcept} observations={specimen.results ?? []} conceptSetUI={context.appConfig.conceptSetUI} maxDepth={context.appConfig.maxConceptSetLevels} onChange={(results) => patch(specimen.clientId, { results })} /></div>}
    </section>)}

    {editors.length === 0 && <section className="consultation-subsection"><p className="consultation-form-loading" role="status"><i className="pi pi-spin pi-spinner" /> Preparando una muestra…</p></section>}

    {saved.length > 0 && <section className="consultation-subsection bacteriology-saved" aria-labelledby="saved-specimens-title">
      <header><h2 id="saved-specimens-title">Muestras guardadas</h2></header>
      <div className="bacteriology-saved-list">{saved.map((specimen) => <article key={specimen.clientId}>
        <div><strong>{specimenName(specimen)}</strong>{specimen.identifier && <span>#{specimen.identifier}</span>}<span>Agregada el {specimenDate(specimen.dateCollected, context.locale, context.timeZone)}</span></div>
        <div className="consultation-row-actions"><Button type="button" text icon="pi pi-pencil" aria-label={`Editar ${specimenName(specimen)}`} onClick={() => updateDraft((current) => ({
          ...current,
          specimens: current.specimens.map((item) => item.clientId === specimen.clientId ? { ...item, editing: true } : item),
        }))} /><Button type="button" text severity="danger" icon="pi pi-times" aria-label={`Anular ${specimenName(specimen)}`} onClick={() => remove(specimen)} /></div>
      </article>)}</div>
    </section>}
  </div>;
}
