import {getLabelIdentificacion} from '../../utils/functions/IdentificacionPaciente.js';
import {limpiarTextoVisible} from '../../utils/functions/TextoVisible.js';

// Canonical request template: native Pabellón first, the same factory in HIS.
// Values come from the caller's snapshot, never current Persona or today's date.
const texto = (value) => {
    if (Array.isArray(value)) return value.map(texto).filter(Boolean).join('\n');
    if (value === null || value === undefined) return '';
    return limpiarTextoVisible(String(value)).trim();
};
const respuesta = (value) => {
    if (value === true || value === 1) return 'SI';
    if (value === false || value === 0) return 'NO';
    const normalized = texto(value).toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return normalized === 'SI' || normalized === 'NO' ? normalized : 'N/A';
};
const campo = (label, value, empty = 'N/A') => ({
    stack: [
        {text: label, fontSize: 8.5, bold: true, color: '#46515b', margin: [0, 0, 0, 1]},
        {text: texto(value) || empty, fontSize: 10, color: '#222222'}
    ]
});
const contenidoSinLineas = {
    hLineWidth: () => 0, vLineWidth: () => 0,
    paddingLeft: () => 5, paddingRight: () => 5,
    paddingTop: () => 1, paddingBottom: () => 1
};
const fila = (cells, widths = cells.map(() => '*')) => ({
    table: {widths, body: [cells]}, layout: contenidoSinLineas, margin: [0, 0, 0, 0.5]
});
const seccion = (title, rows) => ({
    table: {
        widths: ['*'], headerRows: 1, keepWithHeaderRows: 1,
        body: [
            [{text: title, bold: true, fontSize: 11, color: '#263238', fillColor: '#edf0f2', margin: [5, 2, 5, 2]}],
            ...rows.map(row => [{stack: [row]}])
        ]
    },
    layout: {
        hLineWidth: () => 0, vLineWidth: () => 0,
        paddingLeft: () => 0, paddingRight: () => 0,
        paddingTop: (index) => index === 1 ? 2 : 0, paddingBottom: () => 0
    }, margin: [0, 3, 0, 0]
});
const aviso = (message) => ({text: message, italics: true, fontSize: 9.5, color: '#46515b', margin: [5, 2, 5, 3]});
const opcion = (label, checked, circle = false) => ({
    stack: [
        ...(circle ? [{
            table: {widths: ['*'], heights: 20, body: [[{text: texto(label), fontSize: 8.5, bold: true, alignment: 'center'}]]},
            layout: {hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0}
        }] : [{text: texto(label), fontSize: 8.5, bold: true, alignment: 'center'}]),
        {
            canvas: circle ? [
                {type: 'ellipse', x: 6, y: 6, r1: 5, r2: 5, lineWidth: 0.6, lineColor: '#9aa5ac'},
                ...(checked ? [{type: 'ellipse', x: 6, y: 6, r1: 3, r2: 3, lineWidth: 0, color: '#2196F3'}] : [])
            ] : [
                {type: 'rect', x: 0, y: 0, w: 11, h: 11, r: 1, lineWidth: 0.6, lineColor: checked ? '#2196F3' : '#9aa5ac', ...(checked ? {color: '#2196F3'} : {})},
                ...(checked ? [
                    {type: 'line', x1: 2, y1: 5, x2: 4.5, y2: 8, lineWidth: 1.3, lineColor: 'white'},
                    {type: 'line', x1: 4.5, y1: 8, x2: 9, y2: 2.5, lineWidth: 1.3, lineColor: 'white'}
                ] : [])
            ],
            alignment: 'center', margin: [0, 2, 0, 0]
        }
    ], width: circle ? '*' : 'auto', margin: [0, 1, 4, 2]
});

