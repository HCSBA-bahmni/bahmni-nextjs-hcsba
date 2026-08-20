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

Toda la interfaz se presenta en español. Los nombres clínico-administrativos existentes se muestran tal como los entrega OpenMRS y no se traducen ni transforman.

La OWA permite definir o editar la distribución, pero no ofrece eliminarla enviando filas y columnas en cero. Next conserva esa restricción: una distribución sólo se guarda con dimensiones válidas. Las camas se eliminan individualmente mediante `DELETE bed/:uuid`; OpenMRS rechaza la eliminación de una cama ocupada y la interfaz informa ese caso en español.

## Contratos OpenMRS

| Flujo | Contrato |
|---|---|
| Ubicaciones | `GET location?tag=Admission Location&v=full`, `GET location?tag=Visit Location&v=full`, `POST/DELETE admissionLocation` |
| Habilitación | El shell exige `app:admin`; la migración Next ofrece creación y edición de ubicaciones y salas sin cambiar propiedades de OpenMRS |
| Layout | `GET/POST admissionLocation/:uuid?v=layout` con `{bedLayout:{row,column}}` |
| Camas | `POST bed[/uuid]` con `{bedNumber,bedType,row,column,locationUuid}` y `DELETE bed/:uuid` |
| Tipos | `GET/POST/DELETE bedtype` |
| Etiquetas | `GET/POST/DELETE bedTag` |

OpenMRS continúa siendo la única fuente de verdad. Las mutaciones invalidan y releen las consultas correspondientes; no se mantiene un inventario paralelo en Next. Todas las ubicaciones conserva la opción de crear ubicaciones y cada ubicación existente permite crear salas. Las tarjetas de ubicaciones y salas exponen edición y eliminación al pasar el puntero o recibir foco. Una ubicación con salas debe vaciar primero su jerarquía. Antes de eliminar una sala, Next relee su layout y bloquea el DELETE si existe una cama `OCCUPIED`; la condición de nodo hoja también se revalida inmediatamente antes del DELETE. Cada sala conserva la definición de distribución y la administración de camas.

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
