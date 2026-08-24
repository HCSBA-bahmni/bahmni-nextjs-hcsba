import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/router";
import { Button } from "primereact/button";
import { Column } from "primereact/column";
import { DataTable, type DataTablePageEvent } from "primereact/datatable";
import { InputText } from "primereact/inputtext";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { parseRegistrationConfig } from "@/config-compat/registrationConfig";
import { AuthGuard } from "@/features/auth/AuthGuard";
import { useAuth } from "@/features/auth/AuthContext";
import { loadAppConfig } from "@/services/bahmni/config";
import { searchPatients } from "@/services/bahmni/patients";
import type { PatientSearchResult } from "@/types/bahmni";

interface SearchFields { q: string; identifier: string; phone: string; socialName: string; address: string }
const queryValue = (value: string | string[] | undefined) => typeof value === "string" ? value : "";
const cleanQuery = (fields: SearchFields, page = 1) => ({ ...Object.fromEntries(Object.entries(fields).filter(([, value]) => value.trim())), page });

function formatPatientRoute(template: string | undefined, patientUuid: string): string {
  const route = (template ?? "/patient/{{patientUuid}}").replaceAll("{{patientUuid}}", patientUuid);
  if (route.startsWith("/bahmni/registration")) return route.replace(/^\/bahmni\/registration(?:\/index\.html#?)?/, "/registration");
  return route.startsWith("/registration") ? route : `/registration${route.startsWith("/") ? route : `/${route}`}`;
}

export default function RegistrationSearch() {
  const router = useRouter();
  const { location } = useAuth();
  const page = Math.max(1, Number(router.query.page ?? 1) || 1);
  const descriptor = useQuery({ queryKey: ["app-config", "registration"], queryFn: () => loadAppConfig("registration") });
  const config = descriptor.data ? parseRegistrationConfig(descriptor.data) : undefined;
  const routeFields: SearchFields = { q: queryValue(router.query.q), identifier: queryValue(router.query.identifier), phone: queryValue(router.query.phone), socialName: queryValue(router.query.socialName), address: queryValue(router.query.address) };
  const [draft, setDraft] = useState<SearchFields | null>(null);
  const form = draft ?? routeFields;
  const hasCriteria = Object.values(routeFields).some(Boolean);
  const hasConflictingAttributes = [routeFields.phone, routeFields.socialName].filter(Boolean).length > 1;
  const attributeValue = routeFields.phone || routeFields.socialName;
  const attributeFields = routeFields.phone
    ? (config?.patientSearch.customAttributes.fields.length ? config.patientSearch.customAttributes.fields : ["phoneNumber", "alternatePhoneNumber"])
    : routeFields.socialName ? (config?.patientSearch.socialAttributes.fields.length ? config.patientSearch.socialAttributes.fields : ["givenNameLocal", "middleNameLocal", "familyNameLocal"]) : [];
  const result = useQuery({
    queryKey: ["patients", routeFields, page, location?.uuid, config],
    queryFn: () => searchPatients({ q: routeFields.q, identifier: routeFields.identifier, address: routeFields.address, addressFieldName: config?.patientSearch.address.field ?? "cityVillage", customAttribute: attributeValue, patientAttributes: attributeFields, page, pageSize: 20, locationUuid: location?.uuid, filterOnAllIdentifiers: Boolean(routeFields.identifier) }),
    enabled: router.isReady && Boolean(config) && hasCriteria && !hasConflictingAttributes,
  });
  const fields: Array<[keyof SearchFields, string, string]> = [
    ["q", "Nombre", "Nombre o apellido"],
    ["identifier", "RUN / identificador", "RUN u otro identificador"],
    ["phone", config?.patientSearch.customAttributes.label ?? "Teléfono", config?.patientSearch.customAttributes.placeholder ?? "Teléfono"],
    ["socialName", config?.patientSearch.socialAttributes.label ?? "Nombre social", config?.patientSearch.socialAttributes.placeholder ?? "Nombre social"],
    ["address", config?.patientSearch.address.label ?? "Dirección", config?.patientSearch.address.placeholder ?? "Comuna, ciudad o dirección"],
  ];
  const search = () => { setDraft(null); void router.push({ pathname: "/registration", query: cleanQuery(form) }); };
  const clear = () => { setDraft({ q: "", identifier: "", phone: "", socialName: "", address: "" }); void router.push("/registration"); };
  const openPatient = (patient: PatientSearchResult) => void router.push(formatPatientRoute(config?.searchByIdForwardUrl, patient.uuid));
  const onPage = (event: DataTablePageEvent) => void router.push({ pathname: "/registration", query: cleanQuery(routeFields, (event.page ?? 0) + 1) });

  return <AuthGuard><AppShell title="Registro de pacientes"><section className="panel">
    <div className="toolbar registration-search-fields">
      {fields.map(([name, label, placeholder]) => <div className="field" key={name}><label htmlFor={`search-${name}`}>{label}</label><InputText id={`search-${name}`} placeholder={placeholder} value={form[name]} onChange={(event) => setDraft((current) => ({ ...routeFields, ...current, [name]: event.target.value }))} onKeyDown={(event) => { if (event.key === "Enter") search(); }} /></div>)}
      <Button label="Buscar" icon="pi pi-search" disabled={!Object.values(form).some(Boolean)} onClick={search} />
      <Button label="Limpiar" outlined onClick={clear} />
      <Button label="Nuevo paciente" icon="pi pi-user-plus" onClick={() => void router.push("/registration/patient/new")} />
    </div>
    {hasConflictingAttributes && <p className="error-banner" role="alert">Busque por teléfono o por nombre social en una consulta, no por ambos simultáneamente.</p>}
    {result.isError && <p className="error-banner" role="alert">No fue posible consultar pacientes. Revise los criterios e intente nuevamente.</p>}
    <DataTable value={result.data?.results ?? []} loading={result.isLoading || descriptor.isLoading} paginator lazy first={(page - 1) * 20} rows={20} totalRecords={result.data?.total ?? 0} onPage={onPage} emptyMessage={hasCriteria ? "No se encontraron pacientes" : "Ingrese al menos un criterio de búsqueda"} dataKey="uuid" selectionMode="single" onRowSelect={(event) => openPatient(event.data as PatientSearchResult)}>
      <Column field="identifier" header="Identificador" /><Column header="Nombre" body={(patient: PatientSearchResult) => [patient.givenName, patient.middleName, patient.familyName, patient.familyName2].filter(Boolean).join(" ")} /><Column field="gender" header="Sexo" /><Column field="age" header="Edad" /><Column field="phoneNumber" header="Teléfono" /><Column field="address" header="Dirección" /><Column header="Acciones" body={(patient: PatientSearchResult) => <Button size="small" outlined label="Abrir" icon="pi pi-user-edit" onClick={() => openPatient(patient)} />} />
    </DataTable>
  </section></AppShell></AuthGuard>;
}
