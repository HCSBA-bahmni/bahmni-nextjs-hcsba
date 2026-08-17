import { Button } from "primereact/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/router";
import { useMemo } from "react";
import { useAuth } from "@/features/auth/AuthContext";
import { changeAppointmentStatus, changeProviderResponse } from "@/services/bahmni/appointments";
import { allowedStatusActions, canEditAppointment } from "./domain";
import type { Appointment, AppointmentAppConfig, AppointmentStatus, ProviderResponse } from "./types";

function teleconsultationUrl(appointment: Appointment): string {
  const value = appointment.teleconsultationLink ?? appointment.additionalInfo.tele_health_video_link ?? appointment.additionalInfo.teleconsultationUrl;
  if (typeof value === "string" && value.trim()) return value;
  return appointment.teleconsultation ? `${window.location.origin}/teleconsultation/${encodeURIComponent(appointment.uuid)}` : "";
}

export function AppointmentActions({ appointment, config, compact = false }: { appointment: Appointment; config: AppointmentAppConfig; compact?: boolean }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, provider } = useAuth();
  const privileges = useMemo(() => new Set(user?.privileges.map((entry) => entry.name ?? entry.display).filter((value): value is string => Boolean(value)) ?? []), [user]);
  const invalidate = async () => { await queryClient.invalidateQueries({ queryKey: ["appointments"] }); };
  const statusMutation = useMutation({ mutationFn: ({ status, all }: { status: AppointmentStatus; all: boolean }) => changeAppointmentStatus(appointment.uuid, status, all, Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Santiago"), onSuccess: invalidate });
  const responseMutation = useMutation({ mutationFn: (response: ProviderResponse) => {
    if (!provider?.uuid) throw new Error("El usuario actual no tiene un proveedor asociado.");
    return changeProviderResponse(appointment.uuid, provider.uuid, response);
  }, onSuccess: invalidate });
  const recurring = appointment.recurring || Boolean(appointment.recurringAppointment);
  const applyStatus = (status: AppointmentStatus) => {
    const all = recurring && window.confirm("Aceptar aplica el cambio a toda la recurrencia. Cancelar lo aplica sólo a esta cita.");
    statusMutation.mutate({ status, all });
  };
  const mine = appointment.providers.find((entry) => entry.uuid === provider?.uuid);
  const meeting = typeof window === "undefined" ? "" : teleconsultationUrl(appointment);
  return <div className={`appointment-actions${compact ? " compact" : ""}`}>
    {meeting && <><Button text size="small" icon="pi pi-video" label={compact ? undefined : "Unirse"} aria-label="Unirse a teleconsulta" onClick={() => window.open(meeting, "_blank", "noopener,noreferrer")} /><Button text size="small" icon="pi pi-copy" label={compact ? undefined : "Copiar enlace"} aria-label="Copiar enlace de teleconsulta" onClick={() => void navigator.clipboard.writeText(meeting)} /></>}
    {canEditAppointment(appointment, provider?.uuid, privileges) && <Button text size="small" icon="pi pi-pencil" label={compact ? undefined : "Editar"} aria-label="Editar cita" onClick={() => void router.push(`/appointments/${appointment.uuid}`)} />}
    {mine && mine.response !== "ACCEPTED" && <Button text size="small" severity="success" label="Aceptar" onClick={() => responseMutation.mutate("ACCEPTED")} />}
    {mine && mine.response !== "REJECTED" && <Button text size="small" severity="danger" label="Rechazar" onClick={() => responseMutation.mutate("REJECTED")} />}
    {allowedStatusActions(config, appointment.status).map((status) => <Button key={status} text size="small" label={status === "CheckedIn" ? "Admitir" : status === "Completed" ? "Completar" : status === "Missed" ? "Ausente" : "Cancelar"} severity={status === "Cancelled" || status === "Missed" ? "danger" : undefined} loading={statusMutation.isPending && statusMutation.variables?.status === status} onClick={() => applyStatus(status)} />)}
    {config.enableResetAppointmentStatuses.includes(appointment.status) && privileges.has("Reset Appointment Status") && <Button text size="small" icon="pi pi-undo" label="Deshacer admisión" onClick={() => applyStatus("Scheduled")} />}
    {(statusMutation.isError || responseMutation.isError) && <span role="alert" className="field-error">No se pudo actualizar la cita.</span>}
  </div>;
}
