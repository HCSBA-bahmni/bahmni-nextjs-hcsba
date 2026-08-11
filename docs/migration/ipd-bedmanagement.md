# Migración IPD / Gestión de Camas

## Alcance y fuente de verdad

La referencia ejecutable es `openmrs-module-bahmniapps-hcsba-2024/ui/app/bedmanagement`, con configuración combinada de `bahmni_config/openmrs/apps/ipd` e `implementation_config/openmrs/apps/ipd`. La implementación React no ejecuta templates AngularJS, jQuery, `react2angular`, React 16 ni el bundle remoto `/ipd`.

La OWA administrativa `/openmrs/owa/bedmanagement/admissionLocations.html` queda fuera del corte: conserva la edición física de admission locations y coordenadas.

## Matriz de rutas

| Estado legacy | Ruta Next | Función | Estado |
|---|---|---|---|
| `home` (`#/home`) | `/bedmanagement` | Colas Admitir, Admitidos, Para alta y Todos; acceso a mapa y Care View | Implementada |
| `bedManagement` | `/bedmanagement/manage` | Mapa operativo sin contexto de paciente | Implementada |
| `bedManagement.bed` | `/bedmanagement/bed/:bedId` | Restaura sala, habitación y cama | Implementada |
| `bedManagement.patient` | `/bedmanagement/patient/:patientUuid` | Contexto de paciente, cama y acciones ADT | Implementada |
| `dashboard` | `/bedmanagement/patient/:patientUuid/visit/:visitUuid/dashboard` | Secciones dinámicas de `ipd/app.json` | Implementada; tipos desconocidos se exponen como cobertura pendiente y nunca cargan Angular |
| `careViewDashboard` | `/bedmanagement/care-view` | Coordinación por sala, turnos, tareas y equipo de cuidados | Parcial: implementación nativa terminada; contrato/E2E `.205` pendiente |
| `clinical ... dashboard/visit/ipd` | `/clinical/patient/:patientUuid/dashboard/visit/ipd/:visitUuid` | Dashboard IPD individual configurado por `ipdDashboard/app.json` | Parcial: seis secciones de lectura implementadas; acciones clínicas de tareas y tratamientos pendientes |

La navegación conserva los dos modos del header legacy. `Lista de Pacientes` permanece activa en `home` y `bedManagement.patient`; `Gestión de las camas` permanece activa en `bedManagement` y `bedManagement.bed`. En el modo administrativo la selección de una cama navega a `/bedmanagement/bed/:bedId` y permite administrar estado y tags sin exigir un paciente. En el modo paciente la selección permanece dentro de `/bedmanagement/patient/:patientUuid` y alimenta exclusivamente las acciones ADT.

Los hashes antiguos se convierten en cliente y también en `config-compat/legacyRoutes.ts`, conservando `patientUuid`, `visitUuid` y `bedId`.

## Inventario caracterizado

- 28 controladores/servicios/directivas/inicializadores JavaScript legacy: estados y arranque; `BedManagementController`, `AdtController`, `WardController`, `RoomController`, `RoomGridController`, `RoomListController`, cabecera/Care View; inicializadores de paciente/cama; servicios de ward, layout, tags y SQL; directivas de ADT, sala, habitación, impresión, tags, estado y observaciones.
- 21 templates: portada, mapa, dashboard, header, ward/room grid/list, ADT, confirmaciones de admisión/traslado/alta/cambio de visita, edición de estado/tags/observaciones, diálogo OIRS, impresión y estados vacíos.
- 14 suites legacy: rutas, controladores principales, layout/room/grid/list, ADT, tags, estados, servicios de ward/bed y directivas.

El reemplazo se concentra en `features/ipd`, `services/bahmni/ipd.ts`, `config-compat/ipdConfig.ts` y las seis rutas Pages Router. Las reglas puras tienen pruebas de parser, coordenadas, contadores, permisos operativos y payload ADT.

## Configuración dinámica

- `ipd/app.json` continúa gobernando impresión, handler SQL de lista, visita IPD por defecto, conversión de visita, notas ADT, forward y secciones del dashboard.
- `ipd/extension.json` continúa gobernando colas, orden, handler SQL y `requiredPrivilege`.
- Los parsers Zod son tolerantes a extensiones desconocidas. No se descartan campos extra.
- `oirsApiBaseUrl` reemplaza las URLs HCSBA embebidas en el controlador AngularJS.
- Privilegios conservados: `app:adt`, `Assign Beds`, `Edit Bed Tags`.

## Contratos de red

| Dominio | Contrato existente |
|---|---|
| Salas/layout | `GET /openmrs/ws/rest/v1/admissionLocation/` y `/:uuid?v=full` |
| Cama asignada/detalle | `GET /openmrs/ws/rest/v1/beds?patientUuid=...` y `/beds/:bedId` |
| Colas | `GET /openmrs/ws/rest/v1/bahmnicore/sql?q=<handler>` |
| Lista de habitación | `GET /openmrs/ws/rest/v1/bahmnicore/sql?q=<wardListSqlSearchHandler>&location_name=<room>` |
| Estado de cama | `POST /openmrs/ws/rest/v1/bed/:bedUuid` con `{status}` |
| Visita/paciente | REST visit, visit summary y patientprofile existentes |
| Tags | `bedTag` y `bedTagMap` |
| OIRS | `parentesco` y `data_paciente_acostado` desde base configurada |
| Care View | `admissionLocation`, `ipd/wards/:ward/summary`, `patients`, `myPatients`, `patients/search`, `patientsMedicationSummary`, `tasks` y `ipd/careteam/participants` |

