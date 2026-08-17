import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/router";
import { Button } from "primereact/button";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AuthGuard } from "@/features/auth/AuthGuard";
import { useAuth } from "@/features/auth/AuthContext";
import { toClinicalPatientContext } from "@/features/clinical/patientContext";
import { loadOrderFulfillment, persistOrderFulfillment } from "@/features/orders/fulfillment";
import { FulfillmentForm, type PendingFulfillmentValues } from "@/features/orders/FulfillmentForm";
import { hasPrivilege } from "@/services/bahmni/auth";
import { getPatientProfile } from "@/services/bahmni/patients";

const text = (value: unknown): string => typeof value === "string" || typeof value === "number" ? String(value) : "";

export default function OrderFulfillmentPage() {
  const router = useRouter();
  const { user, provider, location } = useAuth();
  const [values, setValues] = useState<Record<string, PendingFulfillmentValues>>({});
  const [saving, setSaving] = useState(false);
  const [savedVersion, setSavedVersion] = useState(0);
  const [saveMessage, setSaveMessage] = useState<{ kind: "error" | "success"; text: string }>();
  const patientUuid = typeof router.query.patientUuid === "string" ? router.query.patientUuid : "";
  const orderType = typeof router.query.orderType === "string" ? router.query.orderType : "";
  const locale = user?.userProperties?.defaultLocale ?? "es";
  const allowed = hasPrivilege(user, "app:orders");
  const profile = useQuery({ queryKey: ["patient", patientUuid], queryFn: () => getPatientProfile(patientUuid), enabled: allowed && Boolean(patientUuid) });
  const fulfillment = useQuery({ queryKey: ["orders", "fulfillment", patientUuid, orderType, locale], queryFn: () => loadOrderFulfillment(patientUuid, orderType, locale), enabled: allowed && Boolean(patientUuid && orderType) });
  const patient = profile.data ? toClinicalPatientContext(profile.data, patientUuid) : undefined;
  const loading = profile.isLoading || fulfillment.isLoading;
  const save = async () => {
    if (!fulfillment.data || !location?.uuid) return setSaveMessage({ kind: "error", text: "La sesión no tiene una ubicación clínica seleccionada." });
    setSaving(true); setSaveMessage(undefined);
    try {
      await persistOrderFulfillment({ patientUuid, locationUuid: location.uuid, providerUuid: provider?.uuid, orderType, formConceptUuid: fulfillment.data.formConceptUuid, members: fulfillment.data.formMembers, orders: fulfillment.data.orders, drafts: values });
      setValues({}); setSavedVersion((current) => current + 1); setSaveMessage({ kind: "success", text: "Resultados guardados correctamente." });
      await fulfillment.refetch();
    } catch (error) {
      setSaveMessage({ kind: "error", text: error instanceof Error ? error.message : "No fue posible guardar los resultados." });
    } finally { setSaving(false); }
  };
  return <AuthGuard><AppShell title="Cumplimiento de órdenes">
    {!allowed && <p role="alert" className="error-banner">No tiene el privilegio app:orders requerido por el módulo legacy.</p>}
    {allowed && loading && <p role="status">Cargando órdenes…</p>}
    {allowed && (profile.isError || fulfillment.isError) && <p role="alert" className="error-banner">No fue posible cargar las órdenes configuradas para este paciente.</p>}
    {allowed && patient && fulfillment.data && <>
      <section className="clinical-patient-header panel"><div><span className="clinical-eyebrow">{patient.identifier}</span><h2>{patient.name}</h2><p>{patient.gender || "Sexo no registrado"}{patient.age !== undefined ? ` · ${patient.age} años` : ""}</p></div><div className="clinical-visit-status"><strong>{orderType}</strong><span>{fulfillment.data.formName}</span></div><div className="toolbar"><Button outlined icon="pi pi-users" label="Volver a búsqueda" onClick={() => void router.push("/orders")} /></div></section>
      <section className="panel orders-fulfillment-panel"><header className="clinical-card-header"><h2>{orderType}</h2><span>{fulfillment.data.orders.length} órdenes</span></header>
        {saveMessage && <p role={saveMessage.kind === "error" ? "alert" : "status"} className={saveMessage.kind === "error" ? "error-banner" : "success-banner"}>{saveMessage.text}</p>}
        {fulfillment.data.orders.length === 0 && <div className="clinical-search-empty"><i className="pi pi-inbox" aria-hidden="true" /><strong>Sin órdenes</strong><span>No hay {orderType} presentes para este paciente.</span></div>}
        <div className="orders-fulfillment-list">{fulfillment.data.orders.map((order) => {
          const source = order.source; const comment = text(source.commentToFulfiller);
          return <details key={order.id} className="orders-fulfillment-order"><summary><span><i className="pi pi-chevron-right" aria-hidden="true" /><strong>{order.label}</strong></span><span>{order.hasObservations ? "Con resultados" : "Nueva"}</span></summary><div className="orders-fulfillment-summary"><dl className="clinical-details"><div><dt>Profesional</dt><dd>{order.provider || "—"}</dd></div><div><dt>Fecha de orden</dt><dd>{order.orderDate ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(order.orderDate)) : "—"}</dd></div><div><dt>Número de orden</dt><dd>{text(source.orderNumber) || "—"}</dd></div><div><dt>UUID de orden</dt><dd>{text(source.orderUuid ?? source.uuid) || "—"}</dd></div></dl>{comment && <p><i className="pi pi-comments" aria-hidden="true" /> {comment}</p>}<FulfillmentForm key={`${order.id}-${savedVersion}`} members={fulfillment.data.formMembers} onChange={(next) => setValues((current) => ({ ...current, [order.id]: next }))} /></div></details>;
        })}</div>
        <div className="toolbar orders-save-toolbar"><Button icon="pi pi-save" label={saving ? "Guardando…" : "Guardar"} loading={saving} disabled={saving || !location?.uuid} onClick={() => void save()} /></div>
      </section>
    </>}
  </AppShell></AuthGuard>;
}
