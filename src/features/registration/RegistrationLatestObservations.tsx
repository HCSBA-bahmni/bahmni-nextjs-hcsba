import { useQuery } from "@tanstack/react-query";
import { getPatientObservations } from "@/services/bahmni/clinical";
import { formatLatestObservationDate, groupLatestObservations } from "./registrationLatest";

export function RegistrationLatestObservations({ patientUuid, conceptNames }: { patientUuid: string; conceptNames: string[] }) {
  const latest = useQuery({
    queryKey: ["registration", "latest-observations", patientUuid, conceptNames],
    // Legacy latestObs calls observationsService.fetch(patient, concepts, "latest")
    // without restricting the number of visits. Adding numberOfVisits=1 hides
    // valid values when the latest matching observation belongs to an earlier
    // registration encounter.
    queryFn: () => getPatientObservations({ patientUuid, conceptNames, scope: "latest" }),
    enabled: Boolean(patientUuid && conceptNames.length),
  });
  const groups = groupLatestObservations(latest.data ?? [], conceptNames);

  return <aside className="registration-latest" aria-labelledby="registration-latest-title">
    <h3 id="registration-latest-title">Reciente</h3>
    {latest.isLoading && <p role="status">Cargando observaciones recientes…</p>}
    {latest.isError && <div><p role="alert">No fue posible cargar las observaciones recientes.</p><button type="button" className="link-button" onClick={() => void latest.refetch()}>Reintentar</button></div>}
    {latest.isSuccess && groups.length === 0 && <p className="muted-text">No hay observaciones recientes.</p>}
    {groups.map((group, index) => <section key={`${String(group.dateTime)}-${index}`}>
      <h4><i className="pi pi-angle-down" aria-hidden="true" />{formatLatestObservationDate(group.dateTime)}</h4>
      <dl>{group.items.map((item, itemIndex) => <div key={`${item.label}-${itemIndex}`}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>
    </section>)}
  </aside>;
}
