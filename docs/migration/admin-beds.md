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
| Complejidad | Clasificación de camas | Tipos controlados de cama crítica, media y básica sobre `bedtype` |

Toda la interfaz se presenta en español. Los nombres clínico-administrativos existentes se muestran tal como los entrega OpenMRS y no se traducen ni transforman.

La OWA permite definir o editar la distribución, pero no ofrece eliminarla enviando filas y columnas en cero. Next conserva esa restricción: una distribución sólo se guarda con dimensiones válidas. Las camas se eliminan individualmente mediante `DELETE bed/:uuid`; OpenMRS rechaza la eliminación de una cama ocupada y la interfaz informa ese caso en español.

## Contratos OpenMRS

| Flujo | Contrato |
|---|---|
| Ubicaciones | `GET location?tag=Admission Location&v=full`, `GET location?tag=Visit Location&v=full`, `POST/DELETE admissionLocation` |
| Habilitación | El shell exige `app:admin`; alta, edición y eliminación de ubicaciones/salas exigen además `bedmanagement.owa.enableManagingLocations=true` |
| Layout | `GET/POST admissionLocation/:uuid?v=layout` con `{bedLayout:{row,column}}` |
| Camas | `POST bed[/uuid]` con `{bedNumber,bedType,row,column,locationUuid}` y `DELETE bed/:uuid` |
| Tipos | `GET/POST/DELETE bedtype` |
| Etiquetas | `GET/POST/DELETE bedTag` |

OpenMRS continúa siendo la única fuente de verdad. Las mutaciones invalidan y releen las consultas correspondientes; no se mantiene un inventario paralelo en Next. Cuando `bedmanagement.owa.enableManagingLocations` es `true`, Todas las ubicaciones ofrece crear ubicaciones, cada ubicación permite crear salas y las tarjetas exponen edición y eliminación al pasar el puntero o recibir foco. Si la propiedad falta, vale `false` o no puede consultarse, esas acciones permanecen ocultas; la distribución y las camas siguen disponibles. Una ubicación con salas debe vaciar primero su jerarquía. Después de confirmar una eliminación, Next relee todas las ubicaciones y bloquea el `DELETE` si el nodo adquirió hijos. Antes de eliminar una sala también relee su layout y bloquea el `DELETE` si existe una cama `OCCUPIED`. Cada sala conserva la definición de distribución y la administración de camas.

## Clasificación de camas por complejidad

La clasificación utiliza contratos existentes de OpenMRS como fuente de verdad. La complejidad se persiste en `bedtype` con cuatro opciones: crítica UTI, crítica UCI, media y básica. Rango etario, uso especial y condición operativa se persisten mediante `bedTag` y `bedTagMap`.

El catálogo se provisiona de manera permanente e idempotente desde `standard-config-HCSBA`, con UUID estables y precondiciones que impiden duplicados. La aplicación no incluye una pestaña informativa separada: la clasificación se administra directamente dentro del flujo de camas.

Las descripciones administrativas de etiquetas se guardan en propiedades OpenMRS con la clave `hcsba.bedTag.description.{uuid}` porque el recurso nativo `bedTag` sólo expone el nombre. El formulario combina sugerencias editables con texto manual; eliminar una etiqueta elimina también su propiedad descriptiva.

En cada sala se calcula un resumen por complejidad y se permite filtrar visualmente la distribución sin modificar coordenadas. El usuario puede seleccionar una o varias camas y abrir **Categorizar**. Cada dimensión ofrece `Sin cambios`, por lo que una actualización parcial conserva las demás clasificaciones. Al cambiar una clasificación complementaria sólo se reemplazan etiquetas del mismo grupo; oxígeno, aislamiento y otras etiquetas clínicas permanecen intactas.

Las camas cuyo tipo aún no corresponde a una complejidad reconocida permanecen visibles como `Sin clasificación`. La categoría crítica anterior no se convierte automáticamente a UCI o UTI porque esa distinción requiere una decisión explícita del implementador.

CUDYR pertenece al paciente y a su episodio clínico, no a la cama. En esta etapa es sólo informativo: no persiste evaluaciones ni bloquea asignaciones. La combinación `C3` no se asigna a una complejidad hasta disponer de la definición normativa oficial y la regla institucional HCSBA.

HCSBA requiere permanentemente la administración de ubicaciones y salas. Por eso `standard-config-HCSBA/masterdata/configuration/globalproperties/gp_bedmanagement.xml` aprovisiona `bedmanagement.owa.enableManagingLocations=true`; no debe depender de una modificación manual de la base de datos.

## Navegación y reversión

El destino de la tarjeta Beds se controla exclusivamente desde `openmrs/apps/admin/extension.json` en `standard-config-HCSBA`:

- `/bahmni/admin/beds` activa la implementación Next.
- `/openmrs/owa/bedmanagement/admissionLocations.html` abre literalmente la OWA legacy. Los query string y fragmentos configurados también se conservan.

Rollback independiente de Beds:

1. Restaurar `/openmrs/owa/bedmanagement/admissionLocations.html` como URL de Beds en `openmrs/apps/admin/extension.json` de `standard-config-HCSBA`.
2. Desplegar únicamente el cambio de configuración; no se modifica ni se redespliega Next y no es necesario desactivar Audit Log.
3. Verificar desde `/bahmni/admin` que la tarjeta Beds abre literalmente la OWA.

Para reactivar Beds Next, volver a configurar la URL explícita `/bahmni/admin/beds` y desplegar la configuración.

## Verificación

- Dominio: jerarquía, coordenadas y límites del layout.
- Servicio: normalización, system setting y payloads exactos de creación, edición y eliminación.
- E2E: setting activo/inactivo, protección de padres, mutaciones de ubicación/layout/cama/tipo/tag, español y accesibilidad.
