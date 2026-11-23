# Administración de camas

## Alcance y fuente de verdad

La ruta Next `/bahmni/admin/beds` reemplaza la OWA administrativa `/openmrs/owa/bedmanagement/admissionLocations.html`. La caracterización se realizó contra la OWA HCSBA y su bundle ejecutable. Este corte es independiente del módulo operativo `/bahmni/bedmanagement`: no asigna pacientes, no modifica encuentros y no cambia el flujo ADT.

## Flujos conservados

| OWA | Next | Comportamiento |
|---|---|---|
| Admission Locations | Ubicaciones de admisión | Árbol ubicación/sala, alta, edición y eliminación |
| Set Layout | Definir distribución | Filas mayores que cero; columnas entre 1 y 10 |
| Add/Edit Bed | Agregar/Editar cama | Número máximo de 10 caracteres, tipo obligatorio y coordenadas dentro del layout |
| Bed Types | Tipos de cama | Listado, alta, edición y eliminación de nombre, nombre visible y descripción |
| Bed Tags | Etiquetas de cama | Listado, alta, edición y eliminación por nombre |
| Complejidad | Clasificación de camas | Cuatro categorías independientes del tipo funcional, mediante `bedTagMap` |

Toda la interfaz se presenta en español. Los nombres clínico-administrativos existentes se muestran tal como los entrega OpenMRS y no se traducen ni transforman.

La OWA permite definir o editar la distribución, pero no ofrece eliminarla enviando filas y columnas en cero. Next conserva esa restricción: una distribución sólo se guarda con dimensiones válidas. Las camas se eliminan individualmente mediante `DELETE bed/:uuid`; OpenMRS rechaza la eliminación de una cama ocupada y la interfaz informa ese caso en español.

## Contratos OpenMRS

| Flujo | Contrato |
|---|---|
| Ubicaciones | `GET location?tag=Admission Location&v=full`, `GET location?tag=Visit Location&v=full`, `POST/DELETE admissionLocation` |
| Habilitación | El shell exige `app:admin`; alta, edición y eliminación de ubicaciones/salas exigen además `bedmanagement.owa.enableManagingLocations=true` |
| Layout | Lectura `GET admissionLocation/:uuid?v=full` (`bedLayouts` nativo); escritura `POST admissionLocation/:uuid?v=layout` con `{bedLayout:{row,column}}` |
| Camas | `POST bed[/uuid]` con `{bedNumber,bedType,row,column,locationUuid}` y `DELETE bed/:uuid` |
| Tipos | `GET/POST/DELETE bedtype` |
| Etiquetas | `GET/POST/DELETE bedTag` |

OpenMRS continúa siendo la única fuente de verdad. Las mutaciones invalidan y releen las consultas correspondientes; no se mantiene un inventario paralelo en Next. Cuando `bedmanagement.owa.enableManagingLocations` es `true`, Todas las ubicaciones ofrece crear ubicaciones, cada ubicación permite crear salas y las tarjetas exponen edición y eliminación al pasar el puntero o recibir foco. Si la propiedad falta, vale `false` o no puede consultarse, esas acciones permanecen ocultas; la distribución y las camas siguen disponibles. Una ubicación con salas debe vaciar primero su jerarquía. Después de confirmar una eliminación, Next relee todas las ubicaciones y bloquea el `DELETE` si el nodo adquirió hijos. Antes de eliminar una sala también relee su layout y bloquea el `DELETE` si existe una cama `OCCUPIED`. Cada sala conserva la definición de distribución y la administración de camas.

## Clasificación de camas por complejidad

La clasificación utiliza contratos existentes de OpenMRS como fuente de verdad. `bedtype` conserva el tipo funcional. Complejidad (crítica UTI, crítica UCI, media y básica), rango etario, uso especial y condición administrativa se persisten mediante `bedTag` y `bedTagMap`.

