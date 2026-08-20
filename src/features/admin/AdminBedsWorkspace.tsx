import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "primereact/button";
import { ConfirmDialog, confirmDialog } from "primereact/confirmdialog";
import { Dialog } from "primereact/dialog";
import { InputNumber } from "primereact/inputnumber";
import { InputText } from "primereact/inputtext";
import { TabPanel, TabView } from "primereact/tabview";
import { useMemo, useState, type FormEvent } from "react";
import { adminLocationDisplayName, canDeleteLocation, layoutCellKey, locationChildren, validateBedPosition, validateLayout, type AdminBed, type AdminBedType, type AdminLocation } from "./beds";
import { deleteAdminBed, deleteAdminBedTag, deleteAdminBedType, deleteAdminLocation, getAdminBedLayout, getAdminBedTags, getAdminBedTypes, getAdminLocations, getVisitLocations, saveAdminBed, saveAdminBedLayout, saveAdminBedTag, saveAdminBedType, saveAdminLocation } from "@/services/bahmni/adminBeds";

type LocationDraft = { uuid?: string; parentLocationUuid: string; name: string; description: string };
const emptyLocation: LocationDraft = { parentLocationUuid: "", name: "", description: "" };

function confirmDeletion(message: string, accept: () => void) {
  confirmDialog({
    header: "Confirmar eliminación",
    message,
    icon: "pi pi-exclamation-triangle",
    acceptLabel: "Eliminar",
    rejectLabel: "Cancelar",
    acceptClassName: "p-button-danger",
    className: "admin-beds-confirm",
    accept,
  });
}