- Admisión: selecciona una cama AVAILABLE desde el layout completo, relee `/beds/:bedId` y, como legacy, comprueba exclusivamente que `patients` esté vacío. Esa representación individual no se usa para confirmar el estado operativo porque puede omitirlo. Luego crea `bahmnicore/bahmniencounter` con tipo `ADMISSION`, asigna `/beds/:bedId` y confirma con cama asignada o con el layout de la sala.
- Conversión: aplica `defaultVisitType`, `enableAutoConvertToIPDVisit` y `hideStartNewVisitPopUp`; si ambos flags son falsos ofrece cerrar/iniciar IPD o continuar la visita actual. El cierre/inicio usa el contrato legacy `/bahmnicore/visit/endVisitAndCreateEncounter`.
- Traslado: rechaza cama actual, relee el destino y sólo verifica que no tenga pacientes, crea `TRANSFER`, asigna el destino, invalida las salas de origen y destino y confirma por lectura.
- Alta: exige visita y cama activas, envía `bahmnicore/discharge` con tipo `DISCHARGE`, invalida la sala de origen y confirma que el paciente ya no tenga cama o ya no aparezca como ocupante en el layout.
- Estado: sólo AVAILABLE, RESERVED o BLOCKED y únicamente sin ocupante. Como legacy, después del POST se relee `admissionLocation/:wardUuid?v=full`, se reconstruye el mapa y se confirma allí el nuevo estado; `/beds/:bedId` no se usa como confirmación porque su representación puede quedar temporalmente rezagada.
- Tags: POST `bedTagMap` con IDs numéricos anidados `{bed:{id}, bedTag:{id}}` y DELETE por UUID de la asociación.
- Notas ADT: el concepto configurado en `dashboard.conceptName` se resuelve dinámicamente y sus observaciones se incluyen sólo si contienen valor.
- Payload ADT: conserva el contrato mínimo de `encounterService.buildEncounter`: paciente, ubicación, tipo de encuentro, tipo de visita cuando corresponde, providers y observaciones; no inventa `orders`, `drugOrders` ni `extensions` vacíos.
- OIRS: POST nuevo y PATCH existente, conservando IDs y máximo tres visitas.

No existe retry automático de escrituras. Un resultado no confirmado deja un aviso ambiguo y obliga a releer antes de repetir.

## Care View

`/bedmanagement/care-view` reemplaza el remote bundle React 16 por un tablero React 19/TypeScript. Las tarjetas de ocupación provisionales fueron retiradas: la vista ahora usa `careViewDashboard/app.json` e `ipdDashboard/app.json` como fuentes de verdad para paginación, duración de ventana, turnos, formato horario y umbrales de atraso.

- Conserva `localStorage.selected_wards`, indexado por UUID de proveedor.
- El listado de pacientes de sala usa el envelope legacy `admittedPatients` y su total `totalPatients`; no debe interpretarse como una respuesta REST genérica `results`.
- Ofrece Todos/Mis pacientes, búsqueda de tres caracteres ejecutada con Enter, filtro de actividades y paginación configurada.
- La búsqueda conserva el wire format Axios legacy `indexes: null`: repite `searchKeys=bedNumber&searchKeys=patientIdentifier&searchKeys=patientName` sin sufijo `[]`, porque OpenMRS enlaza ese formato exacto.
- Calcula turnos diurnos y nocturnos con Luxon, incluidas ventanas que cruzan medianoche.
- Consulta medicamentos en segundos Unix y tareas no farmacológicas en milisegundos, manteniendo el ajuste legacy de un minuto en el límite final.
- Carga sólo tareas de los pacientes visibles y tolera el fallo parcial de uno de los dos dominios.
- Clasifica pendiente, administrada, administrada tarde, omitida, atrasada y detenida con los umbrales configurados.
- Detecta pendientes `REQUESTED` creados por `daemon` en el turno anterior.
- Permite asignar o retirar al proveedor actual sólo durante el turno vigente y confirma el estado mediante relectura antes de mostrar éxito.
- Paciente, tratamientos nuevos y pendientes enlazan al dashboard IPD nativo.
- El dashboard IPD individual respeta las seis secciones y el orden de `ipdDashboard/app.json`; su compatibilidad con la URL legacy conserva `patientUuid`, `visitUuid` y `source=careViewDashboard`.
- Registra `VIEWED_WARD_LEVEL_DASHBOARD` sin incluir información clínica en auditoría.

La vista permanece marcada como parcial hasta completar contratos y E2E reales contra `.205`; durante ese período el microfrontend Docker sólo se conserva para rollback legacy.

## Coherencia de caché

Se mantienen query keys independientes para wards, ward, lista SQL de habitación, bed, assigned-bed, visit, patient, queue, tags y OIRS. Cada mutación invalida el dominio mínimo y espera la relectura antes de mostrar éxito.

## Corte y rollback

Apache acepta `NEXT_BEDMANAGEMENT`. Con el define activo, `/bahmni/bedmanagement` se sirve desde Next; al retirarlo vuelve a `bahmni-web` sin cambios de datos. La OWA administrativa no cambia.

## Certificación de ambiente requerida

Antes de activar el define se deben ejecutar contra `.205`: conflicto concurrente, perfiles reales, impresión, OIRS, sesión expirada, error parcial, escritura ambigua, Firefox/Edge y Axe a 1366×768. Los E2E locales usan contratos anonimizados y no sustituyen esa certificación.
