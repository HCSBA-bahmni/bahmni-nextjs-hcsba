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
- `TR` reproduce el cuadro compacto legacy con fecha de inicio, medicamento, distintivo Rx, posología, estado, profesional y detalle expandible de indicaciones. Se limita a las órdenes de la visita IPD vigente, distingue la fecha planificada de término de una suspensión real y omite las prescripciones detenidas antes de cualquier administración, sin mostrar acciones ajenas al dashboard IPD (PDF, correo e impresión general).
- `NT` y `DC` leen las tareas del paciente para el turno seleccionado y preservan las unidades temporales de los contratos legacy. El normalizador acepta `requestedStartTime`, `executionEndTime` y `taskType.name`, que son los campos reales de las tareas no farmacológicas de OpenMRS.
- `NT` conserva filtro, navegación de turnos, tarjetas horarias, leyenda de estados y actualización de completar/omitir con los privilegios legacy. La navegación futura respeta el horizonte legacy de dos días; al programar una tarea futura, la vista abre automáticamente el turno configurado que contiene su hora.
- `DC` conserva navegación de turnos, matriz horaria y leyenda de estados.
- La ruta no carga AngularJS, jQuery, React 16 ni el bundle remoto IPD.

## Estado de paridad

Las lecturas, la gestión de tareas no farmacológicas y la administración/omisión de slots farmacológicos están implementadas. La certificación sigue **parcial** porque la programación, edición y detención de tratamientos aún debe contrastarse y portarse con sus privilegios y payloads. Hasta completar esas escrituras no debe marcarse el dashboard individual como certificado.
