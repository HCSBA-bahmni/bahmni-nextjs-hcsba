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

## Contratos OpenMRS

| Flujo | Contrato |
|---|---|
| Ubicaciones | `GET location?tag=Admission Location&v=full`, `GET location?tag=Visit Location&v=full`, `POST/DELETE admissionLocation` |
| Layout | `GET/POST admissionLocation/:uuid?v=layout` con `{bedLayout:{row,column}}` |
| Camas | `POST bed[/uuid]` con `{bedNumber,bedType,row,column,locationUuid}` y `DELETE bed/:uuid` |
| Tipos | `GET/POST/DELETE bedtype` |
| Etiquetas | `GET/POST/DELETE bedTag` |

OpenMRS continúa siendo la única fuente de verdad. Las mutaciones invalidan y releen las consultas correspondientes; no se mantiene un inventario paralelo en Next.

## Navegación y reversión

`admin/extension.json` apunta Beds a `/bahmni/admin/beds`. El resolvedor Next también reconoce la URL OWA anterior para que configuraciones aún no sincronizadas entren al nuevo módulo. La OWA permanece desplegada como fallback operacional y no fue modificada.

## Verificación

- Dominio: jerarquía, coordenadas y límites del layout.
- Servicio: normalización y payloads exactos de OpenMRS.
- E2E: navegación ubicación/sala/layout, apertura de cama, tipos, etiquetas, español y accesibilidad.