function OperationErrorDialog({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : error ? "No fue posible completar la operación." : "";
  const [dismissedError, setDismissedError] = useState<unknown>();
  const visible = Boolean(message && error !== dismissedError);
  const dismiss = () => setDismissedError(error);
  return <Dialog header="No fue posible completar la operación" visible={visible} onHide={dismiss} modal className="admin-beds-error-dialog" footer={<Button label="Entendido" icon="pi pi-check" onClick={dismiss} />}>
    <div className="admin-beds-error-content" role="alert"><i className="pi pi-times-circle" aria-hidden="true" /><p>{message}</p></div>
  </Dialog>;
}

export function AdminBedsWorkspace() {
  const client = useQueryClient();
  const locations = useQuery({ queryKey: ["admin-beds", "locations"], queryFn: getAdminLocations });
  const visitLocations = useQuery({ queryKey: ["admin-beds", "visit-locations"], queryFn: getVisitLocations });
  const bedTypes = useQuery({ queryKey: ["admin-beds", "types"], queryFn: getAdminBedTypes });
  const bedTags = useQuery({ queryKey: ["admin-beds", "tags"], queryFn: getAdminBedTags });
  const [selectedUuid, setSelectedUuid] = useState<string>();
  const [expandedLocations, setExpandedLocations] = useState<Set<string>>(() => new Set());
  const selected = locations.data?.find((item) => item.uuid === selectedUuid);
  const children = locationChildren(locations.data ?? [], selectedUuid);
  const roots = locationChildren(locations.data ?? []);
  const isWard = Boolean(selected?.parentUuid && locations.data?.some((item) => item.uuid === selected.parentUuid));
  const layout = useQuery({ queryKey: ["admin-beds", "layout", selectedUuid], queryFn: () => getAdminBedLayout(selectedUuid!), enabled: Boolean(selectedUuid && isWard) });
  const [locationDraft, setLocationDraft] = useState<LocationDraft | null>(null);
  const [layoutDraft, setLayoutDraft] = useState<{ rows: number; columns: number } | null>(null);
  const [bedDraft, setBedDraft] = useState<{ bedUuid?: string; bedNumber: string; bedType: string; row: number; column: number } | null>(null);
  const [typeDraft, setTypeDraft] = useState<(Omit<AdminBedType, "uuid"> & { uuid?: string }) | null>(null);
  const [tagDraft, setTagDraft] = useState<{ uuid?: string; name: string } | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const refreshLocations = async () => { await client.invalidateQueries({ queryKey: ["admin-beds", "locations"] }); await client.invalidateQueries({ queryKey: ["admin-beds", "layout"] }); };
  const locationMutation = useMutation({ mutationFn: saveAdminLocation, onSuccess: async () => { setLocationDraft(null); await refreshLocations(); } });
  const layoutMutation = useMutation({ mutationFn: ({ uuid, rows, columns }: { uuid: string; rows: number; columns: number }) => saveAdminBedLayout(uuid, rows, columns), onSuccess: async () => { setLayoutDraft(null); await client.invalidateQueries({ queryKey: ["admin-beds", "layout", selectedUuid] }); } });
  const bedMutation = useMutation({ mutationFn: saveAdminBed, onSuccess: async () => { setBedDraft(null); await client.invalidateQueries({ queryKey: ["admin-beds", "layout", selectedUuid] }); } });
  const typeMutation = useMutation({ mutationFn: saveAdminBedType, onSuccess: async () => { setTypeDraft(null); await client.invalidateQueries({ queryKey: ["admin-beds", "types"] }); } });
  const tagMutation = useMutation({ mutationFn: saveAdminBedTag, onSuccess: async () => { setTagDraft(null); await client.invalidateQueries({ queryKey: ["admin-beds", "tags"] }); } });
  const deleteLocationMutation = useMutation({ mutationFn: async (location: AdminLocation) => {
    if (isWardOperation(location)) {
      const currentLayout = await getAdminBedLayout(location.uuid);
      if (currentLayout.beds.some((bed) => bed.status.trim().toUpperCase() === "OCCUPIED")) {
        throw new Error(`No se puede eliminar la sala ${adminLocationDisplayName(location.name)} porque tiene camas con pacientes asociados.`);
      }
    }
    await deleteAdminLocation(location.uuid);
  }, onSuccess: async () => { setSelectedUuid(undefined); await refreshLocations(); } });
  const deleteBedMutation = useMutation({ mutationFn: deleteAdminBed, onSuccess: async () => client.invalidateQueries({ queryKey: ["admin-beds", "layout", selectedUuid] }) });
  const deleteTypeMutation = useMutation({ mutationFn: deleteAdminBedType, onSuccess: async () => client.invalidateQueries({ queryKey: ["admin-beds", "types"] }) });
  const deleteTagMutation = useMutation({ mutationFn: deleteAdminBedTag, onSuccess: async () => client.invalidateQueries({ queryKey: ["admin-beds", "tags"] }) });
  const operationError = locationMutation.error ?? layoutMutation.error ?? bedMutation.error ?? typeMutation.error ?? tagMutation.error ?? deleteLocationMutation.error ?? deleteBedMutation.error ?? deleteTypeMutation.error ?? deleteTagMutation.error;

  function isWardOperation(location?: AdminLocation, parentUuid?: string) {
    const wardParentUuid = parentUuid ?? location?.parentUuid;
    return Boolean(wardParentUuid && locations.data?.some((item) => item.uuid === wardParentUuid));
  }

  function openLocation(location?: AdminLocation, parentUuid?: string) {
    setFormErrors({});
    setLocationDraft(location ? { uuid: location.uuid, parentLocationUuid: location.parentUuid ?? "", name: location.name, description: location.description } : { ...emptyLocation, parentLocationUuid: parentUuid ?? "" });
  }

  function submitLocation(event: FormEvent) {
    event.preventDefault();
    if (!locationDraft?.name.trim()) return setFormErrors({ name: "El nombre es obligatorio." });
    locationMutation.mutate({ ...locationDraft, name: locationDraft.name.trim(), parentLocationUuid: locationDraft.parentLocationUuid || null });
  }

  function requestDeleteLocation(location: AdminLocation) {
    if (!canDeleteLocation(locations.data ?? [], location.uuid)) return;
    const kind = isWardOperation(location) ? "sala" : "ubicación de admisión";
    confirmDeletion(`Se eliminará la ${kind} “${adminLocationDisplayName(location.name)}”. Esta acción no se puede deshacer.`, () => deleteLocationMutation.mutate(location));
  }

  function requestDeleteBed(bed: AdminBed) {
    confirmDeletion(`Se eliminará la cama “${bed.bedNumber}”. Esta acción no se puede deshacer.`, () => deleteBedMutation.mutate(bed.bedUuid));
  }

  function requestDeleteType(type: AdminBedType) {
    confirmDeletion(`Se eliminará el tipo de cama “${type.name}”. Esta acción no se puede deshacer.`, () => deleteTypeMutation.mutate(type.uuid));
  }

  function requestDeleteTag(tag: { uuid: string; name: string }) {
    confirmDeletion(`Se eliminará la etiqueta “${tag.name}”. Esta acción no se puede deshacer.`, () => deleteTagMutation.mutate(tag.uuid));
  }

  function submitLayout(event: FormEvent) {
    event.preventDefault(); if (!selectedUuid || !layoutDraft) return;
    const errors = validateLayout(layoutDraft.rows, layoutDraft.columns); setFormErrors(errors);
    if (!Object.keys(errors).length) layoutMutation.mutate({ uuid: selectedUuid, ...layoutDraft });
  }

  function submitBed(event: FormEvent) {
    event.preventDefault(); if (!selectedUuid || !bedDraft || !layout.data) return;
    const errors = validateBedPosition(bedDraft.row, bedDraft.column, layout.data.rows, layout.data.columns);
    if (!bedDraft.bedNumber.trim()) errors.bedNumber = "El número de cama es obligatorio.";
    if (!bedDraft.bedType) errors.bedType = "El tipo de cama es obligatorio.";
    setFormErrors(errors);
    if (!Object.keys(errors).length) bedMutation.mutate({ ...bedDraft, bedNumber: bedDraft.bedNumber.trim(), locationUuid: selectedUuid });
  }

  const bedByCell = useMemo(() => new Map((layout.data?.beds ?? []).map((bed) => [layoutCellKey(bed.rowNumber, bed.columnNumber), bed])), [layout.data?.beds]);
  const busy = locations.isLoading || visitLocations.isLoading || bedTypes.isLoading || bedTags.isLoading;

  return <main className="admin-beds-page">
    <ConfirmDialog />
    <section className="panel admin-beds-hero"><div><span className="admin-beds-icon"><i className="pi pi-building" aria-hidden="true" /></span><div><p>Administración</p><h2>Camas</h2><span>Configuración de ubicaciones, distribución, camas, tipos y etiquetas.</span></div></div><a href="/bahmni/admin"><i className="pi pi-arrow-left" /> Panel de Administración</a></section>
    {busy && <p role="status" className="admin-beds-status"><i className="pi pi-spin pi-spinner" /> Cargando configuración de camas…</p>}
    <OperationErrorDialog error={locations.error ?? visitLocations.error ?? bedTypes.error ?? bedTags.error ?? operationError} />
    <section className="panel admin-beds-content">
      <TabView>
        <TabPanel header="Ubicaciones de admisión" leftIcon="pi pi-sitemap mr-2">
          <div className="admin-location-layout">
            <aside aria-label="Ubicaciones de admisión"><header><strong>Ubicaciones de admisión</strong></header><nav><button type="button" className={!selected ? "selected" : ""} onClick={() => setSelectedUuid(undefined)}>Todas las ubicaciones</button>{roots.map((root) => { const expanded = expandedLocations.has(root.uuid); return <div key={root.uuid}><button type="button" className={selectedUuid === root.uuid ? "selected" : ""} aria-expanded={expanded} aria-controls={`salas-${root.uuid}`} onClick={() => { setSelectedUuid(root.uuid); setExpandedLocations((current) => { const next = new Set(current); if (next.has(root.uuid)) next.delete(root.uuid); else next.add(root.uuid); return next; }); }}><i className={`pi ${expanded ? "pi-chevron-down" : "pi-chevron-right"}`} aria-hidden="true" /><i className="pi pi-building" aria-hidden="true" /> {adminLocationDisplayName(root.name)}</button>{expanded && <div id={`salas-${root.uuid}`}>{locationChildren(locations.data ?? [], root.uuid).map((ward) => <button type="button" className={`ward ${selectedUuid === ward.uuid ? "selected" : ""}`} key={ward.uuid} onClick={() => setSelectedUuid(ward.uuid)}><i className="pi pi-angle-right" aria-hidden="true" /> {adminLocationDisplayName(ward.name)}</button>)}</div>}</div>; })}</nav></aside>
            <div className="admin-location-main">
              {!selected && <><div className="admin-section-title"><div><h3>Ubicaciones de admisión</h3><p>Seleccione una ubicación para revisar sus salas.</p></div><Button label="Agregar ubicación" icon="pi pi-plus" onClick={() => openLocation()} /></div><div className="admin-location-cards">{roots.map((item) => <LocationCard key={item.uuid} location={item} kind="ubicación" icon="pi-building" onOpen={() => setSelectedUuid(item.uuid)} onEdit={() => openLocation(item)} onDelete={() => requestDeleteLocation(item)} deleteDisabled={!canDeleteLocation(locations.data ?? [], item.uuid)} />)}</div></>}
              {selected && !isWard && <><div className="admin-breadcrumb"><button onClick={() => setSelectedUuid(undefined)}>Ubicaciones de admisión</button><i className="pi pi-angle-right" /><span>{adminLocationDisplayName(selected.name)}</span></div><div className="admin-section-title"><div><h3>{adminLocationDisplayName(selected.name)}</h3><p>{selected.description || "Ubicación de admisión"}</p></div></div><div className="admin-location-cards">{children.map((item) => <LocationCard key={item.uuid} location={item} kind="sala" icon="pi-th-large" onOpen={() => setSelectedUuid(item.uuid)} onEdit={() => openLocation(item)} onDelete={() => requestDeleteLocation(item)} deleteDisabled={!canDeleteLocation(locations.data ?? [], item.uuid)} />)}<button className="admin-add-ward-card" type="button" aria-label="Agregar sala" onClick={() => openLocation(undefined, selected.uuid)}><i className="pi pi-plus" /><strong>Agregar sala</strong><span>Crear una nueva sala en {adminLocationDisplayName(selected.name)}</span></button></div></>}
              {selected && isWard && <><div className="admin-breadcrumb"><button onClick={() => setSelectedUuid(undefined)}>Ubicaciones de admisión</button><i className="pi pi-angle-right" /><button onClick={() => setSelectedUuid(selected.parentUuid)}>{adminLocationDisplayName(locations.data?.find((item) => item.uuid === selected.parentUuid)?.name ?? "")}</button><i className="pi pi-angle-right" /><span>{adminLocationDisplayName(selected.name)}</span></div><div className="admin-section-title"><div><h3>{adminLocationDisplayName(selected.name)}</h3><p>Distribución física de camas</p></div><div><Button icon="pi pi-th-large" label={layout.data?.rows ? "Editar distribución" : "Definir distribución"} onClick={() => { setFormErrors({}); setLayoutDraft({ rows: layout.data?.rows || 1, columns: layout.data?.columns || 1 }); }} /></div></div>
                {layout.isLoading && <p role="status">Cargando distribución…</p>}
                {layout.data && layout.data.rows === 0 && <div className="admin-beds-empty"><i className="pi pi-th-large" /><strong>Distribución no configurada</strong><span>Defina filas y columnas antes de agregar camas.</span></div>}
                {layout.data && layout.data.rows > 0 && <div className="admin-bed-grid" style={{ gridTemplateColumns: `repeat(${layout.data.columns}, minmax(8rem, 1fr))` }}>{Array.from({ length: layout.data.rows }, (_, rowIndex) => Array.from({ length: layout.data.columns }, (_, columnIndex) => { const row = rowIndex + 1; const column = columnIndex + 1; const bed = bedByCell.get(layoutCellKey(row, column)); return bed ? <BedCell key={`${row}-${column}`} bed={bed} onEdit={() => { setFormErrors({}); setBedDraft({ bedUuid: bed.bedUuid, bedNumber: bed.bedNumber, bedType: bed.bedType?.name ?? bedTypes.data?.[0]?.name ?? "", row, column }); }} onDelete={() => requestDeleteBed(bed)} /> : <button className="admin-empty-cell" type="button" key={`${row}-${column}`} onClick={() => { setFormErrors({}); setBedDraft({ bedNumber: "", bedType: bedTypes.data?.[0]?.name ?? "", row, column }); }}><i className="pi pi-plus" /><span>Agregar cama</span><small>Fila {row}, columna {column}</small></button>; }))}</div>}
              </>}
            </div>
          </div>
        </TabPanel>
        <TabPanel header="Tipos de cama" leftIcon="pi pi-list mr-2"><AdminList title="Tipos de cama existentes" onAdd={() => setTypeDraft({ name: "", displayName: "", description: "" })}><table><thead><tr><th>Nombre</th><th>Nombre para mostrar</th><th>Descripción</th><th>Acción</th></tr></thead><tbody>{bedTypes.data?.map((type) => <tr key={type.uuid}><td>{type.name}</td><td>{type.displayName}</td><td>{type.description || "—"}</td><td><Button text label="Editar" icon="pi pi-pencil" onClick={() => setTypeDraft(type)} /><Button text severity="danger" label="Eliminar" icon="pi pi-trash" onClick={() => requestDeleteType(type)} /></td></tr>)}</tbody></table></AdminList></TabPanel>
        <TabPanel header="Etiquetas de cama" leftIcon="pi pi-tags mr-2"><AdminList title="Etiquetas de cama existentes" onAdd={() => setTagDraft({ name: "" })}><table><thead><tr><th>Nombre</th><th>Descripción</th><th>Acción</th></tr></thead><tbody>{bedTags.data?.map((tag) => <tr key={tag.uuid}><td>{tag.name}</td><td>—</td><td><Button text label="Editar" icon="pi pi-pencil" onClick={() => setTagDraft(tag)} /><Button text severity="danger" label="Eliminar" icon="pi pi-trash" onClick={() => requestDeleteTag(tag)} /></td></tr>)}</tbody></table></AdminList></TabPanel>
      </TabView>
    </section>

    <Dialog header={`${locationDraft?.uuid ? "Editar" : "Agregar"} ${locationDraft?.parentLocationUuid && locations.data?.some((item) => item.uuid === locationDraft.parentLocationUuid) ? "sala" : "ubicación de admisión"}`} visible={Boolean(locationDraft)} onHide={() => setLocationDraft(null)} modal className="admin-beds-dialog"><form onSubmit={submitLocation}><label><span>Ubicación padre</span>{locationDraft?.parentLocationUuid && locations.data?.some((item) => item.uuid === locationDraft.parentLocationUuid) ? <strong>{adminLocationDisplayName(locations.data.find((item) => item.uuid === locationDraft.parentLocationUuid)?.name ?? "")}</strong> : <select value={locationDraft?.parentLocationUuid ?? ""} onChange={(event) => setLocationDraft((draft) => draft && ({ ...draft, parentLocationUuid: event.target.value }))}><option value="">Ninguna</option>{visitLocations.data?.map((item) => <option key={item.uuid} value={item.uuid}>{adminLocationDisplayName(item.name)}</option>)}</select>}</label><label><span>Nombre</span><InputText required value={locationDraft?.name ?? ""} onChange={(event) => setLocationDraft((draft) => draft && ({ ...draft, name: event.target.value }))} />{formErrors.name && <small>{formErrors.name}</small>}</label><label><span>Descripción</span><textarea rows={4} value={locationDraft?.description ?? ""} onChange={(event) => setLocationDraft((draft) => draft && ({ ...draft, description: event.target.value }))} /></label><DialogFooter saving={locationMutation.isPending} cancel={() => setLocationDraft(null)} /></form></Dialog>
    <Dialog header="Definir distribución" visible={Boolean(layoutDraft)} onHide={() => setLayoutDraft(null)} modal className="admin-beds-dialog"><form onSubmit={submitLayout}><p><strong>Ubicación:</strong> {adminLocationDisplayName(selected?.name ?? "")}</p><label><span>Filas</span><InputNumber value={layoutDraft?.rows} onValueChange={(event) => setLayoutDraft((draft) => draft && ({ ...draft, rows: event.value ?? 0 }))} useGrouping={false} />{formErrors.rows && <small>{formErrors.rows}</small>}</label><label><span>Columnas</span><InputNumber value={layoutDraft?.columns} onValueChange={(event) => setLayoutDraft((draft) => draft && ({ ...draft, columns: event.value ?? 0 }))} useGrouping={false} max={10} />{formErrors.columns && <small>{formErrors.columns}</small>}</label><DialogFooter saving={layoutMutation.isPending} cancel={() => setLayoutDraft(null)} /></form></Dialog>
    <Dialog header={`${bedDraft?.bedUuid ? "Editar" : "Agregar"} cama`} visible={Boolean(bedDraft)} onHide={() => setBedDraft(null)} modal className="admin-beds-dialog"><form onSubmit={submitBed}><p><strong>Ubicación:</strong> {adminLocationDisplayName(selected?.name ?? "")}</p><label><span>Fila</span><InputNumber value={bedDraft?.row} onValueChange={(event) => setBedDraft((draft) => draft && ({ ...draft, row: event.value ?? 0 }))} useGrouping={false} />{formErrors.row && <small>{formErrors.row}</small>}</label><label><span>Columna</span><InputNumber value={bedDraft?.column} onValueChange={(event) => setBedDraft((draft) => draft && ({ ...draft, column: event.value ?? 0 }))} useGrouping={false} />{formErrors.column && <small>{formErrors.column}</small>}</label><label><span>Número de cama</span><InputText required maxLength={10} value={bedDraft?.bedNumber ?? ""} onChange={(event) => setBedDraft((draft) => draft && ({ ...draft, bedNumber: event.target.value }))} />{formErrors.bedNumber && <small>{formErrors.bedNumber}</small>}</label><label><span>Tipo de cama</span><select required value={bedDraft?.bedType ?? ""} onChange={(event) => setBedDraft((draft) => draft && ({ ...draft, bedType: event.target.value }))}>{bedTypes.data?.map((type) => <option key={type.uuid} value={type.name}>{type.name}</option>)}</select>{formErrors.bedType && <small>{formErrors.bedType}</small>}</label><DialogFooter saving={bedMutation.isPending} cancel={() => setBedDraft(null)} /></form></Dialog>
    <Dialog header={`${typeDraft?.uuid ? "Editar" : "Agregar"} tipo de cama`} visible={Boolean(typeDraft)} onHide={() => setTypeDraft(null)} modal className="admin-beds-dialog"><form onSubmit={(event) => { event.preventDefault(); if (typeDraft?.name.trim() && typeDraft.displayName.trim()) typeMutation.mutate(typeDraft); }}><label><span>Nombre</span><InputText required value={typeDraft?.name ?? ""} onChange={(event) => setTypeDraft((draft) => draft && ({ ...draft, name: event.target.value }))} /></label><label><span>Nombre para mostrar</span><InputText required value={typeDraft?.displayName ?? ""} onChange={(event) => setTypeDraft((draft) => draft && ({ ...draft, displayName: event.target.value }))} /></label><label><span>Descripción</span><textarea rows={4} value={typeDraft?.description ?? ""} onChange={(event) => setTypeDraft((draft) => draft && ({ ...draft, description: event.target.value }))} /></label><DialogFooter saving={typeMutation.isPending} cancel={() => setTypeDraft(null)} /></form></Dialog>
    <Dialog header={`${tagDraft?.uuid ? "Editar" : "Agregar"} etiqueta de cama`} visible={Boolean(tagDraft)} onHide={() => setTagDraft(null)} modal className="admin-beds-dialog"><form onSubmit={(event) => { event.preventDefault(); if (tagDraft?.name.trim()) tagMutation.mutate(tagDraft); }}><label><span>Nombre</span><InputText required value={tagDraft?.name ?? ""} onChange={(event) => setTagDraft((draft) => draft && ({ ...draft, name: event.target.value }))} /></label><DialogFooter saving={tagMutation.isPending} cancel={() => setTagDraft(null)} /></form></Dialog>
  </main>;
}

function LocationCard({ location, kind, icon, onOpen, onEdit, onDelete, deleteDisabled }: { location: AdminLocation; kind: "ubicación" | "sala"; icon: string; onOpen: () => void; onEdit: () => void; onDelete: () => void; deleteDisabled: boolean }) {
  const displayName = adminLocationDisplayName(location.name);
  return <article className="admin-location-card">
    <button className="admin-location-card-open" type="button" onClick={onOpen}>
      <i className={`pi ${icon}`} aria-hidden="true" />
      <strong>{displayName}</strong>
      {location.description && <span>{location.description}</span>}
    </button>
    <div className="admin-location-card-actions" aria-label={`Acciones de ${displayName}`}>
      <Button text rounded icon="pi pi-pencil" aria-label={`Editar ${kind} ${displayName}`} onClick={onEdit} />
      <Button text rounded severity="danger" icon="pi pi-trash" aria-label={`Eliminar ${kind} ${displayName}`} disabled={deleteDisabled} tooltip={deleteDisabled ? "Elimine primero las salas contenidas." : undefined} onClick={onDelete} />
    </div>
  </article>;
}

function BedCell({ bed, onEdit, onDelete }: { bed: AdminBed; onEdit: () => void; onDelete: () => void }) { return <article className="admin-bed-cell"><div><i className="pi pi-inbox" /><strong>{bed.bedNumber}</strong><span>{bed.bedType?.displayName || bed.bedType?.name || "Sin tipo"}</span></div><footer><Button text rounded icon="pi pi-pencil" aria-label={`Editar cama ${bed.bedNumber}`} onClick={onEdit} /><Button text rounded severity="danger" icon="pi pi-trash" aria-label={`Eliminar cama ${bed.bedNumber}`} onClick={onDelete} /></footer></article>; }
function AdminList({ title, onAdd, children }: { title: string; onAdd: () => void; children: React.ReactNode }) { return <div className="admin-reference-list"><header><h3>{title}</h3><Button icon="pi pi-plus" label="Agregar nuevo" onClick={onAdd} /></header><div className="admin-reference-table">{children}</div></div>; }
function DialogFooter({ saving, cancel }: { saving: boolean; cancel: () => void }) { return <div className="admin-dialog-actions"><Button type="button" outlined label="Cancelar" onClick={cancel} /><Button type="submit" label={saving ? "Guardando…" : "Guardar"} loading={saving} /></div>; }
