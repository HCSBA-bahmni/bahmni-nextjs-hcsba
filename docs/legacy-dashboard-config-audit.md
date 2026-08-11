# Auditoría de configuración legacy del dashboard clínico

Fecha del barrido: 2026-08-04.

Fuentes contrastadas:

- `standard-config-HCSBA/openmrs/apps/clinical/dashboard.json` (39 instancias).
- `openmrs-module-bahmniapps-hcsba-2024/ui/app/common/displaycontrols`.
- `openmrs-module-bahmniapps-hcsba-2024/ui/app/clinical/dashboard`.
- Servicios, modelos y specs AngularJS asociados a cada control.

## Resultado

El parser Next conserva `raw`, `dashboardConfig`, `expandedViewConfig`,
`allFlowSheetDetails`, `config`, `formGroup`, orden, layout, privilegios y política
de vacío. Los bloqueos encontrados estaban en adaptadores que interpretaban esos
datos con un contrato distinto al legacy.

### Bloqueos de datos corregidos

| Control | Desviación | Contrato legacy restaurado |
|---|---|---|
| `conditionsList` | Se renderizaba cada contenedor de historial como una condición, produciendo `Registro N —`. | Se elige el estado no anulado más reciente, se conserva la fecha del estado `ACTIVE` original y se muestran `ACTIVE`/`HISTORY_OF` en la tarjeta. |
| `disposition` | La visita seleccionada forzaba `visitWithLocale` y podía ocultar disposiciones históricas. | El dashboard usa `patientWithLocale`, `patientUuid`, `numberOfVisits` y locale. |
| `ordersControl` / `pacsOrders` | La visita seleccionada se añadía a una consulta que en el dashboard legacy es por paciente. | Órdenes se consultan por paciente, tipo, conceptos y `numberOfVisits`. Si OpenMRS no publica el tipo configurado, se muestra error explícito en vez de un vacío engañoso. |
| `flowSheet` | Se agregaba `visitUuid`, limitando el pivote a la visita actual. | El pivote vuelve a consultar por paciente y aplica `latestCount`, `groupBy` y `obsConcepts`. |
| `treatment` | Se utilizaba `drugOrderDetails`; no aplicaba `numberOfVisits` ni `showOtherActive`. | Se usa `/drugOrders/prescribedAndActive` con `numberOfVisits`, `getOtherActive`, `visitUuids` y locale. |

### Configuración recuperada sin bloqueo de red

`patientInformation` ahora respeta `addressFields`, `patientAttributes`,
`additionalPatientIdentifiers` y `showDOB`. También recupera foto, nacimiento
estimado/hora, grupo sanguíneo, relaciones e indicador de hospitalización. Una
lista vacía ya no significa “mostrar todos los atributos”, porque en legacy
significa no agregar atributos.

`diagnosis` vuelve a aplicar `showCertainty`, `showOrder`,
`showRuledOutDiagnoses`, `hideVisitDate` y `showDetailsButton`; prioriza
diagnósticos primarios y conserva comentarios y proveedor. El marco compartido
abre además las vistas ampliadas aunque el control legacy no declare un
`expandedViewConfig` separado.

El renderer común de observaciones distingue `conceptClass` Image/Video y
recupera vista/descarga de imágenes, videos y PDF desde `/document_images`,
además de comentarios, proveedor y `displayNameType`. Esto cubre tanto
`historyAndExamination` como las instancias de observación que reutilizan el
mismo contrato.

### Configuración verificada como conectada

- Forms V2 recibe `maximumNoOfVisits` y `showEditForActiveEncounter` a través de
  la frontera del microfrontend.
- Observaciones y tendencias aplican `conceptNames`, `obsConcepts`,
  `yAxisConcepts`, `numberOfVisits`, `scope`, `obsIgnoreList` y
  `referenceData`.
- Laboratorio aplica límites de visitas, tabla/gráfico, resultados normales,
  notas y comentarios expandidos.
- Form 2 / obs-to-obs conserva `templateName`, `groupByConcept`, `formNames`,
  `conceptNames`, enrolamiento y configuración expandida.
- PACS conserva `pacsImageUrl`; citas conserva el dominio de teleconsulta del
  `app.json`; IPS/ICVP obtiene sus URLs públicas exclusivamente de
  `runtime-config`.

## Brechas no bloqueantes aún abiertas

Estas brechas no explican tarjetas vacías actuales, pero impiden declarar
paridad total:

- `treatment`: reproducir agrupación/merge visual por visita y completar las
  acciones legacy de impresión y envío; la fuente de datos ya es la correcta.
- Bacteriología: completar la edición de espécimen; requiere el encuentro y las
  validaciones de la Consulta Clínica completa.
