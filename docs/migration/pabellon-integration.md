# Integración Pabellón: PR #18

El PR incluye historial de solicitudes desde snapshots, protocolos y PDF,
consulta de recién nacidos, catálogos, precarga confirmada, creación electiva,
recuperación del mismo envío y vínculo de una solicitud existente con una visita.
Los paneles clínico e IPD usan el mismo gateway por origen compartido.

## Campos opcionales

Decisión del responsable del 20-11-2026: conservar los controles de kits y los
campos opcionales de equipos e insumos. Un valor vacío es válido. El selector
de kits conserva su estado deshabilitado; no se añade `kit_id` al alta ni se
activa integración con Sofya/bodegas. La narrativa opcional conserva el contrato
nativo. Esta decisión sustituye la exclusión previa para estos controles.

## Dependencias de la entrega

Las revisiones y los hashes de migraciones están en
[`pabellon-dependencies.json`](pabellon-dependencies.json). Fijan las fuentes
revisadas; no acreditan que esas revisiones estén desplegadas.

| Componente | Dependencia |
| --- | --- |
| Configuración | [standard-config #5](https://github.com/HCSBA-bahmni/standard-config-HCSBA/pull/5): fuente `pabellon43-dev`, pestaña clínica opcional, panel IPD y traducciones. No usar la antigua descripción QA como definición del destino. |
| Proxy/DEV | [bahmni-docker #3](https://github.com/HCSBA-bahmni/bahmni-docker-HCSBA/pull/3): rutas protegidas del gateway, worker PDF.js local, CA pública y preservación del checkout de configuración al iniciar DEV. |
| Gateway | [integracion-pabellon-his](https://github.com/HCSBA-bahmni/integracion-pabellon-his): sesión, autorización, auditoría, identidad, transporte OpenHIM y persistencia técnica. |
| Pabellón nativo | API de cirugía y frontend `dev`: contratos de creación, recibos, snapshots y plantilla PDF canónica. |

No fusionar PR #19 ni su catálogo de camas como dependencia de Pabellón.
Los permisos definitivos requieren validación con perfiles autorizados y
restringidos existentes. Un rechazo no autoriza conceder roles adicionales.

## Bases de datos

El frontend no aplica migraciones. El gateway mantiene ocho scripts en
`migrations/`: hay dos archivos con prefijo `004`; comprobar la lista completa
del manifest, sin asumir que el prefijo identifica un archivo único.
Su destino es una base privada nueva de integración, nunca OpenMRS ni la base
clínica de Pabellón. No ejecutarlos en bloque sobre una base ya existente ni
tratarlos como idempotentes. Conservar evidencia de versión y verificar tablas,
restricciones, permisos y auditoría mediante el procedimiento del gateway.

La API nativa tiene migraciones independientes. Entre sus precondiciones está
`cirugia.paciente_hospitalizado`, definida en
`20260928_add_paciente_hospitalizado_to_cirugia.sql`. La evidencia histórica de
su aplicación no demuestra el esquema vigente: el responsable de Pabellón debe
comprobarlo en el destino antes del ensayo. El manifest identifica esa migración;
no pretende reemplazar el inventario completo del backend nativo.

Antes de habilitar escrituras, verificar correspondencias gobernadas de paciente
y profesional, fuente DEV, visita vigente, canales, auditoría, recibos y
recuperación. No vincular por nombre ni crear pacientes en Personas durante QA.

## Recuperación y contratos

La referencia técnica pendiente se guarda sin narrativa clínica y se separa por
fuente, usuario y paciente. Se relee el almacenamiento compartido antes de usar
la referencia; al terminar sólo se elimina la referencia del mismo envío.
Almacenamiento ilegible o corrupto bloquea un alta nueva sin sobrescribirlo.
Esto no constituye un bloqueo atómico de creación entre pestañas.

Una respuesta de vinculación sólo confirma el cambio si corresponde al número,
visita, encuentro y estado solicitados. Ante una respuesta ambigua, verificar
de nuevo la solicitud; no repetir automáticamente una escritura clínica.

## Validación y publicación

- Ejecutar lint tanto antes como después del build. El worker PDF.js es una
  copia generada de la dependencia fijada y se excluye del lint de código propio.
- Ejecutar TypeScript, suite unitaria completa y build standalone.
- `npx playwright test e2e/pabellon.spec.ts --workers=1` comprueba snapshots,
  render PDF con worker local, recuperación tras recarga, opcionales vacíos,
  error/reintento y rechazo sin privilegio en Chromium, Firefox y Edge.
  Sus servicios están simulados; no demuestra persistencia ni permisos reales.
- Completar PRE e informe POST real según `docs/qa/pauta-qa.md`. Conservar
  evidencias privadas, sin datos clínicos ni credenciales en Git.

La inspección de `.225` del 20-11-2026 encontró la imagen
`2026.11.19-mpi-ensayo.1` y fuentes MPI con diferencias locales. No reemplazarla
por una imagen construida únicamente desde este PR: preparar primero un manifest
que preserve esa entrega y comprobar los consumidores compartidos.

La publicación de este PR no despliega servicios ni aplica SQL. Antes de una
entrega, registrar imagen inmutable candidata, configuración efectiva y rollback
del alcance; comprobar las precondiciones anteriores y completar PRE. La
reversión restaura imágenes/configuración; no borra solicitudes, recibos,
snapshots ni auditoría creados durante un ensayo.
