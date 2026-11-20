import type { PabellonItem } from "@/services/bahmni/pabellon";
import type { PabellonCatalogueOption } from "@/services/bahmni/pabellonCatalogues";
import { loadPabellonSmallCatalogue } from "./pabellonSmallCatalogue";
import { crearDefinicionSolicitudPdf } from "./native/components/Protocolos/solicitud-documento";
import logo from "./native/public/img/LHCSBA.png";
import { requestSnapshotAge } from "./requestSnapshotAge";
import { formatPabellonDate } from "./pabellonDates";

export function requestPDFData(item: PabellonItem, masters: { assessments: PabellonCatalogueOption[]; samples: PabellonCatalogueOption[]; theatres: PabellonCatalogueOption[] }) {
  const r = item.request;
  if (!r?.sections?.length || !r.catalogueSelections || item.requestSnapshot.status !== "available") throw new Error("Esta captura no contiene el detalle completo necesario para generar su PDF.");
  const fields = new Map(r.sections.flatMap(section => section.fields.map(field => [section.key + ":" + field.key, field])));
  const value = (section: string, key: string) => fields.get(section + ":" + key)?.value ?? "";
  const shownDate = formatPabellonDate(value("patient", "birth-date"));
  const idLabel = fields.get("patient:identification")?.label;
  const type = ({ "RUT": "rut", "N° ficha": "ficha", "Pasaporte": "pasaporte", "Cédula": "cedula" } as Record<string, string>)[idLabel ?? ""] ?? "";
  const selection = r.catalogueSelections;
  const sorted = (values: PabellonCatalogueOption[]) => [...values].sort((a, b) => Number(a.sourceId) - Number(b.sourceId));
  masters = { assessments: sorted(masters.assessments), samples: sorted(masters.samples), theatres: sorted(masters.theatres) };
  for (const [group, options] of [["preoperative-assessments", masters.assessments], ["blood-samples", masters.samples], ["theatres", masters.theatres]] as const) {
    if (selection[group].some(id => !options.some(option => option.sourceId === id))) throw new Error("Un código histórico ya no está disponible en el catálogo de presentación. No se generó un PDF que pudiera omitir esa selección.");
  }
  const n = (ids: string[]) => ids.map(Number);
  const prior = value("hospitalization", "prior-hospitalization") === "SI";
  const bed = !!value("destination", "bed");
  const laterality = value("surgery", "laterality");
  return {
    nro_solicitud: r.requestNumber ?? "", tipo_identificacion_paciente: type, identificacion_paciente: value("patient", "identification"),
    nombres_paciente: value("patient", "names"), apellido_paterno: value("patient", "first-surname"), apellido_materno: value("patient", "second-surname"),
    nombre_completo: [value("patient", "names"), value("patient", "first-surname"), value("patient", "second-surname")].filter(Boolean).join(" "),
    registro_por_ficha: type === "ficha", edad_paciente: requestSnapshotAge(item), fecha_nacimiento_paciente: shownDate === "—" || shownDate === "Fecha no válida" ? "" : shownDate,
    sexo_paciente: value("patient", "sex"), telefono_paciente: value("patient", "telephone"), comuna_paciente: value("patient", "commune"), direccion_paciente: value("patient", "address"), numero_direccion_paciente: value("patient", "address-number"), prevision_paciente: value("patient", "insurance"),
    prioridad_paciente: value("patient", "patient-priority"), alergia_latex: value("patient", "latex"), re_intervencion_quirurgica: value("patient", "reintervention"), tipo_atencion_cirugia: value("patient", "care-type"),
    paciente_hospitalizado: value("hospitalization", "hospitalized"), hospitalizacion_previa: value("hospitalization", "prior-hospitalization"), hospitalizacion_previa_validacion: prior,
    hospitalizacion_previa_dia: value("hospitalization", "prior-days"), hospitalizacion_previa_motivo: value("hospitalization", "prior-reason"), servicio_ingreso: value("hospitalization", "admission"), diagnostico_preoperatorio: value("hospitalization", "diagnosis"),
    mantenedor_ev_preoperatorias: masters.assessments.map(v => ({ id: Number(v.sourceId), evaluacion: v.display })), ev_preoperatorias: n(selection["preoperative-assessments"]), ev_preoperatoria_otros_validacion: !!value("assessment", "assessment-other"), ev_preoperatoria_otros: value("assessment", "assessment-other"), asa: value("assessment", "asa"),
    mantenedor_pabellones: masters.theatres.map(v => ({ id: Number(v.sourceId), ubicacion: v.display })), ubicacion_pabellon: { id: Number(selection.theatres[0] ?? 0) },
    nombre_medico_indica_cirugia: value("surgery", "surgeon"), especialidad_medico_indica_cirugia: value("surgery", "specialty"), tiempo_quirurgico: value("surgery", "duration"),
    via_abordaje: value("surgery", "approach"), via_abordaje_validacion: !!value("surgery", "approach-type"), tipo_via_abordaje: value("surgery", "approach-type"), plan_quirugico: value("surgery", "procedures"),
    lateralidad: laterality, tipo_lateralidad: laterality === "SI" ? value("surgery", "laterality-type") : "", paciente_oncologico: value("surgery", "oncology"), tipo_cirugia: value("surgery", "surgery-type"), plan_adicional_validacion: !!value("surgery", "additional-plan"), plan_adicional: value("surgery", "additional-plan"),
    biopsia_validacion: !!value("biopsy", "biopsy-type"), tipo_biopsia: value("biopsy", "biopsy-type"), producto_sanguineo_validacion: selection["blood-samples"].length > 0,
    mantenedor_muestras_sangre: masters.samples.map(v => ({ id: Number(v.sourceId), descripcion: v.display })), tipo_hemoderivado: n(selection["blood-samples"]), factor_rh: value("blood", "rh") === "SI" ? "RH+" : value("blood", "rh") === "NO" ? "RH-" : "", grupo_sanguineo: value("blood", "blood-group"), solicitud_donantes: value("blood", "donor"), descripcion_producto_sanguineo: value("blood", "description"),
    kits_solicitados: value("supplies", "kits"), equipos_medicos_solicitados: value("supplies", "equipment"), insumos_opcionales: value("supplies", "optional-supplies"),
    cama_salida_validacion: bed, requiere_cama_salida: bed ? "SI" : "NO", cama_salida: [value("destination", "bed"), value("destination", "bed-type")].filter(Boolean).join(" -> "), prioridad_salida: value("destination", "output-priority"), condiciones_prioridad: value("destination", "conditions"), servicio_origen: value("destination", "origin-service"), servicio_opera: "", tipo_prioridad: value("destination", "priority-type"), prioridad: "",
  };
}
export async function renderRequestPDF(item: PabellonItem, signal: AbortSignal): Promise<Blob> {
  const [assessments, samples, theatres, image, engine, fonts] = await Promise.all([
    loadPabellonSmallCatalogue("preoperative-assessments", signal), loadPabellonSmallCatalogue("blood-samples", signal), loadPabellonSmallCatalogue("theatres", signal),
    fetch(logo.src, { signal, cache: "force-cache" }).then(r => { if (!r.ok) throw new Error("No fue posible cargar el logo original de Pabellón."); return r.blob(); }),
    import("pdfmake/build/pdfmake"), import("pdfmake/build/vfs_fonts"),
  ]);
  signal.throwIfAborted();
  const imageURL = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("No fue posible cargar el logo.")); reader.readAsDataURL(image); });
  const definition = crearDefinicionSolicitudPdf(requestPDFData(item, { assessments, samples, theatres }), imageURL);
  const pdfMake = engine.default;
  const fontObject = fonts.default as unknown as { pdfMake?: { vfs: Record<string, string> }; vfs?: Record<string, string> };
  const vfs = fontObject.pdfMake?.vfs ?? fontObject.vfs ?? fonts.default as unknown as Record<string, string>;
  const blob = await new Promise<Blob>((resolve, reject) => {
    const finish = (result?: Blob, error?: Error) => { clearTimeout(timer); signal.removeEventListener("abort", abort); if (error) reject(error); else resolve(result!); };
    const abort = () => finish(undefined, new DOMException("Aborted", "AbortError"));
    const timer = setTimeout(() => finish(undefined, new Error("El PDF tardó demasiado en generarse. Inténtelo nuevamente.")), 30000);
    signal.addEventListener("abort", abort, { once: true });
    try { pdfMake.createPdf(definition, undefined, undefined, vfs).getBlob(value => finish(value)); } catch { finish(undefined, new Error("No fue posible generar el PDF original de Pabellón.")); }
  });
  signal.throwIfAborted(); return blob;
}