export function crearDefinicionSolicitudPdf(dataPdf = {}, logoDataUrl) {
    const d = dataPdf || {};
    const hospitalizado = respuesta(d.paciente_hospitalizado);
    const previa = respuesta(d.hospitalizacion_previa);
    const lateralidad = respuesta(d.lateralidad);
    const selected = (values, id) => (values || []).some(value => String(value) === String(id));
    const labelIdentificacion = getLabelIdentificacion(d.tipo_identificacion_paciente);
    const identificacion = texto(d.identificacion_paciente) || texto(d.rut_paciente) || texto(d.pasaporte_paciente) || texto(d.cedula_paciente) || texto(d.ficha_paciente);
    const paciente = [
        fila([campo(labelIdentificacion || 'Identificación', identificacion), campo('Nombres', d.nombres_paciente), campo('Apellido paterno', d.apellido_paterno), campo('Apellido materno', d.apellido_materno, '')], [105, '*', 115, 115]),
        fila([campo('Edad / Fecha de nacimiento', [texto(d.edad_paciente), texto(d.fecha_nacimiento_paciente)].filter(Boolean).join(' / ')), campo('Sexo', d.sexo_paciente), campo('Teléfono de contacto', d.telefono_paciente), campo('Comuna', d.comuna_paciente)], ['*', 65, 110, 145]),
        fila([campo('Dirección', d.direccion_paciente), campo('N° casa / departamento', d.numero_direccion_paciente), campo('Previsión', d.prevision_paciente)], ['*', 120, 145]),
        fila([campo('Prioridad paciente', d.prioridad_paciente), campo('¿Paciente oncológico?', respuesta(d.paciente_oncologico)), campo('¿Alergia al látex?', respuesta(d.alergia_latex)), campo('¿Reintervención quirúrgica?', respuesta(d.re_intervencion_quirurgica))]),
        fila([campo('Tipo de atención', d.tipo_atencion_cirugia), campo('¿Paciente hospitalizado?', hospitalizado), ...(hospitalizado !== 'SI' ? [campo('¿Hospitalización previa?', previa === 'NO' ? 'NO · Paciente ambulatorio' : previa)] : [])]),
        ...(hospitalizado !== 'SI' && previa === 'SI' ? [
            fila([campo('Días de hospitalización previa', d.hospitalizacion_previa_dia), campo('Servicio de ingreso', d.servicio_ingreso, '')], [160, '*']),
            fila([campo('Motivo de hospitalización previa', d.hospitalizacion_previa_motivo)])
        ] : [fila([campo('Servicio de ingreso', d.servicio_ingreso, '')])]),
        fila([campo('Diagnóstico preoperatorio', d.diagnostico_preoperatorio)])
    ];
    const evaluaciones = (d.mantenedor_ev_preoperatorias || []).map(item => opcion(item.evaluacion, selected(d.ev_preoperatorias, item.id)));
    const ubicaciones = (d.mantenedor_pabellones || []).map(item => opcion(item.ubicacion, String(item.id) === String(d.ubicacion_pabellon?.id), true));
    const evaluacion = [
        fila([
            {stack: [{text: 'Evaluaciones preoperatorias', fontSize: 8.5, bold: true, color: '#46515b'}, evaluaciones.length ? {columns: evaluaciones, columnGap: 2} : {text: 'Sin evaluaciones consignadas', fontSize: 10}]},
            campo('ASA', d.asa)
        ], ['*', 105]),
        ...(d.ev_preoperatoria_otros_validacion ? [fila([campo('Otras evaluaciones', d.ev_preoperatoria_otros)])] : []),
        fila([{stack: [
            {text: 'Ubicación de la cirugía', fontSize: 8.5, bold: true, color: '#46515b', margin: [0, 0, 0, 2]},
            ubicaciones.length ? {columns: ubicaciones, columnGap: 4} : {text: 'Ubicación no consignada', fontSize: 10}
        ]}])
    ];
    const programacion = [
        fila([campo('Médico que indica la cirugía', d.nombre_medico_indica_cirugia), campo('Especialidad', d.especialidad_medico_indica_cirugia), campo('Tiempo quirúrgico', d.tiempo_quirurgico)], ['*', '*', 90]),
        fila([campo('Vía de abordaje', d.via_abordaje), ...(d.via_abordaje_validacion || texto(d.tipo_via_abordaje) ? [campo('Tipo de vía', d.tipo_via_abordaje)] : [])]),
        fila([campo('Plan quirúrgico', d.plan_quirugico)]),
        fila([campo('Tipo de cirugía', d.tipo_cirugia), campo('¿Lateralidad?', lateralidad), ...(lateralidad === 'SI' ? [campo('Tipo de lateralidad', d.tipo_lateralidad)] : [])]),
        fila([campo('Plan adicional', d.plan_adicional_validacion ? d.plan_adicional : 'No se indicó plan adicional')])
    ];
    const biopsia = d.biopsia_validacion ? [fila([campo('Tipo de biopsia', d.tipo_biopsia)])] : [aviso('No se solicitaron biopsias para esta solicitud')];
    const sangre = d.producto_sanguineo_validacion ? [
        fila([campo('Tipo de hemoderivado', (d.mantenedor_muestras_sangre || []).filter(item => selected(d.tipo_hemoderivado, item.id)).map(item => item.descripcion)), campo('Factor RH', d.factor_rh), campo('Grupo sanguíneo', d.grupo_sanguineo), campo('¿Se solicitaron donantes?', respuesta(d.solicitud_donantes))], ['*', 65, 90, 120]),
        fila([campo('Descripción de solicitud (unidades)', d.descripcion_producto_sanguineo)])
    ] : [aviso('No se solicitaron productos sanguíneos para esta solicitud')];
    const insumos = [
        fila([campo('Kits solicitados', d.kits_solicitados, 'No se solicitaron kits')]),
        fila([campo('Equipos médicos solicitados', d.equipos_medicos_solicitados), campo('Insumos opcionales', d.insumos_opcionales)])
    ];
    const requiereCama = respuesta(d.requiere_cama_salida);
    const mostrarDetalleSalida = requiereCama !== 'NO';
    const salida = requiereCama === 'NO' ? [aviso('No se definió prioridad de salida del paciente')] : [
        fila([campo('¿Requiere cama de salida?', requiereCama), ...(mostrarDetalleSalida && d.cama_salida_validacion ? [campo('Cama de salida', d.cama_salida)] : [])]),
        ...(mostrarDetalleSalida ? [
            ...((texto(d.prioridad_salida) || texto(d.tipo_prioridad) || texto(d.prioridad)) ? [fila([campo('Prioridad de salida', d.prioridad_salida), campo('Tipo de prioridad', d.tipo_prioridad), campo('Prioridad', d.prioridad)])] : [aviso('No se definió prioridad de salida del paciente')]),
            ...(texto(d.condiciones_prioridad) ? [fila([campo('Condiciones de prioridad', d.condiciones_prioridad)])] : []),
            ...((texto(d.servicio_origen) || texto(d.servicio_opera)) ? [fila([campo('Servicio de origen', d.servicio_origen), campo('Servicio que opera', d.servicio_opera)])] : [])
        ] : [])
    ];
    return {
        pageSize: 'LETTER', pageMargins: [30, 91, 30, 30],
        defaultStyle: {fontSize: 10, color: '#222222'},
        background: {image: 'HCSBA', opacity: 0.07}, images: {HCSBA: logoDataUrl || ''},
        header: () => ({
            stack: [
                {columns: [
                    {width: 95, stack: [{image: 'HCSBA', width: 44}]},
                    {width: '*', stack: [
                        {text: 'Servicio de Salud Metropolitano Central\nHospital Clínico San Borja Arriarán\nSistema de Pabellón', bold: true, fontSize: 11, alignment: 'center'}
                    ]},
                    {width: 95, stack: [
                        {text: 'N° solicitud', bold: true, fontSize: 8.5},
                        {text: texto(d.nro_solicitud) || 'N/A', fontSize: 10}
                    ], alignment: 'right', margin: [0, 20, 0, 0]}
                ]},
                {canvas: [{type: 'line', x1: 0, y1: 0, x2: 552, y2: 0, lineWidth: 0.6}], margin: [0, 1, 0, 0]},
                {text: 'Solicitud quirúrgica', bold: true, fontSize: 13, alignment: 'center', margin: [0, 2, 0, 0]}
            ], margin: [30, 10, 30, 0]
        }),
        footer: (page, count, pageSize) => ({
            stack: [
                {canvas: [{type: 'line', x1: 0, y1: 0, x2: pageSize.width - 60, y2: 0, lineWidth: 0.6}]},
                {text: `${page}/${count}`, fontSize: 9, alignment: 'center', margin: [0, 4, 0, 0]}
            ], margin: [30, 4, 30, 0]
        }),
        content: [
            seccion('Datos del paciente', paciente), seccion('Evaluación preoperatoria', evaluacion),
            seccion('Programación de cirugía', programacion), seccion('Biopsia', biopsia),
            seccion('Productos sanguíneos', sangre), seccion('Insumos y equipos médicos', insumos),
            seccion('Prioridad y salida del paciente', salida)
        ]
    };
}
