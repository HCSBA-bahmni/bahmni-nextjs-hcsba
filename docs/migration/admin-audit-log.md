# Administración — Audit Log

## Alcance

Esta entrega migra el estado legacy `admin.auditLog` (`#/auditLog`) y sustituye el dashboard visual de Administración por un shell Next.js. CSV Upload, CSV Export y Order Sets conservan sus implementaciones actuales. Beds se migra en el corte separado descrito en `admin-beds.md`.

Fuentes funcionales revisadas:

- `ui/app/admin/controllers/auditLogController.js`
- `ui/app/admin/views/auditLog.html`
- `ui/app/common/logging/services/auditLogService.js`
- `ui/test/unit/admin/controllers/auditLogController.spec.js`
- `standard-config-HCSBA/openmrs/apps/admin/extension.json`
- `standard-config-HCSBA/openmrs/i18n/admin/locale_es.json`

## Contrato preservado

- Privilegio requerido: `app:admin`.
- Lectura GET: `/openmrs/ws/rest/v1/auditlog`.
- Vista inicial: `startFrom` en el inicio del día local y `defaultView=true`.
- La respuesta inicial/default se invierte antes de mostrarla; las respuestas de filtro y paginación conservan el orden del servidor.
- Filtros: fecha/hora desde, nombre de usuario e ID de paciente. Los filtros vacíos no se envían.
- Siguiente: envía `lastAuditLogId` con el último ID visible.
- Anterior: envía el primer ID visible y `prev=true`. Con ambos índices en cero vuelve a la vista por defecto, sin filtros de usuario/paciente.
- Un filtro sin coincidencias limpia la tabla. Una página siguiente/anterior vacía conserva la página visible.
- Una fecha de un día futuro no genera una solicitud.
- El mensaje se divide por `~`: la primera parte es la clave i18n y la segunda, si existe, son parámetros JSON para la traducción.
- Columnas: ID del evento, fecha de creación, tipo de evento, usuario, ID de paciente, mensaje y módulo.
- El flujo es estrictamente de sólo lectura; no se agregó exportación ni ninguna escritura clínica/administrativa.

## Implementación

- Ruta Next.js: `/bahmni/admin/audit-log`.
- Dashboard Next.js: `/bahmni/admin`; consume el mismo `admin/extension.json`, aplica `app:admin` y usa los componentes visuales compartidos del proyecto.
- El dashboard consume la extensión `bahmni.admin.auditLog` y abre la ruta Next configurada.
- El corte de proxy es independiente: `NEXT_ADMIN_AUDIT_LOG`. Las herramientas no migradas se conservan bajo el alias aislado `/bahmni/admin-legacy`, sin modificar su lógica.
- El cambio compañero de proxy y Compose se entrega en [bahmni-docker-HCSBA#2](https://github.com/HCSBA-bahmni/bahmni-docker-HCSBA/pull/2); los enlaces configurables de Audit Log y Beds se entregan en [standard-config-HCSBA#2](https://github.com/HCSBA-bahmni/standard-config-HCSBA/pull/2).
- Los mensajes, tipos de evento y módulos siguen resolviéndose desde los locales configurables de `admin`.
- La presentación se modernizó con los patrones visuales y accesibles del proyecto, sin modificar parámetros ni decisiones del controlador legacy.

## Pruebas

- Contrato unitario: construcción de las cinco variantes de solicitud, omisión de filtros vacíos, orden inicial, índices, mensajes parametrizados y fecha futura.
- Servicio unitario: URL REST, query string y normalización de la respuesta.
- Playwright: sesión con `app:admin`, orden inicial, filtro usuario/paciente, avance por ID, conservación de resultados ante página vacía y auditoría Axe sin impactos serios/críticos.

## Rollback

1. Quitar `-D NEXT_ADMIN_AUDIT_LOG` de `NEXT_PROXY_DEFINES` y recrear únicamente `proxy`.
2. Restituir `"url": "#/auditLog"` en `openmrs/apps/admin/extension.json`.

El resto de Administración continúa disponible durante el corte y el rollback.
