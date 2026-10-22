# Historial y trazabilidad desde Gestión de pacientes

Entrega de desarrollo `.225`: `2026.10.21-patient-trace.2`.

## Uso y contratos

En **Inicio → Gestión de pacientes**, cada caso dispone de **Ver historial**, incluso después de finalizar. Para los finalizados usar **Ver también finalizadas**. La consulta requiere el acceso existente `Manage MPI Identity Reviews`; no se modificaron roles ni privilegios.

El diálogo consulta `GET /openmrs/mpi-admission-gateway/_reviews/{id}` y presenta su historial cronológico: admisión, decisión de identidad, fusión y separación, con responsable, motivo y fecha en `America/Santiago`. Las fechas o autores ausentes se declaran como no consignados; no se inventan acciones a partir del estado actual.

Cuando hay una operación clínica, consulta las instancias `Provenance/merge-{operationId}`, `AuditEvent/merge-{operationId}` y sus equivalentes `split-`. Distingue al autor humano del usuario de servicio y ofrece los JSON originales mediante secciones desplegables. Un 404 de una fase que no ocurrió no es un fallo; si el historial confirma una fase y falta su evidencia, se informa como evidencia incompleta. También se conservan las respuestas parciales cuando otro recurso falla. No hay llamadas a `prepare`, `resolve`, `consolidate`, `separate`, matching ni MINSAL para consultar este historial.

**Consultar recursos afectados** usa los targets de la evidencia; permite leer cada instancia por demanda, mostrar Patient.active/Patient.link y referencias clínicas subject/patient/encounter. Las referencias se limitan a instancias relativas del mismo servidor FHIR; se rechazan URLs externas, consultas, fragmentos, rutas codificadas y traversal. Todas las lecturas usan credenciales de sesión y timeout de 20 segundos. Los errores, incluidos 403, se muestran y permiten actualizar sin repetir operaciones clínicas.

La lectura actual se rotula **Estado FHIR actual** y tiene su fecha de consulta. No representa un snapshot histórico después de fusionar: una separación posterior puede haber cambiado el recurso. Los eventos no contienen todas las versiones previas del contenido clínico y esta interfaz no dispone de `_history`. La cobertura histórica de targets conserva los límites del diario EIS ya documentados; no se afirma propagación a sistemas externos.

## Hallazgo horario pendiente

La verificación visual del caso sintético HCSBA100028/100029 detectó un desfase cercano a tres horas entre el historial operativo y `recorded` de los eventos FHIR de la misma operación. Por ejemplo, el historial registra la finalización a `2026-10-21T14:12:12.723Z` (11:12 en Santiago) y Provenance registra `2026-10-21T14:12:12-03:00` (14:12 en Santiago). La diferencia de segundos entre commit y verificación es esperable; tres horas requieren revisar la generación/conversión horaria del backend.

El diálogo advierte diferencias mayores de cinco minutos, rotula expresamente **Fecha FHIR** y conserva ambos valores originales. Este umbral sólo es una advertencia de presentación, no una regla clínica. No se corrigió ni reescribió el diario, los eventos o fechas de pacientes. Pendiente: resolver la base horaria DB/JDBC/FHIR con una estrategia de corrección versionada y verificar los eventos históricos antes de dar por conciliadas ambas fuentes.

## Verificación de la entrega

- Typecheck y build standalone correctos. Lint sin errores; dos advertencias anteriores de imágenes en otros módulos.
- 130 archivos y 633 pruebas unitarias correctas.
- 36 E2E correctos en Chromium, Firefox y Edge: permisos, casos completados, consulta sin escrituras, navegación, separación, evidencia parcial, discrepancia horaria, pantalla estrecha, teclado y Axe sin hallazgos graves/críticos en el diálogo.
- Backend real: gestor y administrador leen las cuatro instancias de evidencia; admisión recibe 403. Ambas fichas del ensayo siguen activas después de la separación; la observación añadida después de fusionar conserva la referencia a la segunda ficha junto a su atención. Hash del caso idéntico antes/después de las lecturas.
- Publicación sólo del servicio Next; los otros 21 contenedores conservan su identidad e imagen. No se cambió OpenMRS, MPI, OpenHIM, configuración de roles ni registros clínicos.
- Docker Desktop local estaba detenido: no se afirma verificación del entorno integrado `https://localhost` ni de Fast Refresh. Se validaron standalone y `.225`.

Código: `IdentityTraceDialog.tsx`, `identityTrace.ts`, esquema de caso `localIdentity.ts`. Evidencia sin credenciales: `F:/Proyectos/HIS/analisis/2026-10-21/patient-trace-*`; capturas reales en `patient-trace-visual/`.
