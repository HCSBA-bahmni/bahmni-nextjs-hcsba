# Contratos de payload

## Encuentro

`POST /openmrs/ws/rest/v1/bahmnicore/bahmniencounter` conserva las claves legacy:

- `patientUuid`, `locationUuid`, `encounterUuid`, `visitUuid`, `providers`, `encounterDateTime` y `encounterTypeUuid`.
- `context.patientProgramUuid` recibe el UUID de enrolamiento.
- Sin visita se agrega `visitType`; en retrospectivo usa `visitTypeForRetrospectiveEntries`.
- `bahmniDiagnoses` sólo contiene nuevos, editados o anulados.
- `orders` sólo contiene nuevas, revisadas o suspendidas. Una orden nueva transmite `concept`, `commentToFulfiller` y `urgency: "STAT"` cuando corresponde; retirar una orden guardada transmite `action: "DISCONTINUE"` y `previousOrderUuid`. `NeedsPrint` conserva el marcador traducido dentro de `commentToFulfiller`, igual que legacy.
- `drugOrders` usa `FlexibleDosingInstructions`: duración en nivel superior; dosis, vía, frecuencia, PRN, cantidad y unidad dentro de `dosingInstructions`; instrucciones como JSON en `dosingInstructions.administrationInstructions`. `asNeeded` siempre se transmite como booleano (por defecto `false`) porque OpenMRS 2.5 lo valida como obligatorio. La fecha inicial del editor se serializa como `scheduledDate`, igual que `DrugOrder.createFromUIObject`, no como `effectiveStartDate`. Para medicamentos codificados se transmite `drug` y se omite `concept`; OpenMRS deriva el concepto desde el fármaco. `concept` se reserva para el concepto configurado del flujo no codificado.
- Tras confirmar el encuentro se invalidan de forma específica las consultas de medicamentos activos y prescritos del paciente. La pestaña `Reciente` debe reconciliar la nueva receta sin recargar la página ni repetir el `POST` clínico.
- `observations` mantiene `formNamespace`, `formFieldPath`, grupos y anulaciones de Form2.
- `extensions.mdrtbSpecimen` conserva muestra, atributos y resultados.
- Al anular una muestra existente se conserva su UUID, fecha y tipo; sus grupos de atributos y resultados mantienen los UUID persistidos, eliminan sus valores y se transmiten con `voided: true`, igual que `Specimen` y `ObservationFilter` legacy. La conciliacion posterior solo confirma la anulacion cuando la muestra ya no aparece activa.
- Bacteriology puede devolver `dateCollected` como epoch en milisegundos aunque el `POST` legacy use `YYYY-MM-DD`; el borde de lectura lo normaliza antes de mostrar, editar o anular la muestra.
- La respuesta del `POST` no se considera una representacion expandida del encuentro. Tras una escritura confirmada se lee nuevamente el encuentro por su UUID y esa lectura reemplaza el borrador local; asi las muestras y los demas datos guardados aparecen inmediatamente sin repetir el `POST` ni exigir F5.
- Tras reconciliar una edicion de muestra, el estado local de edicion se cierra cuando la lectura persistida vuelve con `dirty: false`; la UI retorna al listado guardado sin requerir F5.
- Diagnosticos y condiciones consultan la misma terminologia legacy, pero mantienen estado y secuencia de autocomplete independientes para que los resultados del campo activo no sean consumidos por el otro control.
- Los conceptos seleccionados directamente como condicion conservan el contrato legacy `conceptSystem/conceptUuid` (por ejemplo, `http://snomed.info/sct/420662003`) antes del POST a `emrapi/condition`.
- Las observaciones de `mdrtbSpecimen` pasan por el equivalente de `ConceptMapper` legacy: conceptos de pregunta, muestra y respuestas codificadas se escriben como referencias `{uuid, name}`. No se transmiten objetos REST anidados como `conceptClass`, `datatype`, `answers` o `setMembers`, porque el módulo Bacteriology deserializa `conceptClass` como texto.
- `disposition` mantiene acción, nota y anulación.

## Condiciones

Después de confirmar el encuentro se ejecuta `POST /openmrs/ws/rest/emrapi/condition`. Si falla, el encuentro no se reenvía; el UI conserva un reintento exclusivo de condiciones.

Como en `consultationController` legacy, el `POST` se confirma con una lectura inmediata de `GET /openmrs/ws/rest/emrapi/conditionhistory?patientUuid=...`. La UI sólo muestra éxito y reemplaza su borrador cuando la lectura contiene el concepto, estado, fecha y detalle modificados. Si la lectura no lo confirma, conserva la condición pendiente y advierte el fallo parcial; un reintento manual vuelve a leer antes de escribir para evitar duplicados por consistencia eventual.

## Escritura ambigua

Ante error de red o `5xx`, se vuelve a consultar el encuentro. Sólo se acepta como guardado si la lectura contiene marcadores de cada dominio modificado. Si no puede demostrarse, se bloquea un segundo envío y se exige “Recargar y verificar”.

Las escrituras clínicas no tienen reintento automático de TanStack Query.

## Comparación dorada

`goldenPayloads.test.ts` reproduce expectativas directamente desde `EncounterTransactionMapper`, `Order`, `DrugOrder` y `conditionsService` legacy. Cubre Form2, diagnósticos, condiciones, disposición, órdenes, bacteriología y tratamiento sin depender de valores clínicos reales.
