import Link from "next/link";
import { useRouter } from "next/router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { Dropdown } from "primereact/dropdown";
import { InputText } from "primereact/inputtext";
import { Toast } from "primereact/toast";
import { useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AuthGuard } from "@/features/auth/AuthGuard";
import { useAuth } from "@/features/auth/AuthContext";
import { BedIcon } from "./BedIcon";
import { IpdModuleNavigation } from "./IpdModuleNavigation";
import { BED_STATUSES, bedContainsPatient, bedHasOccupant, bedOccupantLabel, bedStatusLabel, canAssignBed, canChangeBedStatus, wardGridColumnCount } from "./domain";
import { buildWardBedListRows, compareWardListValues, configuredWardListHeadings, wardListValue } from "./wardList";
import { OirsPatientDialog } from "./OirsPatientDialog";
import { BacteriologyConceptSetEditor as AdtConceptSetEditor } from "@/features/clinical/consultation/boards/BacteriologyConceptSetEditor";
import { buildAdtEncounterPayload, encounterTypeName, type AdtAction } from "./workflow";
import { parseIpdConfig } from "@/config-compat/ipdConfig";
import { hasPrivilege } from "@/services/bahmni/auth";
import { loadAppConfig } from "@/services/bahmni/config";
import { getEncounterConfiguration } from "@/services/bahmni/metadata";
import { getPatientProfile } from "@/services/bahmni/patients";
import { getActiveVisits } from "@/services/bahmni/visits";
import { addBedTag, assignBed, createAdtEncounter, dischargePatient, endVisitAndCreateEncounter, getAdtConceptSet, getAssignedBed, getBed, getBedTags, getWard, getWardListRows, getWards, ipdQueryKeys, removeBedTag, updateBedStatus } from "@/services/bahmni/ipd";

interface Props { patientUuid?: string; bedId?: number }

function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function display(value: unknown): string | undefined { return typeof value === "string" && value ? value : undefined; }
function patientView(profile: Record<string, unknown> | undefined) {
  const patient = record(profile?.patient ?? profile);
  const person = record(patient.person);
  const names = Array.isArray(person.names) ? record(person.names[0]) : {};
  const identifiers = Array.isArray(patient.identifiers) ? record(patient.identifiers.find((item) => record(item).preferred) ?? patient.identifiers[0]) : {};
  return {
    name: display(patient.name) ?? display(person.display) ?? ([names.givenName, names.middleName, names.familyName].filter(Boolean).join(" ") || "Paciente"),
    identifier: display(patient.identifier) ?? display(identifiers.identifier) ?? "Sin identificador",
    gender: display(person.gender) ?? display(patient.gender) ?? "—",
    age: String(person.age ?? patient.age ?? "—"),
  };
}

function encounterUuid(response: Record<string, unknown>): string | undefined { return display(response.encounterUuid) ?? display(record(response.encounter).uuid); }
function listCell(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return display(record(value).display) ?? display(record(value).name) ?? "—";
}
function observationHasValue(observation: Record<string, unknown>): boolean {
  const value = observation.value;
  if (value !== undefined && value !== null && value !== "") return true;
  return Array.isArray(observation.groupMembers) && observation.groupMembers.some((member) => observationHasValue(record(member)));
}
function populatedObservations(observations: Record<string, unknown>[]): Record<string, unknown>[] {
  return observations.flatMap((observation) => {
    const groupMembers = Array.isArray(observation.groupMembers) ? populatedObservations(observation.groupMembers.map(record)) : undefined;
    const next = groupMembers ? { ...observation, groupMembers } : observation;
    return observationHasValue(next) ? [next] : [];
  });
}
const editableBedStatusOptions = (["AVAILABLE", "RESERVED", "BLOCKED"] as const).map((value) => ({ value, label: bedStatusLabel(value) }));
const coreWardListColumns = [
  { key: "bedNumber", label: "Cama" },
  { key: "statusLabel", label: "Estado" },
  { key: "patientName", label: "Paciente" },
  { key: "identifier", label: "Identificador" },
  { key: "tags", label: "Tags" },
] as const;

