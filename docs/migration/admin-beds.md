# Administración de camas (Beds)

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

Toda la interfaz se presenta en español. Los nombres clínico-administrativos existentes se muestran tal como los entrega OpenMRS y no se traducen ni transforman.

La OWA permite definir o editar la distribución, pero no ofrece eliminarla enviando filas y columnas en cero. Next conserva esa restricción: una distribución sólo se guarda con dimensiones válidas. Las camas se eliminan individualmente mediante `DELETE bed/:uuid`; OpenMRS rechaza la eliminación de una cama ocupada y la interfaz informa ese caso en español.

## Contratos OpenMRS

| Flujo | Contrato |
|---|---|
| Ubicaciones | `GET location?tag=Admission Location&v=full`, `GET location?tag=Visit Location&v=full`, `POST/DELETE admissionLocation` |
| Habilitación | `GET systemsetting?v=custom:(property,value)&q=bedmanagement.owa.`; sólo `bedmanagement.owa.enableManagingLocations=true` habilita CRUD de ubicaciones |
| Layout | `GET/POST admissionLocation/:uuid?v=layout` con `{bedLayout:{row,column}}` |
| Camas | `POST bed[/uuid]` con `{bedNumber,bedType,row,column,locationUuid}` y `DELETE bed/:uuid` |
| Tipos | `GET/POST/DELETE bedtype` |
| Etiquetas | `GET/POST/DELETE bedTag` |

OpenMRS continúa siendo la única fuente de verdad. Las mutaciones invalidan y releen las consultas correspondientes; no se mantiene un inventario paralelo en Next. Si el system setting falta o no puede leerse, el valor seguro es `false`. La eliminación de ubicaciones sólo se expone y ejecuta para nodos sin hijos; esta condición se revalida inmediatamente antes del DELETE.

## Navegación y reversión

El dashboard resuelve tanto `/bahmni/admin/beds` como la URL OWA configurada actualmente, `/openmrs/owa/bedmanagement/admissionLocations.html`, hacia `/bahmni/admin/beds`. Así se evita que una configuración legacy vuelva a sacar al usuario de la experiencia Next.

Rollback independiente de Beds:

1. Revertir en `resolveAdminExtensionUrl` el mapeo de `/openmrs/owa/bedmanagement/admissionLocations.html` hacia Next.
2. Mantener esa URL OWA en `openmrs/apps/admin/extension.json` y desplegar nuevamente Next; no es necesario desactivar Audit Log.
3. Verificar que la tarjeta Beds abre literalmente la OWA.

## Verificación

- Dominio: jerarquía, coordenadas y límites del layout.
- Servicio: normalización, system setting y payloads exactos de creación, edición y eliminación.
- E2E: setting activo/inactivo, protección de padres, mutaciones de ubicación/layout/cama/tipo/tag, español y accesibilidad.