- `programs`: conserva navegación a la gestión legacy mientras se migra ese módulo; `formsDisplay` ya usa el renderer Form2 Next con edición y privilegios
  sus encabezados legacy; la lectura y vista ampliada ya están disponibles.
- IPS/ICVP: aplicar `showSections`, `maxItemsPerSection`, `allowGeneration`,
  `allowResolve` y `allowShare`; el despliegue continúa protegido por el
  mediador same-origin de `runtime-config`.
- Certificación E2E de las 39 instancias con pacientes sintéticos de los estados
  requeridos; ninguna fila se considera certificada sólo por esta auditoría.

## Pruebas de regresión agregadas

- Normalización de historial de condiciones (anulados, estado más reciente,
  `activeSince`, tarjeta versus expandido).
- Endpoint de disposiciones por paciente.
- Contrato `prescribedAndActive` y todos sus parámetros configurables.
- Tipado del perfil para dirección, atributos e identificadores adicionales.
- Contrato de diagnóstico (orden primario, campos configurables y descartados).
- Tipado de foto, nacimiento estimado/hora y relaciones del perfil clínico.
- Auditoría ejecutable 39/39 mediante `npm run audit:dashboard:functional`.

El detalle de certificación por instancia se mantiene en
`docs/clinical-dashboard-matrix.md`.

## Alta de alergias

El control `allergies` conserva el contrato del microfrontend legacy
`PatientAlergiesControl`: el botón **Añadir** sólo aparece con una visita activa.
Los alérgenos de medicamento, alimento y ambiente, las reacciones y las
severidades se obtienen de los cinco UUID de
`clinical/app.json > config.allergyControlConceptIdMap`; no se codifican UUID ni
opciones HCSBA en React. Se excluye únicamente `Other non-coded`, igual que en
legacy, y severidad usa `setMembers` o, si está vacío, `answers`.

La escritura usa `POST /ws/rest/v1/patient/{patientUuid}/allergy` con el mismo
wire format: tipo de alérgeno en mayúsculas, `codedAllergen`, una o más
`reactions`, `severity` y `comment`. Después de un `201`, Next invalida sólo la
consulta FHIR de alergias del paciente; reemplaza la recarga completa del
microfrontend sin cambiar el resultado clínico.

La lectura no usa la tabla genérica de recursos FHIR. Replica la transformación
de `ViewAllergiesAndReactions`: alérgeno desde `reaction.substance` (con
`code` como respaldo), manifestaciones como reacciones, severidad desde
`reaction.severity`, comentarios desde `note`, registrador desde `recorder` y
fecha desde `recordedDate`. Las filas se ordenan por severidad y luego por fecha.
El detalle expandible conserva además estado clínico, criticidad, categoría y
tipo para no perder información publicada por FHIR.
# Presentación común de controles

El dashboard legacy construye sus secciones desde `dashboard.json`: `dashboard.js` agrupa por `displayType`, `dashboardSection.js` controla `hideEmptyDisplayControl` y `dashboardSection.html` resuelve dinámicamente la vista de cada `section.type`. El título procede de `translationKey` o `title`; no pertenece al template específico del control.

En Next.js se conserva el mismo contrato. `ClinicalDashboardSectionCard` resuelve el adaptador y el título configurado, y usa un `Card` de PrimeReact únicamente como marco visual compartido. El `Card` no decide contenido, orden, ancho, visibilidad, privilegios ni acciones clínicas. De esta forma, cualquier control nuevo registrado obtiene el mismo encabezado y presentación sin codificación particular por instancia.

La navegación replica `Bahmni.Clinical.TabConfig`: `displayByDefault: true` inicia el tab visible; los tabs restantes se ofrecen en el menú `+`. Al seleccionar uno oculto se agrega a los tabs visibles, y al cerrarlo se regresa al primer tab predeterminado. El tab indicado directamente en la URL siempre se hace visible para conservar bookmarks legacy.

## Orden estable y columnas

El parser conserva el `displayOrder` publicado por cada control y usa el índice
original de `dashboard.json` para desempatar. La vista recibe esa secuencia ya
ordenada y alterna los controles `Half-Page` entre dos columnas independientes;
los controles `Full-Page` cortan el bloque y ocupan todo el ancho.

No se usa `grid-auto-flow: dense`: esa regla rellenaba huecos con controles
posteriores y cambiaba su posición visual mientras las respuestas asíncronas
modificaban la altura de las tarjetas. El layout actual conserva el orden
configurado, evita los grandes huecos de una grilla por filas y reconstruye la
secuencia lineal original en resoluciones móviles.
