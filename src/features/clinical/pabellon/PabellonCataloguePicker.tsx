import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Dropdown } from "primereact/dropdown";
import { MultiSelect } from "primereact/multiselect";
import { Checkbox } from "primereact/checkbox";
import { RadioButton } from "primereact/radiobutton";
import { SelectButton } from "primereact/selectbutton";
import { InputText } from "primereact/inputtext";
import { Button } from "primereact/button";
import { useState } from "react";
import { getPabellonCatalogue, mergePabellonCataloguePages, type PabellonCatalogueName, type PabellonCatalogueOption } from "@/services/bahmni/pabellonCatalogues";
import { PabellonReadError } from "@/services/bahmni/pabellon";
import { loadPabellonSmallCatalogue } from "./pabellonSmallCatalogue";
import styles from "./PabellonRequest.module.css";

export interface PabellonCataloguePickerProps {
  scopeKey: string; catalogue: PabellonCatalogueName; label: string;
  value: PabellonCatalogueOption[]; onChange(value: PabellonCatalogueOption[]): void;
  multiple?: boolean; required?: boolean; disabled?: boolean; parentId?: string;
}
const nativeChoices = new Set<PabellonCatalogueName>(["preoperative-assessments", "blood-samples", "theatres", "care-types"]);
const optionLabel = (item: PabellonCatalogueOption, catalogue: PabellonCatalogueName) => {
  if (catalogue !== "procedures" || item.display.trimStart().startsWith(item.code + " ") || item.display.trim() === item.code || item.display.trimStart().startsWith(item.code + "-")) return item.display;
  return item.code + " — " + item.display;
};
const errorMessage = (error: unknown) => error instanceof PabellonReadError ? error.message : "No fue posible consultar este catálogo.";
const careLabel = (item: PabellonCatalogueOption) => {
  const name = item.display.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("es");
  return name === "modalidad de atencion institucional" ? "MAI" : name === "modalidad de libre eleccion" ? "MLE" : name === "no beneficiario" ? "NB" : item.display;
};

export function PabellonCataloguePicker(props: PabellonCataloguePickerProps) {
  const key = props.scopeKey + ":" + props.catalogue + ":" + (props.parentId ?? "");
  return nativeChoices.has(props.catalogue) ? <Choices key={key} {...props} /> : <Picker key={key} {...props} />;
}

function Choices({ scopeKey, catalogue, label, value, onChange, multiple = false, required = false, disabled = false }: PabellonCataloguePickerProps) {
  const blocked = disabled || !scopeKey;
  const query = useQuery({
    queryKey: ["pabellon-native-choices", scopeKey, catalogue], enabled: !blocked,
    queryFn: ({ signal }) => loadPabellonSmallCatalogue(catalogue as "preoperative-assessments" | "blood-samples" | "theatres" | "care-types", signal),
    retry: false, gcTime: 0, staleTime: 0, refetchOnWindowFocus: false, refetchOnReconnect: false,
  });
  const items = query.data ?? [];
  return <fieldset className={styles.choiceGroup} data-catalogue={catalogue}><legend className={catalogue === "preoperative-assessments" ? styles.srOnly : undefined}>{label}{required ? " *" : ""}</legend>
    {query.isFetching && <p role="status"><i className="pi pi-spin pi-spinner" aria-hidden="true" /> Cargando {label.toLowerCase()}…</p>}
    {query.isError && <div role="alert">{errorMessage(query.error)}<Button type="button" text label="Reintentar catálogo" disabled={blocked || query.isFetching} loading={query.isFetching} onClick={() => { void query.refetch({ cancelRefetch: false }); }} /></div>}
    {catalogue === "care-types" ? <SelectButton aria-label={label} value={value[0]?.sourceId ?? null} options={items} optionLabel="display" optionValue="sourceId" itemTemplate={(item: PabellonCatalogueOption) => <span title={item.display}>{careLabel(item)}</span>} disabled={blocked || query.isFetching || query.isError}
      onChange={(event) => onChange(items.filter((item) => item.sourceId === event.value))} /> : <div className={styles.choiceOptions}>{items.map((item) => {
        const id = "pabellon-" + catalogue + "-" + item.sourceId;
        const checked = value.some((selected) => selected.sourceId === item.sourceId);
        return <div key={item.sourceId} className={styles.choiceOption}>
          {multiple ? <Checkbox inputId={id} checked={checked} disabled={blocked || query.isFetching || query.isError} onChange={(event) => onChange(event.checked ? [...value.filter((selected) => selected.sourceId !== item.sourceId), item] : value.filter((selected) => selected.sourceId !== item.sourceId))} /> :
            <RadioButton inputId={id} name={"pabellon-" + catalogue} checked={checked} disabled={blocked || query.isFetching || query.isError} onChange={() => onChange([item])} />}
          <label htmlFor={id}>{item.display}</label>
        </div>;
      })}</div>}
    {!query.isFetching && !query.isError && !items.length && !blocked && <p role="status">Sin opciones disponibles.</p>}
  </fieldset>;
}

