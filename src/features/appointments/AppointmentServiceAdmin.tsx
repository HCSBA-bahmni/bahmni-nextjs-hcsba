import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "primereact/button";
import { Column } from "primereact/column";
import { DataTable } from "primereact/datatable";
import { Dialog } from "primereact/dialog";
import { AppShell } from "@/components/AppShell";
import { AuthGuard } from "@/features/auth/AuthGuard";
import { useAuth } from "@/features/auth/AuthContext";
import { hasPrivilege } from "@/services/bahmni/auth";
import { deleteAppointmentService, loadAppointmentServices } from "@/services/bahmni/appointments";
import { displayName } from "./domain";
import { AppointmentNavigation } from "./AppointmentNavigation";
import { appointmentText } from "./translations";
import type { AppointmentService } from "./types";

export function AppointmentServiceAdmin() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [pendingDelete, setPendingDelete] = useState<AppointmentService>();
  const canAdminister = hasPrivilege(user, "app:appointments:adminTab") || hasPrivilege(user, "app:admin");
  const services = useQuery({
    queryKey: ["appointments", "admin", "services"],
    queryFn: loadAppointmentServices,
    enabled: canAdminister,
  });
  const remove = useMutation({
    mutationFn: deleteAppointmentService,
    onSuccess: async () => {
      setPendingDelete(undefined);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["appointments", "admin", "services"] }),
        queryClient.invalidateQueries({ queryKey: ["appointments", "services"] }),
      ]);
    },
  });
  const sorted = useMemo(() => [...(services.data ?? [])].sort((a, b) => displayName(a).localeCompare(displayName(b), "es")), [services.data]);

  return <AuthGuard><AppShell mainClassName="appointments-page appointment-admin-page">
    <header className="appointments-heading"><div><span className="clinical-eyebrow">HCSBA</span><h1>{appointmentText.module}</h1></div></header>
    <AppointmentNavigation active="admin" />
    {!canAdminister && <p role="alert" className="error-banner">No cuentas con el privilegio para administrar servicios de citas.</p>}
    {canAdminister && <section className="panel appointment-service-admin" aria-labelledby="appointment-services-title">
      <div className="appointment-admin-title">
        <h2 id="appointment-services-title">Servicios</h2>
        <Link href="/appointments/admin/new" className="p-button p-component"><i className="pi pi-plus" aria-hidden="true" /><span className="p-button-label">Agregar nuevo servicio</span></Link>
      </div>
      {services.isLoading && <p role="status">Cargando servicios…</p>}
      {services.isError && <p role="alert" className="error-banner">No fue posible cargar los servicios de citas.</p>}
      {!services.isLoading && !services.isError && <DataTable value={sorted} dataKey="uuid" paginator rows={20} emptyMessage="No hay servicios configurados." stripedRows className="appointment-service-table">
        <Column field="name" header="Nombre" sortable />
        <Column header="Ubicación" body={(service: AppointmentService) => displayName(service.location)} />
        <Column header="Especialidad" body={(service: AppointmentService) => displayName(service.speciality)} />
        <Column field="durationMins" header="Duración (min)" sortable body={(service: AppointmentService) => service.durationMins ?? "—"} />
        <Column field="description" header="Descripción" body={(service: AppointmentService) => service.description || "—"} />
        <Column header="Acciones" body={(service: AppointmentService) => <span className="appointment-admin-actions">
          <Link href={`/appointments/admin/${encodeURIComponent(service.uuid)}`} className="p-button p-component p-button-text p-button-sm" aria-label={`Editar ${displayName(service)}`}><i className="pi pi-pencil" aria-hidden="true" /><span className="p-button-label">Editar</span></Link>
          <Button text severity="danger" size="small" icon="pi pi-trash" label="Eliminar" aria-label={`Eliminar ${displayName(service)}`} onClick={() => setPendingDelete(service)} />
        </span>} />
      </DataTable>}
    </section>}
    <Dialog visible={Boolean(pendingDelete)} header="Eliminar servicio" onHide={() => !remove.isPending && setPendingDelete(undefined)} footer={<div><Button outlined label="Cancelar" onClick={() => setPendingDelete(undefined)} disabled={remove.isPending} /><Button severity="danger" label="Eliminar" loading={remove.isPending} onClick={() => pendingDelete && remove.mutate(pendingDelete.uuid)} /></div>}>
      <p>¿Deseas eliminar el servicio <strong>{pendingDelete ? displayName(pendingDelete) : ""}</strong>?</p>
      {remove.isError && <p role="alert" className="error-banner">No fue posible eliminar el servicio. Puede tener citas o configuraciones asociadas.</p>}
    </Dialog>
  </AppShell></AuthGuard>;
}