export function BedManagementWorkspace({ patientUuid, bedId }: Props) {
  const router = useRouter();
  const { user, provider, location } = useAuth();
  const client = useQueryClient();
  const allowed = hasPrivilege(user, "app:adt");
  const canAssign = hasPrivilege(user, "Assign Beds");
  const canEdit = hasPrivilege(user, "Edit Bed Tags");
  const toast = useRef<Toast>(null);
  const [wardUuid, setWardUuid] = useState<string>();
  const [roomName, setRoomName] = useState<string>();
  const [selectedBedId, setSelectedBedId] = useState<number | undefined>(bedId);
  const [action, setAction] = useState<AdtAction>();
  const [convertVisit, setConvertVisit] = useState(true);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [oirsOpen, setOirsOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [sort, setSort] = useState<{ key: string; descending: boolean }>();
  const [listSearch, setListSearch] = useState("");
  const [adtObservations, setAdtObservations] = useState<Record<string, unknown>[]>([]);

  const showNotice = (type: "success" | "warning" | "error", text: string) => {
    toast.current?.show({ severity: type === "warning" ? "warn" : type, summary: text, life: type === "error" ? 6000 : 4500 });
  };

  const config = useQuery({ queryKey: ["app-config", "ipd"], queryFn: async () => parseIpdConfig(await loadAppConfig("ipd")), enabled: allowed });
  const wards = useQuery({ queryKey: ipdQueryKeys.wards, queryFn: getWards, enabled: allowed });
  const initialBed = useQuery({ queryKey: ipdQueryKeys.bed(bedId), queryFn: () => getBed(bedId!), enabled: allowed && Boolean(bedId) });
  const assigned = useQuery({ queryKey: ipdQueryKeys.assignedBed(patientUuid), queryFn: () => getAssignedBed(patientUuid!), enabled: allowed && Boolean(patientUuid) });
  const profile = useQuery({ queryKey: ipdQueryKeys.patient(patientUuid), queryFn: () => getPatientProfile(patientUuid!), enabled: allowed && Boolean(patientUuid) });
  const visits = useQuery({ queryKey: ipdQueryKeys.visit(patientUuid), queryFn: () => getActiveVisits(patientUuid!), enabled: allowed && Boolean(patientUuid) });
  const metadata = useQuery({ queryKey: ["metadata", "encounter-config"], queryFn: getEncounterConfiguration, enabled: allowed && Boolean(patientUuid) });
  const inferredWardUuid = wardUuid ?? assigned.data?.wardUuid ?? initialBed.data?.physicalLocation?.parentLocation?.uuid ?? wards.data?.[0]?.ward.uuid;
  const ward = useQuery({ queryKey: ipdQueryKeys.ward(inferredWardUuid), queryFn: () => getWard(inferredWardUuid!), enabled: allowed && Boolean(inferredWardUuid) });
  const tags = useQuery({ queryKey: ipdQueryKeys.tags, queryFn: getBedTags, enabled: allowed && canEdit });
  const adtConcept = useQuery({ queryKey: ["ipd", "adt-concept", config.data?.dashboard.conceptName], queryFn: () => getAdtConceptSet(config.data!.dashboard.conceptName!), enabled: allowed && Boolean(config.data?.dashboard.conceptName) });

  const inferredRoomName = roomName ?? assigned.data?.roomName ?? initialBed.data?.location ?? ward.data?.rooms[0]?.name;
  const inferredBedId = selectedBedId ?? assigned.data?.bedId ?? initialBed.data?.bedId;
  const room = ward.data?.rooms.find((candidate) => candidate.name === inferredRoomName) ?? ward.data?.rooms[0];
  const visualBedColumns = wardGridColumnCount(ward.data?.rooms ?? []);
  const wardList = useQuery({
    queryKey: ipdQueryKeys.wardList(config.data?.wardListSqlSearchHandler, room?.name),
    queryFn: ({ signal }) => getWardListRows(config.data!.wardListSqlSearchHandler!, room!.name, signal),
    enabled: allowed && viewMode === "list" && Boolean(config.data?.wardListSqlSearchHandler && room?.name),
    retry: 1,
  });
  const listHeadings = useMemo(() => {
    const configured = configuredWardListHeadings(wardList.data ?? [], config.data?.ignoredTabularViewHeadings ?? []);
    return [...coreWardListColumns, ...configured.map((key) => ({ key, label: key }))];
  }, [config.data?.ignoredTabularViewHeadings, wardList.data]);
  const listRows = useMemo(() => {
    const search = listSearch.trim().toLocaleLowerCase("es");
    const rows = buildWardBedListRows(room?.beds ?? [], wardList.data ?? []).filter((row) => !search || listHeadings.some(({ key }) => listCell(wardListValue(row, key)).toLocaleLowerCase("es").includes(search)));
    if (!sort) return rows;
    return rows.sort((left, right) => compareWardListValues(wardListValue(left, sort.key), wardListValue(right, sort.key), sort.descending));
  }, [listHeadings, listSearch, room?.beds, sort, wardList.data]);
  const selectedBed = ward.data?.beds.find((bed) => bed.bedId === inferredBedId) ?? initialBed.data;
  const bedCounts = useMemo(() => ({
    AVAILABLE: ward.data?.beds.filter((bed) => bed.status === "AVAILABLE").length ?? 0,
    OCCUPIED: ward.data?.beds.filter((bed) => bed.status === "OCCUPIED").length ?? 0,
    RESERVED: ward.data?.beds.filter((bed) => bed.status === "RESERVED").length ?? 0,
    BLOCKED: ward.data?.beds.filter((bed) => bed.status === "BLOCKED").length ?? 0,
  }), [ward.data?.beds]);
  const patient = patientView(profile.data);
  const administrativeMode = !patientUuid;
  const activeVisit = visits.data?.at(-1);
  const assignedHere = Boolean(assigned.data?.bedId && assigned.data.bedId === selectedBed?.bedId);
  const possibleActions = useMemo<AdtAction[]>(() => {
    if (!patientUuid) return [];
    if (assigned.data) return ["transfer", "discharge"];
    return ["admit"];
  }, [assigned.data, patientUuid]);

  const reconcile = async (affectedWardUuids: Array<string | undefined> = []) => {
    const wardUuids = [...new Set([inferredWardUuid, ...affectedWardUuids].filter((uuid): uuid is string => Boolean(uuid)))];
    await Promise.all([
      client.invalidateQueries({ queryKey: ipdQueryKeys.wards }),
      ...wardUuids.map((uuid) => client.invalidateQueries({ queryKey: ipdQueryKeys.ward(uuid) })),
      client.invalidateQueries({ queryKey: ipdQueryKeys.assignedBed(patientUuid) }),
      client.invalidateQueries({ queryKey: ipdQueryKeys.visit(patientUuid) }),
    ]);
  };

  const execute = useMutation({
    mutationFn: async (current: AdtAction) => {
      if (!patientUuid || !location?.uuid || !metadata.data) throw new Error("Falta paciente, ubicación o configuración de encuentros.");
      const encounterTypeUuid = metadata.data.encounterTypes[encounterTypeName(current)];
      if (!encounterTypeUuid) throw new Error(`No existe el tipo de encuentro ${encounterTypeName(current)}.`);
      const defaultVisitName = config.data?.defaultVisitType;
      const defaultVisitUuid = defaultVisitName ? metadata.data.visitTypes[defaultVisitName] : undefined;
      const currentVisitType = display(activeVisit?.visitType?.display) ?? display(activeVisit?.visitType?.name);
      const currentVisitTypeUuid = activeVisit?.visitType?.uuid;
      const payload = buildAdtEncounterPayload({ action: current, patientUuid, locationUuid: location.uuid, encounterTypeUuid, visitTypeUuid: current === "discharge" ? undefined : currentVisitTypeUuid ?? defaultVisitUuid, providerUuid: provider?.uuid, observations: populatedObservations(adtObservations) });

      if (current === "discharge") {
        if (!activeVisit || !assigned.data) throw new Error("El paciente no tiene visita IPD y cama activas.");
        const response = await dischargePatient(payload);
        return { response, sourceWardUuid: assigned.data.wardUuid, sourceBedId: assigned.data.bedId, destinationWardUuid: undefined, destinationBedId: undefined };
      }
      if (!selectedBed || !canAssignBed(selectedBed)) throw new Error("Seleccione una cama disponible antes de continuar.");
      if (current === "transfer" && assigned.data?.bedId === selectedBed.bedId) throw new Error("Seleccione una cama de destino distinta.");
      const fresh = await getBed(selectedBed.bedId);
      if (bedHasOccupant(fresh)) throw new Error("La cama destino fue asignada a otro paciente. Se recargó el mapa.");
      let response: Record<string, unknown>;
      const mismatch = activeVisit && defaultVisitName && currentVisitType && currentVisitType !== defaultVisitName;
      if (current === "admit" && mismatch && (config.data?.enableAutoConvertToIPDVisit || config.data?.hideStartNewVisitPopUp || convertVisit)) {
        if (!defaultVisitUuid) throw new Error(`El tipo de visita ${defaultVisitName} no está configurado.`);
        response = await endVisitAndCreateEncounter(activeVisit.uuid, { ...payload, visitTypeUuid: defaultVisitUuid });
      } else response = await createAdtEncounter(payload);
      const createdEncounterUuid = encounterUuid(response);
      if (!createdEncounterUuid) throw new Error("OpenMRS no devolvió el encounterUuid requerido para asignar la cama.");
      await assignBed(selectedBed.bedId, patientUuid, createdEncounterUuid);
      return {
        response,
        destinationBedId: selectedBed.bedId,
        destinationWardUuid: inferredWardUuid,
        sourceBedId: assigned.data?.bedId,
        sourceWardUuid: assigned.data?.wardUuid,
      };
    },
    onSuccess: async (result, current) => {
      await reconcile([result.sourceWardUuid, result.destinationWardUuid]);
      const confirmedBed = patientUuid ? await getAssignedBed(patientUuid).catch(() => null) : null;
      let confirmed = current === "discharge" ? !confirmedBed : confirmedBed?.bedId === result.destinationBedId;
      const confirmationWardUuid = current === "discharge" ? result.sourceWardUuid : result.destinationWardUuid;
      if (!confirmed && confirmationWardUuid && patientUuid) {
        const confirmedWard = await getWard(confirmationWardUuid).catch(() => undefined);
        if (confirmedWard) {
          client.setQueryData(ipdQueryKeys.ward(confirmationWardUuid), confirmedWard);
          const confirmationBedId = current === "discharge" ? result.sourceBedId : result.destinationBedId;
          const confirmationBed = confirmedWard.beds.find((bed) => bed.bedId === confirmationBedId);
          confirmed = current === "discharge" ? !bedContainsPatient(confirmationBed, patientUuid) : bedContainsPatient(confirmationBed, patientUuid);
        }
      }
      showNotice(confirmed ? "success" : "warning", confirmed ? (current === "admit" ? "Paciente admitido y cama confirmada." : current === "transfer" ? "Transferencia confirmada." : "Alta confirmada y cama liberada.") : "La escritura respondió, pero la relectura todavía no confirma el estado final. Recargue antes de repetir.");
      setAction(undefined);
      if (confirmed) setAdtObservations([]);
    },
    onError: async (error) => {
      await reconcile();
      setAction(undefined);
      showNotice("error", error instanceof Error ? error.message : "No fue posible completar la operación ADT.");
    },
  });

  const statusMutation = useMutation({
    mutationFn: async (status: "AVAILABLE" | "RESERVED" | "BLOCKED") => {
      if (!selectedBed || !canChangeBedStatus(selectedBed)) throw new Error("Sólo se puede cambiar el estado de una cama sin paciente.");
      if (!inferredWardUuid) throw new Error("No fue posible identificar la sala de la cama seleccionada.");
      await updateBedStatus(selectedBed.bedUuid, status);
      // Legacy confirms administrative changes from the complete admission
      // location. The individual /beds/{id} representation may lag behind it.
      const confirmedWard = await getWard(inferredWardUuid);
      const confirmed = confirmedWard.beds.find((bed) =>
        (selectedBed.bedUuid && bed.bedUuid === selectedBed.bedUuid) || bed.bedId === selectedBed.bedId);
      client.setQueryData(ipdQueryKeys.ward(inferredWardUuid), confirmedWard);
      if (!confirmed || confirmed.status !== status) throw new Error("OpenMRS no confirmó el nuevo estado de la cama.");
      return { confirmed, confirmedWard, wardUuid: inferredWardUuid };
    },
    onSuccess: async ({ confirmed, confirmedWard, wardUuid: confirmedWardUuid }) => {
      client.setQueryData(ipdQueryKeys.ward(confirmedWardUuid), confirmedWard);
      if (bedId === confirmed.bedId) client.setQueryData(ipdQueryKeys.bed(bedId), confirmed);
      await reconcile();
      showNotice("success", "Estado de cama actualizado.");
    },
    onError: async (error) => {
      await reconcile();
      showNotice("error", error instanceof Error ? error.message : "No se pudo cambiar el estado.");
    },
  });

  const tagMutation = useMutation({
    mutationFn: async ({ mode, uuid }: { mode: "add" | "remove"; uuid: string }) => {
      if (!selectedBed) throw new Error("Seleccione una cama.");
      if (mode === "add") {
        const selectedTag = tags.data?.find((tag) => tag.uuid === uuid);
        if (!selectedTag?.id) throw new Error("OpenMRS no devolvió el ID numérico requerido para asignar el tag.");
        await addBedTag(selectedBed.bedId, selectedTag.id);
      } else await removeBedTag(uuid);
    },
    onSuccess: async () => { await reconcile(); showNotice("success", "Tags de cama actualizados."); },
    onError: (error) => showNotice("error", error instanceof Error ? error.message : "No fue posible actualizar los tags."),
  });

  const confirmText = action === "admit" ? `Admitir a ${patient.name} en cama ${selectedBed?.bedNumber ?? "—"}` : action === "transfer" ? `Transferir a ${patient.name} desde ${assigned.data?.bedNumber ?? "—"} hacia ${selectedBed?.bedNumber ?? "—"}` : `Dar de alta a ${patient.name} y liberar ${assigned.data?.bedNumber ?? "—"}`;

  const selectBed = (nextBedId: number) => {
    if (administrativeMode) {
      void router.push(`/bedmanagement/bed/${nextBedId}`);
      return;
    }
    setSelectedBedId(nextBedId);
  };

  return <AuthGuard><AppShell mainClassName="ipd-page">
    <Toast ref={toast} position="top-right" />
    {!allowed && <p className="error-banner">No tiene el privilegio app:adt.</p>}
    {allowed && <><IpdModuleNavigation activeMode={administrativeMode ? "beds" : "patients"} /><div className="ipd-workspace">
      <aside className="panel ipd-context">
        <header className="ipd-context-header"><span className="ipd-context-avatar" aria-hidden="true">{patientUuid ? patient.name.charAt(0).toLocaleUpperCase() : <BedIcon />}</span><div><small>{patientUuid ? "Paciente seleccionado" : "Modo administrativo"}</small><h2>{patientUuid ? patient.name : "Gestión de cama"}</h2>{patientUuid && <span>{patient.identifier}</span>}</div></header>
        {patientUuid ? <><dl className="ipd-context-details"><dt>Edad / sexo</dt><dd>{patient.age} / {patient.gender}</dd><dt>Cama actual</dt><dd><span className={assigned.data ? "ipd-current-bed" : "ipd-no-bed"}>{assigned.data?.bedNumber ?? "Sin cama"}</span></dd></dl>
          <div className="ipd-actions">{possibleActions.map((item) => <Button key={item} disabled={!canAssign || execute.isPending || (item !== "discharge" && (!selectedBed || (item === "transfer" && assignedHere)))} label={item === "admit" ? "Admitir" : item === "transfer" ? "Transferir" : "Dar de alta"} severity={item === "discharge" ? "danger" : undefined} onClick={() => { setConvertVisit(true); setAction(item); }} />)}
          {config.data?.oirsApiBaseUrl && activeVisit && assigned.data && <Button outlined icon="pi pi-users" label="Paciente acostado / visitas" onClick={() => setOirsOpen(true)} />}</div>
          {activeVisit && <Link className="ipd-dashboard-link" href={`/bedmanagement/patient/${patientUuid}/visit/${activeVisit.uuid}/dashboard`}><i className="pi pi-chart-bar" aria-hidden="true" /> Abrir dashboard IPD <i className="pi pi-arrow-right" aria-hidden="true" /></Link>}
        </> : <p className="ipd-context-empty">Seleccione una cama para consultar sus datos, cambiar su estado o administrar sus tags.</p>}
        <section className={`ipd-selected-bed ${selectedBed ? `ipd-selected-bed-${selectedBed.status.toLowerCase()}` : "is-empty"}`}><header><span className="ipd-selected-bed-icon"><BedIcon /></span><div><small>Cama seleccionada</small><h3>{selectedBed?.bedNumber ?? "Ninguna"}</h3></div></header><dl><dt>Sala</dt><dd>{ward.data?.name ?? "—"}</dd><dt>Habitación</dt><dd>{room?.name ?? "—"}</dd><dt>Estado</dt><dd>{selectedBed ? <span className={`ipd-status-pill ipd-status-${selectedBed.status.toLowerCase()}`}>{bedStatusLabel(selectedBed.status)}</span> : "—"}</dd><dt>Tags</dt><dd>{selectedBed?.bedTagMaps.map((map) => map.bedTag.name).join(", ") || "—"}</dd></dl>
          {canEdit && selectedBed && canChangeBedStatus(selectedBed) && <Dropdown aria-label="Estado de cama" value={selectedBed.status === "OCCUPIED" ? undefined : selectedBed.status} options={editableBedStatusOptions} optionLabel="label" optionValue="value" disabled={statusMutation.isPending} onChange={(event) => statusMutation.mutate(event.value as "AVAILABLE" | "RESERVED" | "BLOCKED")} placeholder="Cambiar estado" />}
          {canEdit && selectedBed && <Button outlined icon="pi pi-tags" label="Editar tags" onClick={() => setTagsOpen(true)} />}
        </section>
      </aside>
      <section className="panel ipd-bed-map">
        <header className="ipd-map-header"><div className="ipd-map-heading"><span><BedIcon /></span><div><small>Gestión de camas</small><h2>Mapa operativo</h2><p>Seleccione una sala, habitación y cama para continuar.</p></div></div><div className="ipd-map-toolbar"><Button outlined icon={viewMode === "grid" ? "pi pi-list" : "pi pi-th-large"} label={viewMode === "grid" ? "Vista lista" : "Vista grilla"} onClick={() => setViewMode((current) => current === "grid" ? "list" : "grid")} />{viewMode === "list" && config.data?.wardListPrintEnabled && <Button outlined icon="pi pi-print" label="Imprimir" onClick={() => window.print()} />}</div></header>
        {wards.isError && <p className="error-banner">No fue posible cargar las salas.</p>}
        <div className="ipd-ward-tabs" role="tablist" aria-label="Salas de hospitalización">{wards.data?.map((item) => <button type="button" role="tab" aria-selected={inferredWardUuid === item.ward.uuid} key={item.ward.uuid} className={inferredWardUuid === item.ward.uuid ? "selected" : ""} onClick={() => { setWardUuid(item.ward.uuid); setRoomName(undefined); setSelectedBedId(undefined); }}>{item.ward.name ?? item.ward.display}</button>)}</div>
        {ward.isLoading && <p>Cargando camas…</p>}
        {ward.isError && <div className="error-banner">Falló esta sala. <Button text label="Reintentar" onClick={() => void ward.refetch()} /></div>}
        {ward.data && <>
          <div className="ipd-kpis">{BED_STATUSES.map((status) => <span key={status} className={`ipd-kpi ipd-kpi-${status.toLowerCase()}`}><span className="ipd-kpi-icon"><BedIcon /></span><span><strong>{bedCounts[status]}</strong><small>{bedStatusLabel(status)}{bedCounts[status] === 1 ? "" : "s"}</small></span></span>)}</div>
          <div className="ipd-room-tabs" role="tablist" aria-label="Habitaciones">{ward.data.rooms.map((candidate) => <button type="button" role="tab" aria-selected={room?.name === candidate.name} key={candidate.name} className={room?.name === candidate.name ? "selected" : ""} onClick={() => { setRoomName(candidate.name); setSelectedBedId(undefined); }}><BedIcon /><span><strong>{candidate.name}</strong><small><b>{candidate.availableBeds}</b> disponibles · {candidate.totalBeds} total</small></span></button>)}</div>
          {room && viewMode === "grid" && <section className="ipd-bed-stage"><header className="ipd-bed-stage-header"><div><small>Habitación seleccionada</small><h3>{room.name}</h3></div><div className="ipd-bed-legend" aria-label="Leyenda de estados">{BED_STATUSES.map((status) => <span key={status} className={`ipd-status-${status.toLowerCase()}`}><BedIcon /> {bedStatusLabel(status)}</span>)}</div></header><div className="ipd-grid" style={{ gridTemplateColumns: `repeat(${visualBedColumns}, minmax(0, 1fr))` }}>{room.grid.flatMap((row, rowIndex) => row.map((bed, columnIndex) => { const occupantLabel = bedOccupantLabel(bed?.patient); return bed ? <button type="button" aria-label={`${bed.bedNumber} ${bedStatusLabel(bed.status)}${occupantLabel ? `, ${occupantLabel}` : ""}`} key={bed.bedId} className={`ipd-bed ipd-bed-${bed.status.toLowerCase()} ${inferredBedId === bed.bedId ? "selected" : ""}`} onClick={() => selectBed(bed.bedId)}><span className="ipd-bed-status"><i aria-hidden="true" />{bedStatusLabel(bed.status)}</span><span className="ipd-bed-main"><BedIcon /><span><strong>{bed.bedNumber}</strong>{bed.patient && <small>{occupantLabel ?? "Paciente"}</small>}</span></span>{bed.bedTagMaps.length > 0 && <span className="ipd-bed-tags"><i className="pi pi-tag" aria-hidden="true" /> {bed.bedTagMaps.map((map) => map.bedTag.name).join(", ")}</span>}</button> : <span className="ipd-bed-empty" aria-hidden="true" key={`${rowIndex}-${columnIndex}`} />; }))}</div></section>}
          {room && viewMode === "list" && <section className="ipd-list-wrap">
            <header className="ipd-list-toolbar">
              <div><small>Habitación seleccionada</small><h3>{room.name}</h3></div>
              <span className="p-input-icon-left"><i className="pi pi-search" aria-hidden="true" /><InputText value={listSearch} onChange={(event) => setListSearch(event.target.value)} placeholder="Buscar cama, paciente o identificador" aria-label="Buscar en listado de camas" /></span>
            </header>
            {wardList.isError && <div className="ipd-list-config-notice"><i className="pi pi-info-circle" aria-hidden="true" /><span>El listado SQL configurado no está disponible. Se muestran los datos operativos actuales de OpenMRS.</span><Button text label="Reintentar" onClick={() => void wardList.refetch()} /></div>}
            {listRows.length ? <table className="ipd-ward-list">
              <thead><tr>{listHeadings.map(({ key, label }) => <th key={key}><button type="button" onClick={() => setSort((current) => ({ key, descending: current?.key === key ? !current.descending : false }))}>{label}{sort?.key === key && <i className={`pi ${sort.descending ? "pi-sort-down" : "pi-sort-up"}`} />}</button></th>)}</tr></thead>
              <tbody>{listRows.map((row) => <tr key={row.bedId} className={inferredBedId === row.bedId ? "selected" : ""} tabIndex={0} onClick={() => selectBed(row.bedId)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectBed(row.bedId); } }}>
                {listHeadings.map(({ key }) => <td key={key}>{key === "bedNumber" ? <span className="ipd-list-bed"><BedIcon /><strong>{row.bedNumber}</strong></span> : key === "statusLabel" ? <span className={`ipd-status-pill ipd-status-${row.status.toLowerCase()}`}>{row.statusLabel}</span> : listCell(wardListValue(row, key))}</td>)}
              </tr>)}</tbody>
            </table> : <p className="ipd-empty">{listSearch ? "No hay camas que coincidan con la búsqueda." : "No hay camas configuradas en esta habitación."}</p>}
          </section>}
        </>}
      </section>
    </div></>}
    <Dialog header="Confirmar operación ADT" visible={Boolean(action)} modal onHide={() => setAction(undefined)} footer={<><Button outlined label="Cancelar" onClick={() => setAction(undefined)} /><Button loading={execute.isPending} label="Confirmar" severity={action === "discharge" ? "danger" : undefined} onClick={() => action && execute.mutate(action)} /></>}><p>{confirmText}</p>{action === "admit" && activeVisit && config.data?.defaultVisitType && (display(activeVisit.visitType?.display) ?? display(activeVisit.visitType?.name)) !== config.data.defaultVisitType && !config.data.enableAutoConvertToIPDVisit && !config.data.hideStartNewVisitPopUp && <div className="ipd-visit-choice"><p>La visita activa no es {config.data.defaultVisitType}. El legacy permite elegir:</p><Button outlined={!convertVisit} label={`Cerrar visita e iniciar ${config.data.defaultVisitType}`} onClick={() => setConvertVisit(true)} /><Button outlined={convertVisit} label="Continuar con visita actual" onClick={() => setConvertVisit(false)} /></div>}{adtConcept.isLoading && <p>Cargando notas ADT configuradas…</p>}{adtConcept.data && <div className="ipd-adt-observations"><AdtConceptSetEditor concept={adtConcept.data} observations={adtObservations} conceptSetUI={record(config.data?.extensions.conceptSetUI)} onChange={setAdtObservations} /></div>}<p className="muted">Antes de escribir se releerá la cama destino y después se reconciliarán cama, visita y encuentro.</p></Dialog>
    <Dialog header={`Tags de cama ${selectedBed?.bedNumber ?? ""}`} visible={tagsOpen} modal onHide={() => setTagsOpen(false)}><div className="ipd-tag-editor">{tags.data?.map((tag) => { const map = selectedBed?.bedTagMaps.find((candidate) => candidate.bedTag.uuid === tag.uuid); return <button type="button" key={tag.uuid} className={map ? "selected" : ""} disabled={tagMutation.isPending} onClick={() => map?.uuid ? tagMutation.mutate({ mode: "remove", uuid: map.uuid }) : tagMutation.mutate({ mode: "add", uuid: tag.uuid })}><i className={`pi ${map ? "pi-check" : "pi-tag"}`} /> {tag.name}</button>; })}</div></Dialog>
    {config.data?.oirsApiBaseUrl && patientUuid && activeVisit && <OirsPatientDialog visible={oirsOpen} onHide={() => setOirsOpen(false)} baseUrl={config.data.oirsApiBaseUrl} patientUuid={patientUuid} visitUuid={activeVisit.uuid} bedNumber={assigned.data?.bedNumber} identifier={patient.identifier} patientName={patient.name} age={patient.age} />}
  </AppShell></AuthGuard>;
}