El catálogo complementario está versionado en [standard-config PR #6](https://github.com/HCSBA-bahmni/standard-config-HCSBA/pull/6), en `masterdata/configuration/liquibase/hcsba_bed_classification.xml`, incluido en su master. Crea 12 etiquetas y sus descripciones faltantes con UUID estables para altas nuevas; conserva UUID, descripciones y asociaciones existentes. Detiene conflictos en vez de duplicar, renombrar o reactivar etiquetas. Su contrato y prueba MySQL/Liquibase están en `standard-config-HCSBA/docs/bed-classification-catalog.md`. Publicar el PR no aplica el catálogo a `.225`.

Las descripciones administrativas de etiquetas se guardan en propiedades OpenMRS con la clave `hcsba.bedTag.description.{uuid}` porque el recurso nativo `bedTag` sólo expone el nombre. El formulario combina sugerencias editables con texto manual; eliminar una etiqueta elimina también su propiedad descriptiva.

El usuario puede seleccionar una o varias camas y abrir **Categorizar**. Cada dimensión ofrece `Sin cambios`, por lo que una actualización parcial conserva las demás clasificaciones. Sólo se reemplazan etiquetas del mismo grupo; oxígeno, aislamiento y otras etiquetas clínicas permanecen intactas.

La operación relee la sala, el catálogo y la actividad de las condiciones antes de escribir. Valida todas las camas y categorías. Primero añade y confirma por lectura la nueva etiqueta; después retira las anteriores del mismo grupo, confirmando también su eliminación. Cada desenlace invalida la sala. No es una transacción entre varias llamadas REST: un fallo puede dejar cambios parciales, y la pantalla lo informa. **Revisar y aplicar pendientes** es una continuación manual que vuelve a leer el estado durable y omite cambios ya confirmados, incluidas respuestas perdidas. No se reintentan escrituras automáticamente.

Las camas antiguas conservan su `bedType` al editar número/coordenadas. La opción **Conservar tipo anterior** evita elegir silenciosamente otro tipo. Si la complejidad sólo está en un tipo `MINSAL_*`, el cambio a un tipo funcional exige primero una categoría explícita mediante **Categorizar**. Esto también evita inferir UCI/UTI para la categoría crítica antigua sin especificar.

Las condiciones operativas son clasificaciones administrativas y permiten marcar actividad para futuras categorizaciones. El estado nativo **Bloqueada / BLOCKED**, administrado en Camas, impide asignaciones. Se retiró el control `allowsUse` que prometía ese efecto sin un contrato de asignación; valores históricos de metadatos se conservan sin presentarlos como una regla operativa.

Las camas cuyo tipo aún no corresponde a una complejidad reconocida permanecen visibles como `Sin clasificación`. La categoría crítica anterior no se convierte automáticamente a UCI o UTI porque esa distinción requiere una decisión explícita del implementador.

CUDYR pertenece al paciente y a su episodio clínico, no a la cama. En esta etapa es sólo informativo: no persiste evaluaciones ni bloquea asignaciones. La combinación `C3` no se asigna a una complejidad hasta disponer de la definición normativa oficial y la regla institucional HCSBA.

HCSBA requiere permanentemente la administración de ubicaciones y salas. Por eso `standard-config-HCSBA/masterdata/configuration/globalproperties/gp_bedmanagement.xml` aprovisiona `bedmanagement.owa.enableManagingLocations=true`; no debe depender de una modificación manual de la base de datos.

## Navegación y reversión

El destino de la tarjeta Beds se controla exclusivamente desde `openmrs/apps/admin/extension.json` en `standard-config-HCSBA`:

- `/bahmni/admin/beds` activa la implementación Next.
- La compatibilidad vigente también normaliza `/openmrs/owa/bedmanagement/admissionLocations.html` a `/bahmni/admin/beds`. La configuración servida en `.225` conserva esa URL histórica; se verificó que la tarjeta Beds conduce a Next.

Reversión de una entrega de Beds:

1. Conservar las imágenes anteriores de frontend/configuración, los overlays efectivos y sus hashes antes del corte.
2. Restaurar conjuntamente los servicios del alcance mediante el script y el manifest de la entrega. Conservar catálogo, asociaciones e historial Liquibase; no ejecutar un DOWN destructivo.
3. Verificar salud, configuración servida y acceso desde Administración después de restaurar.

Volver a escribir la URL histórica en la configuración no activa por sí solo la OWA: el adaptador actual la normaliza a Next. Un retorno a la OWA requiere un corte explícito del adaptador o del proxy y su propia validación. No afirmar ese retorno a partir de un cambio de JSON solamente.

## Verificación

- Dominio: jerarquía, coordenadas y límites del layout.
- Servicio: normalización, system setting y payloads exactos de creación, edición y eliminación.
- E2E: setting activo/inactivo, protección de padres, payloads simulados de ubicación/layout/cama/tipo/tag, español y accesibilidad; edición heredada y recuperación de lotes parciales en Chromium, Firefox y Edge.
- Servicio: respuesta perdida después de POST/DELETE confirmado, ausencia de confirmación, categorías inactivas/ambiguas e IDs inválidos sin escritura. Las pruebas simuladas no acreditan escrituras reales de `.225`.