function Picker({ scopeKey, catalogue, label, value, onChange, multiple = false, required = false, disabled = false, parentId }: PabellonCataloguePickerProps) {
  const [search, setSearch] = useState("");
  const [opened, setOpened] = useState(false);
  const blocked = disabled || !scopeKey || catalogue === "approach-types" && !parentId;
  const query = useInfiniteQuery({
    queryKey: ["pabellon-catalogue", scopeKey, catalogue, search, parentId], enabled: opened && !blocked,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => getPabellonCatalogue(catalogue, { search, cursor: pageParam, signal }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    retry: false, staleTime: 0, gcTime: 0, refetchOnWindowFocus: false, refetchOnReconnect: false,
  });
  let items: PabellonCatalogueOption[] = []; let contractError: unknown;
  try { items = mergePabellonCataloguePages(query.data?.pages ?? []); } catch (error) { contractError = error; }
  const error = query.error ?? contractError;
  const options = !error ? items.filter((item) => catalogue !== "approach-types" || item.relations.some((parent) => parent.sourceId === parentId)) : [];
  // Retain selected labels while paging/searching, without duplicating them below the control.
  const combined = [...options, ...value.filter((selected) => !options.some((item) => item.sourceId === selected.sourceId))];
  const labelled = combined.map((item) => ({ ...item, pickerLabel: optionLabel(item, catalogue) }));
  const id = "pabellon-" + catalogue; const busy = query.isFetching;
  const footer = <div className={styles.pickerFooter}>
    {busy && <span role="status"><i className="pi pi-spin pi-spinner" aria-hidden="true" /> Cargando {label.toLowerCase()}…</span>}
    {Boolean(error) && <div role="alert"><p>{errorMessage(error)}</p><Button type="button" text label="Reintentar catálogo" loading={busy} disabled={busy || blocked} onClick={() => { void query.refetch({ cancelRefetch: false }); }} /></div>}
    {!error && query.hasNextPage && <Button type="button" text label="Cargar más opciones" loading={busy} disabled={busy || blocked} onClick={() => { void query.fetchNextPage({ cancelRefetch: false }); }} />}
    {!busy && !error && opened && !options.length && <span role="status">{search ? "No hay coincidencias." : "Sin opciones disponibles."}</span>}
  </div>;
  const filter = <InputText aria-label={"Buscar " + label.toLowerCase()} value={search} placeholder={catalogue === "procedures" ? "Buscar por código MAI o nombre" : "Buscar"} className={styles.catalogueFilter}
    onChange={(event) => setSearch(event.target.value)} />;
  const shared = { inputId: id, options: labelled, optionLabel: "pickerLabel", optionValue: "sourceId", dataKey: "sourceId", disabled: blocked,
    // PrimeReact's body portal keeps every catalogue panel outside clipped clinical cards.
    placeholder: "Seleccione", filter: true, filterTemplate: () => filter, panelFooterTemplate: () => footer,
    onShow: () => setOpened(true), emptyMessage: busy ? "Cargando…" : error ? "Consulta no disponible." : "No hay coincidencias.",
    className: styles.catalogueSelect, "aria-describedby": id + "-help" };
  const update = (ids: string[]) => { if (!blocked && !busy && !error) onChange(ids.map((key) => combined.find((item) => item.sourceId === key)).filter((item): item is PabellonCatalogueOption => Boolean(item))); };
  return <div className={styles.field}>
    <label htmlFor={id}>{label}{required && <span aria-label="obligatorio"> *</span>}</label>
    {multiple ? <MultiSelect {...shared} value={value.map((item) => item.sourceId)} display="chip" showSelectAll={false} onChange={(event) => update(event.value ?? [])} /> :
      <Dropdown {...shared} value={value[0]?.sourceId ?? null} showClear onChange={(event) => update(event.value ? [event.value] : [])} />}
    <small id={id + "-help"} className={styles.srOnly}>Seleccione una opción de Pabellón{multiple ? "; puede agregar más de una" : ""}.</small>
    {opened && !blocked && footer}
  </div>;
}
