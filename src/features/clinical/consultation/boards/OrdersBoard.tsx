import { useQuery } from "@tanstack/react-query";
import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { InputText } from "primereact/inputtext";
import { InputTextarea } from "primereact/inputtextarea";
import { ProgressSpinner } from "primereact/progressspinner";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { getAllOrderables } from "@/services/bahmni/consultation";
import { useConsultation } from "../ConsultationContext";
import {
  activeOrderForConcept,
  configuredOrderableTemplates,
  orderableGroups,
  orderableIsIndirectlySelected,
  orderableMatchesSearch,
  orderableName,
  orderableParentMap,
  templateOrderableUuids,
  type OrderableConcept,
} from "../orderables";
import type { ConsultationOrder } from "../types";
import { clientId, displayName } from "./shared";

function hasConfiguredOption(options: string[], name: string): boolean {
  return options.some((option) => option.toLocaleLowerCase() === name.toLocaleLowerCase());
}

function conceptForOrder(orderable: OrderableConcept) {
  return {
    uuid: orderable.uuid,
    name: orderableName(orderable),
    names: orderable.names,
    conceptClass: orderable.conceptClass,
    set: orderable.set,
    setMembers: orderable.setMembers,
  };
}

export function OrdersBoard() {
  const { t } = useTranslation();
  const { context, draft, updateDraft } = useConsultation();
  const orderables = useQuery({
    queryKey: ["consultation-all-orderables"],
    queryFn: getAllOrderables,
    enabled: context.mode !== "retrospective",
  });
  const templates = useMemo(() => configuredOrderableTemplates(orderables.data, context.appConfig.orderTypeClassMap), [context.appConfig.orderTypeClassMap, orderables.data]);
  const [selectedTemplateUuid, setSelectedTemplateUuid] = useState<string | null>();
  const [activeCategoryUuid, setActiveCategoryUuid] = useState<string>();
  const [search, setSearch] = useState("");
  const [noteOrderId, setNoteOrderId] = useState<string>();
  const [noteText, setNoteText] = useState("");

  const activeTemplateUuid = selectedTemplateUuid === undefined ? templates[0]?.uuid : selectedTemplateUuid ?? undefined;
  const activeTemplate = templates.find((template) => template.uuid === activeTemplateUuid);
  const activeCategory = activeTemplate?.setMembers.find((category) => category.uuid === activeCategoryUuid) ?? activeTemplate?.setMembers[0];
  const parentMap = activeTemplate ? orderableParentMap(activeTemplate) : new Map<string, Set<string>>();
  const templateUuids = activeTemplate ? templateOrderableUuids(activeTemplate) : new Set<string>();
  const selectedOrders = draft.orders.filter((order) => !order.voided && templateUuids.has(order.concept.uuid));
  const selectedNoteOrder = draft.orders.find((order) => order.clientId === noteOrderId);
  const activeOptions = activeTemplate && orderableName(activeTemplate).toLocaleLowerCase().includes("radiolog")
    ? context.appConfig.enableRadiologyOrderOptions
    : context.appConfig.enableLabOrderOptions;
  const urgentEnabled = hasConfiguredOption(activeOptions, "Urgent");
  const needsPrintEnabled = hasConfiguredOption(activeOptions, "NeedsPrint");
  const printMarker = t("CLINICAL_ORDER_RADIOLOGY_NEED_PRINT", { defaultValue: "Necesita impresora para esta orden" }).trim();

  const replaceOrders = (updater: (orders: ConsultationOrder[]) => ConsultationOrder[]) => updateDraft((current) => ({ ...current, orders: updater(current.orders) }), "orders");
  const patchOrder = (clientIdToPatch: string, patch: Partial<ConsultationOrder>) => replaceOrders((orders) => orders.map((order) => order.clientId === clientIdToPatch ? { ...order, ...patch } : order));

  const toggleOrder = (orderable: OrderableConcept) => {
    if (!activeTemplate || orderableIsIndirectlySelected(draft.orders, orderable.uuid, parentMap)) return;
    const current = draft.orders.find((order) => !order.voided && order.concept.uuid === orderable.uuid);
    const active = activeOrderForConcept(draft.orders, orderable.uuid);
    setSearch("");
    replaceOrders((orders) => {
      if (active) {
        return active.uuid
          ? orders.map((order) => order.clientId === active.clientId ? { ...order, action: "DISCONTINUE", dirty: true } : order)
          : orders.filter((order) => order.clientId !== active.clientId);
      }
      if (current?.action === "DISCONTINUE") {
        return orders.map((order) => order.clientId === current.clientId ? { ...order, action: undefined, dirty: false } : order);
      }
      const childUuids = new Set(orderable.setMembers.map((child) => child.uuid));
      const withoutChildren = orders.flatMap((order) => {
        if (!childUuids.has(order.concept.uuid) || order.action === "DISCONTINUE") return [order];
        return order.uuid ? [{ ...order, action: "DISCONTINUE" as const, dirty: true }] : [];
      });
      return [...withoutChildren, { clientId: clientId("order"), concept: conceptForOrder(orderable), dirty: true }];
    });
  };

  const activateTemplate = (template: OrderableConcept) => {
    if (activeTemplateUuid === template.uuid) {
      setSelectedTemplateUuid(null);
      setActiveCategoryUuid(undefined);
      return;
    }
    setSelectedTemplateUuid(template.uuid);
    setActiveCategoryUuid(template.setMembers[0]?.uuid);
    setSearch("");
  };

  const openNotes = (order: ConsultationOrder) => {
    setNoteOrderId(order.clientId);
    setNoteText(order.commentToFulfiller ?? "");
  };
  const closeNotes = () => {
    setNoteOrderId(undefined);
    setNoteText("");
  };
  const saveNotes = () => {
    if (!selectedNoteOrder || selectedNoteOrder.uuid) return closeNotes();
    patchOrder(selectedNoteOrder.clientId, { commentToFulfiller: noteText, needsPrint: noteText.includes(printMarker), dirty: true });
    closeNotes();
  };

  if (context.mode === "retrospective") return <p className="warning-banner">{t("ORDER_NOT_ALLOWED_IN_RETROSPECTIVE_MESSAGE", { defaultValue: "Las órdenes no están disponibles en entradas retrospectivas." })}</p>;

  return <div className="consultation-board-stack consultation-orders-board">
    {orderables.isLoading && <div className="centered consultation-orderables-loading"><ProgressSpinner /><p>Cargando órdenes configuradas…</p></div>}
    {orderables.isError && <div role="alert" className="error-banner consultation-orderables-error"><span>No fue posible cargar el concepto All Orderables.</span><Button outlined label="Reintentar" icon="pi pi-refresh" onClick={() => void orderables.refetch()} /></div>}
    {orderables.isSuccess && templates.length === 0 && <p className="empty-state">No hay tipos de órdenes configurados en All Orderables.</p>}

    {templates.map((template) => {
      const expanded = template.uuid === activeTemplateUuid;
      return <section className={`consultation-order-template${expanded ? " expanded" : ""}`} key={template.uuid}>
        <button type="button" className="consultation-order-template-toggle" aria-expanded={expanded} onClick={() => activateTemplate(template)}>
          <i className={`pi ${expanded ? "pi-chevron-down" : "pi-chevron-right"}`} aria-hidden="true" />
          <span>{orderableName(template)}</span>
        </button>
        {expanded && <div className="consultation-order-template-content">
          <div className="consultation-order-search field">
            <label htmlFor={`order-search-${template.uuid}`}>{t("SEARCH_KEY", { defaultValue: "Buscar" })}</label>
            <span className="p-input-icon-right">
              {search && <button type="button" aria-label="Limpiar búsqueda" onClick={() => setSearch("")}><i className="pi pi-times" /></button>}
              <InputText id={`order-search-${template.uuid}`} value={search} onChange={(event) => setSearch(event.target.value)} />
            </span>
          </div>

          <div className="consultation-order-selector-layout">
            <aside className="consultation-order-sidebar">
              <nav aria-label={`Categorías de ${orderableName(template)}`} className="consultation-order-categories">
                {template.setMembers.map((category) => <button type="button" key={category.uuid} className={category.uuid === activeCategory?.uuid ? "active" : ""} aria-current={category.uuid === activeCategory?.uuid ? "true" : undefined} onClick={() => { setActiveCategoryUuid(category.uuid); setSearch(""); }}>{orderableName(category)}</button>)}
              </nav>
              <section className="consultation-selected-orders">
                <h3>{t("SELECTED_ORDERS_LABEL", { defaultValue: "Órdenes seleccionadas" })}</h3>
                {selectedOrders.length === 0 && <p>{t("SELECTED_ORDERS_EMPTY_MESSAGE", { defaultValue: "Las órdenes seleccionadas están vacías" })}</p>}
                <ul>{selectedOrders.map((order) => {
                  const discontinued = order.action === "DISCONTINUE";
                  return <li key={order.clientId}>
                    <span className={discontinued ? "discontinued" : ""}>{displayName(order.concept)}</span>
                    <div>
                      {urgentEnabled && !discontinued && <Button text rounded icon="pi pi-exclamation-triangle" aria-label={`${order.isUrgent ? "Quitar urgencia de" : "Marcar urgente"} ${displayName(order.concept)}`} aria-pressed={order.isUrgent === true} className={order.isUrgent ? "urgent" : ""} disabled={Boolean(order.uuid)} onClick={() => patchOrder(order.clientId, { isUrgent: !order.isUrgent, dirty: true })} />}
                      <Button text rounded icon="pi pi-file-edit" aria-label={`Notas de ${displayName(order.concept)}`} className={order.commentToFulfiller ? "has-notes" : ""} onClick={() => openNotes(order)} />
                      <Button text rounded severity={discontinued ? "secondary" : "danger"} icon={discontinued ? "pi pi-undo" : "pi pi-times"} aria-label={`${discontinued ? "Restaurar" : "Quitar"} ${displayName(order.concept)}`} onClick={() => toggleOrder({ uuid: order.concept.uuid, name: order.concept.name, names: [], set: false, setMembers: [] })} />
                    </div>
                  </li>;
                })}</ul>
              </section>
            </aside>

            <div className="consultation-order-groups">
              {orderableGroups(activeCategory).map((group) => {
                const groupOrderables = activeCategory?.setMembers.filter((orderable) => orderable.conceptClass?.name === group.name && orderableMatchesSearch(orderable, search)) ?? [];
                if (groupOrderables.length === 0) return null;
                return <fieldset key={group.name}>
                  <legend>{group.description ?? group.name}</legend>
                  <div className="consultation-orderable-grid">{groupOrderables.map((orderable) => {
                    const indirect = orderableIsIndirectlySelected(draft.orders, orderable.uuid, parentMap);
                    const active = Boolean(activeOrderForConcept(draft.orders, orderable.uuid)) || indirect;
                    return <Button type="button" outlined={!active} key={orderable.uuid} label={orderableName(orderable)} icon={active ? "pi pi-check" : undefined} aria-pressed={active} disabled={indirect} title={orderableName(orderable)} onClick={() => toggleOrder(orderable)} />;
                  })}</div>
                </fieldset>;
              })}
              {activeCategory && activeCategory.setMembers.every((orderable) => !orderableMatchesSearch(orderable, search)) && <p className="empty-state">No se encontraron órdenes en esta categoría.</p>}
            </div>
          </div>
        </div>}
      </section>;
    })}

    <Dialog visible={Boolean(selectedNoteOrder)} modal header={`${t("ENTER_ORDER_NOTE_LABEL", { defaultValue: "Nota de la orden" })} - ${selectedNoteOrder ? displayName(selectedNoteOrder.concept) : ""}`} onHide={closeNotes} footer={selectedNoteOrder?.uuid
      ? <Button label="Cerrar" onClick={closeNotes} />
      : <div className="toolbar"><Button outlined label="Cancelar" onClick={closeNotes} /><Button label={t("OKAY_LABEL", { defaultValue: "Aceptar" })} onClick={saveNotes} /></div>}>
      <InputTextarea aria-label="Nota de la orden" autoFocus rows={4} autoResize disabled={Boolean(selectedNoteOrder?.uuid)} value={noteText} onChange={(event) => setNoteText(event.target.value)} />
      {needsPrintEnabled && !selectedNoteOrder?.uuid && <Button type="button" outlined icon="pi pi-print" label={t("CLINICAL_ORDER_RADIOLOGY_NEED_PRINT_BUTTON", { defaultValue: "Necesita impresora" })} disabled={noteText.includes(printMarker)} onClick={() => setNoteText(`${printMarker}${noteText ? ` ${noteText}` : ""}`)} />}
      {selectedNoteOrder?.uuid && <p className="info-banner">{t("ORDER_CAN_NOT_EDIT_AFTER_SAVE_MESSAGE", { defaultValue: "La nota no puede editarse después de guardar la orden." })}</p>}
    </Dialog>
  </div>;
}
