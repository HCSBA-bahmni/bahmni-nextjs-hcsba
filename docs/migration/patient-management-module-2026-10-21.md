# Gestión de pacientes como módulo independiente

Disponible en desarrollo `.225`, entrega `2026.10.21-patient-management.1`.

Actualización posterior: **Ver historial** por caso, responsables/motivos y consulta de Provenance, AuditEvent y estado FHIR actual, entrega `2026.10.21-patient-trace.2`. Ver [contrato, validaciones y hallazgo horario pendiente](patient-management-trace-2026-10-21.md).

## Entrada y permisos

- Tarjeta **Gestión de pacientes** en Inicio, después de Registro, definida por `standard-config-HCSBA/openmrs/apps/home/extension.json` y sus traducciones.
- Acceso permanente en la barra superior para el privilegio activo `Manage MPI Identity Reviews`.
- Ruta canónica `/bahmni/patient-management`. Los marcadores `/bahmni/registration/reviews` responden 307 hacia la nueva ruta.
- Se retiraron los accesos generales de las pantallas de Registro. La alerta de una ficha conserva el acceso contextual al nuevo módulo para gestores.
- La bandeja conserva los contratos y procedimientos de revisión OpenCR, consolidación y separación. No se modificaron matching, historias ni decisiones existentes.

El perfil `HCSBA-MPI-Gestor` ya dispone de los permisos de revisión, consolidación y separación. El admisor conserva la propuesta de revisión; no puede listar la bandeja general ni resolver casos. Los roles administrativos de `.225` **SuperAdmin** y **System Developer** recibieron explícitamente `Manage MPI Identity Reviews`, `Consolidate Patient Records` y `Separate Patient Records`, preservando sus privilegios e herencias anteriores. La sesión abierta antes del cambio necesitó renovarse; una sesión nueva y el navegador real comprobaron la lectura de la bandeja.

No utilizar `app:admin` como autorización de identidad clínica: la configuración también lo concede al rol Doctor. No hay excepciones por nombre de usuario ni elevación desde el navegador. El gateway conserva las comprobaciones de servidor y la dependencia existente de `Add Patients`; este cambio no crea un nuevo perfil técnico ni altera los consumidores de integración.

## Publicación

Next y la imagen de configuración tienen el tag `2026.10.21-patient-management.1`. La imagen de configuración se extendió desde la activa con sólo la entrada y sus traducciones; conservó las demás claves publicadas. Se añadió el proxy `/bahmni/patient-management` dentro de `NEXT_SHELL`, independientemente de `NEXT_REGISTRATION`, tanto en la plantilla local como en `.225`. Apache validó `Syntax OK` y recargó de forma gradual. No se reiniciaron OpenMRS, MPI ni OpenHIM.

Fuentes: `src/features/patient-management/PatientManagementWorkspace.tsx`, `src/pages/patient-management/index.tsx`, `src/components/AppShell.tsx`, `next.config.ts`; configuración y proxy en los repositorios hermanos.

## Verificación y límites

- Lint sin errores, con dos advertencias previas de imágenes en otros módulos; typecheck y build standalone correctos.
- Suite completa: 129 archivos y 625 pruebas unitarias correctas.
- 57 E2E correctos en Chromium, Firefox y Edge: navegación, privilegios, enlace antiguo, pantalla estrecha, accesibilidad y regresión de revisión/consolidación/separación. Estos recorridos usan contratos simulados.
- En `.225`, sesiones reales de administrador y gestor obtuvieron HTTP 200 para capacidades y bandeja; admisión obtuvo 403 al listado general.
- Navegador real del administrador: tarjeta en Inicio, barra permanente, apertura de la bandeja y lectura del caso de ensayo consolidado existente. No se volvió a fusionar ni separar la pareja del usuario.
- Docker Desktop local estaba detenido; no se ejecutó el verificador del entorno integrado `https://localhost` ni Fast Refresh. Se verificaron standalone local y la publicación `.225`.

Evidencia privada, sin claves ni cuerpos de pacientes en los reportes técnicos: `F:/Proyectos/HIS/analisis/2026-10-21/patient-management-*` y capturas `gestion-pacientes-inicio.png` / `gestion-pacientes-bandeja.png`. La restauración de permisos usa el respaldo previo; no sustituir roles con sólo la lista de los tres permisos nuevos.
