# Dashboard IPD individual

## Fuentes legacy

Existen dos dashboards IPD distintos y no deben confundirse:

- `bedmanagement/#/patient/:patientUuid/visit/:visitUuid/dashboard` usa `ipd/app.json` y los controles compartidos del dashboard de Bed Management.
- `clinical/#/:configName/patient/:patientUuid/dashboard/visit/ipd/:visitUuid?source=careViewDashboard` es el dashboard individual abierto desde Care View y usa `ipdDashboard/app.json`.

La segunda ruta se caracteriza a partir del microfrontend IPD legacy. Su orden configurado en HCSBA es:

1. `VT`: signos vitales y valores nutricionales.
2. `AL`: alergias.
3. `DG`: diagnósticos.
4. `TR`: tratamientos.
5. `NT`: tareas de enfermería.
6. `DC`: gráfico de medicamentos.

También conserva los turnos, formato horario, conceptos de signos vitales, umbrales y privilegios declarados en `ipdDashboard/app.json`.

## Ruta Next

- Ruta canónica: `/clinical/patient/:patientUuid/dashboard/visit/ipd/:visitUuid`.
- `source=careViewDashboard` conserva el retorno a `/bedmanagement/care-view`.
- El hash legacy exacto se transforma mediante `config-compat/legacyRoutes.ts`; el literal `ipd` no se interpreta como UUID de visita.
- El nombre del paciente, alertas de tratamientos y pendientes de Care View navegan a esta ruta nativa.

## Implementación actual

- Encabezado de paciente, visita y cama asignada.
- Navegación lateral construida en el orden de `ipdDashboard/app.json`.
- `VT` reproduce las dos lecturas legacy (`latestCount=1` y el histórico agrupado por `obstime`) usando exclusivamente los conceptos configurados.
- `AL` conserva las columnas Alérgeno, Severidad, Reacción, Comentarios, Proveedor y Fecha.
- `DG` conserva las columnas Diagnóstico, Orden, Certeza, Estado, Diagnosticado por y Fecha.
- `TR` reproduce el cuadro compacto legacy con fecha de inicio, medicamento, distintivo Rx, posología, estado, profesional y detalle expandible de indicaciones. Para este control usa el contrato legacy específico `/ipdVisit/{visitUuid}/medication`, cuya respuesta incluye `drugOrderSchedule`; no usa `bahmnicore/prescribedAndActive` porque ese contrato no gobierna las acciones IPD. Se limita a las órdenes de la visita IPD vigente, distingue la fecha planificada de término de una suspensión real y omite las prescripciones detenidas antes de cualquier administración, sin mostrar acciones ajenas al dashboard IPD (PDF, correo e impresión general).
- Las acciones de tratamientos uniformes conservan el privilegio `Edit Medication Tasks` y los estados legacy, con etiquetas acotadas en la tabla: **Programar**, **Añadir tarea** para PRN, **Editar** antes de iniciar la administración y **Detener** cuando quedan slots pendientes. Los diálogos mantienen los títulos clínicos completos. Una visita cerrada, la ausencia de admisión o una fecha de inicio futura dejan la acción visible pero deshabilitada cuando corresponde.
- La programación consume `config.enable24HourTimers`, `config.drugChartStartTimeFrequencies`, `config.drugChartScheduleFrequencies` y `drugChartSlider.timeInMinutesToDisableSlotPostScheduledTime` desde `ipdDashboard/app.json`. El diálogo conserva medicamento, dosis/unidad, vía, duración/unidad, fecha de inicio, frecuencia, indicaciones, indicaciones adicionales, velocidad, aditivos y notas del slider legacy. Todos sus controles y horarios usan PrimeReact y el layout usa PrimeFlex; no quedan `input[type=time]` nativos. Los mappers escriben el wire format legacy en segundos Unix contra `/ipd/schedule/type/medication` y `/edit`; PRN usa `AS_NEEDED_PLACEHOLDER`. La detención conserva el encuentro Bahmni `DISCONTINUE`, motivo obligatorio, proveedor/ubicación/visita y auditoría IPD.
- `NT` y `DC` leen las tareas del paciente para el turno seleccionado y preservan las unidades temporales de los contratos legacy. El normalizador acepta `requestedStartTime`, `executionEndTime` y `taskType.name`, que son los campos reales de las tareas no farmacológicas de OpenMRS.
- `NT` conserva filtro, navegación de turnos, tarjetas horarias, leyenda de estados y actualización de completar/omitir con los privilegios legacy. La navegación futura respeta el horizonte legacy de dos días; al programar una tarea futura, la vista abre automáticamente el turno configurado que contiene su hora.
- `DC` conserva navegación de turnos, matriz horaria y leyenda de estados.
- El OMOD HCSBA vincula calendarios nuevos a la visita del encuentro de la orden, no a la primera visita activa del paciente. La lectura de slots admite también calendarios históricos creados con la asociación anterior, por lo que el gráfico se recupera sin mutar directamente datos clínicos.
- La ruta no carga AngularJS, jQuery, React 16 ni el bundle remoto IPD.

## Estado de paridad

Las lecturas, la gestión de tareas no farmacológicas, la administración/omisión de slots farmacológicos y las acciones de programación uniforme/PRN están implementadas con pruebas de reglas y payloads. La certificación sigue **parcial** hasta contrastar las escrituras contra HCSBA desarrollo y portar las acciones por etapa de las prescripciones de dosis variable. Hasta cubrir esa variante no debe marcarse el dashboard individual como certificado.
