# Migración de Agenda de citas

## Cobertura

La operación de Appointment Scheduling vive en `/bahmni/appointments`: resumen mensual, calendario día/semana, lista, lista de espera, filtros, alta/edición, recurrencias, detección de conflictos, cambios de estado, respuestas de proveedor, teleconsulta e impresión.

La administración operativa de servicios vive en `/bahmni/appointments/admin`. Lista, crea, edita y elimina servicios, e incluye tipos, colores, cupos y disponibilidades semanales. Conserva los contratos existentes; no agrega endpoints ni modifica el backend. El módulo Angular en `/appointments` permanece disponible como rollback.

## Contratos preservados

- Configuración: `appointments/app.json`; no se ejecuta JavaScript ni HTML Angular remoto.
- Lecturas: servicios, proveedores, ubicaciones, pacientes, búsqueda, resumen, cita individual y recurrencias bajo `/openmrs/ws/rest/v1`.
- Escrituras: `appointment`, `recurring-appointments`, conflictos, `status-change` y `providerResponse`.
- Administración: `GET appointmentService/all/default`, `GET appointmentService?uuid=...`, `POST appointmentService`, `DELETE appointmentService?uuid=...` y `GET speciality/all`.
- Payload de cita: `patientUuid`, `serviceUuid`, `serviceTypeUuid`, fechas UTC, proveedores con respuesta, ubicación, estado, modalidad, teleconsulta y comentarios.
- Privilegios: `app:appointments`, `app:appointments:manageAppointmentsTab`, `Manage Own Appointments`, `Reset Appointment Status`, `Available for appointments` y `app:appointments:adminTab`.

### Matriz HTTP verificada

| Operación | Contrato original |
| --- | --- |
| Agenda diaria | `GET appointment/all?forDate=...` |
| Rango día/semana | `POST appointments/search` con `startDate`, `endDate` y filtros singulares opcionales |
| Filtros múltiples / espera | `POST appointment/search` con arreglos UUID y `status` |
| Cita por UUID | `GET appointment/?uuid=...` |
| Recurrencia | `POST recurring-appointments` con `appointmentRequest` y `recurringPattern` |
| Conflictos | `POST appointments/conflicts` o `recurring-appointments/conflicts`; `204` significa sin conflictos y `200` devuelve un mapa por tipo |
| Estado individual | `POST appointments/{uuid}/status-change` |
| Estado de recurrencia | `POST recurring-appointments/{uuid}/changeStatus` |
| Respuesta de proveedor | `POST appointments/{uuid}/providerResponse` con el UUID del proveedor en el cuerpo |
| Servicios administrativos | `GET appointmentService/all/default` para la lista y `GET appointmentService?uuid=...` para edición completa |
| Crear/editar servicio | `POST appointmentService` con tipos y disponibilidad semanal en el mismo payload |
| Eliminar servicio | `DELETE appointmentService?uuid=...` |

La matriz se contrastó con el bundle desplegado del frontend original, sus `react-config.json`/`ng-config.json` y los controladores oficiales del módulo de citas. El 14-08-2026 se verificaron contra el OpenMRS HCSBA local, en modo de sólo lectura, los contratos de agenda diaria, rango, espera, resumen, servicios, ubicaciones, detalle UUID y conflictos.

Las respuestas se validan con Zod y las fechas se convierten con Luxon usando la zona de la sesión, con `America/Santiago` como respaldo. Después de cada mutación se invalidan todas las consultas de agenda y se relee OpenMRS; no existen escrituras optimistas.

## Navegación y rollback

`NEXT_APPOINTMENTS` publica `/bahmni/appointments` en `bahmni-next-web`. `/appointments` continúa apuntando al contenedor original. Al retirar `-D NEXT_APPOINTMENTS` y recrear sólo `proxy`, `/bahmni/appointments` responde con una redirección temporal a `/appointments/`.

El acceso de Home usa `/bahmni/appointments`; el dashboard clínico enlaza la lista nueva con el paciente seleccionado. El botón Administración abre la ruta nativa `/bahmni/appointments/admin` únicamente para `app:appointments:adminTab` o `app:admin`.

## Certificación

Antes de producción se deben comparar con el módulo original: búsqueda por cada filtro, recursos sin proveedor, límites de jornada, cambio horario Chile, alta simple, recurrencia con y sin conflictos, edición, lista de espera, cada transición configurada, invitación de proveedor, teleconsulta, impresión y los perfiles administrador/citas propias/lectura.
