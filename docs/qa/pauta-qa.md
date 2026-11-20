# Pauta QA por desarrollo y entrega HIS a .225

Vigente desde 2026-11-02. Política inicial del proyecto, ajustable antes de una campaña; no representa certificación clínica ni regulatoria. Aplica a cambios funcionales de Bahmni/Next.js y su entrega al ambiente de **desarrollo** `https://10.68.174.225`.

## Decisión: skill más harness

La skill `his-qa-release` guía la selección de casos, la ejecución y la investigación de fallos. El harness `scripts/qa-release.mjs` crea la pauta, valida sus registros, calcula los porcentajes y exporta HTML, CSV y JSON. Reutiliza las pruebas existentes de Vitest, Playwright y las compuertas de migración; no crea otro motor E2E.

La pauta y el harness están versionados en este repositorio. La fuente de la skill está en `skills/his-qa-release`; instalar el directorio completo en `<CODEX_HOME>/skills/his-qa-release` (por defecto `~/.codex/skills/his-qa-release`). Los demás repositorios HCSBA distribuyen copias de la skill y usan este mismo harness. Consultar la [guía para contribuyentes](../../skills/his-qa-release/references/contributors.md) para instalación, comandos y sincronización. Es una skill específica HCSBA: preservar sus reglas locales al actualizar herramientas oficiales. No tiene un upstream oficial externo declarado.

## Presentación del informe

Estructura acordada con el usuario el 2026-11-02 para lectores clínicos/administrativos y QA/desarrollo por igual: entregar un HTML principal de lectura clara, con resultado primero, tareas y detalle desplegable de esperado/obtenido/evidencia, correcciones, pendientes y límites visibles, estado de datos de prueba y documentos de respaldo. El anexo técnico conserva códigos, porcentajes PRE/POST, versiones e incidencias resueltas. Las reglas y plantilla están en [report-design.md](../../skills/his-qa-release/references/report-design.md).

El HTML del harness, el CSV y los JSON siguen siendo respaldo técnico y fuente de los resultados calculados. Crear la presentación clara a partir de ellos, sin recalcular puntuaciones ni modificar evidencias cerradas. Los fallos abiertos, su efecto, la siguiente acción y su responsable deben ser visibles en la lectura principal. No sustituir alcance real, pruebas omitidas o simulaciones por afirmaciones generales de aprobación.

El HTML entregado al usuario debe nombrar el módulo o flujo: `qa-<modulo-o-flujo>-<aaaa-mm-dd>-rNN.html`, por ejemplo `qa-mpi-2026-11-02-r03.html`. Usar la fecha de cierre del ensayo y su revisión, en minúsculas, con guiones, sin espacios ni tildes. Los anexos pueden agregar `-tecnico` y las fases separadas `-pre`/`-post`. Conservar las exportaciones internas del harness y crear copias descriptivas para compartir, comprobando sus enlaces relativos.

## Qué registrar

Una campaña corresponde a una revisión candidata y un alcance explícito. `revision` identifica commit **y**, si hay modificaciones sin commit, un manifest con hashes de los archivos entregados. No usar sólo HEAD cuando existen diferencias. `expectedImage` es el ID inmutable `sha256:…` de la imagen construida; comparar con el mismo tipo de ID observado en Docker, no mezclar Image ID y digest de manifiesto de un registry.

Cada fila contiene:

| Columna | Uso |
|---|---|
| ID, fase y lo probado | Caso estable y comprobación concreta. PRE: antes de publicar; POST: después en .225. |
| Prioridad y peso | Riesgo del caso: P0=5, P1=3, P2=2, P3=1. |
| Perfil, precondiciones y pasos | Rol, ubicación, estado de atención, datos sintéticos y recorrido reproducible. |
| Fuente/criterio | Requisito, tarjeta, contrato o código/configuración legacy que define el resultado esperado. |
| Resultado esperado | Aserción observable, establecida antes de probar. |
| Resultado obtenido | Lo realmente observado, con valores/estados anonimizados. |
| Estado y aceptación % | APROBADO=100%; FALLIDO/BLOQUEADO/PENDIENTE=0%; NO_APLICA=N/A. |
| Sugerencia de solución | Acción concreta ante incumplimiento; separar causa comprobada de hipótesis y decir cómo validarla. |
| Responsable y severidad del hallazgo | Quién lo resolverá; P0/P1 bloquean incluso si se descubren en un caso originalmente P2/P3. |
| Evidencia y modo | Referencias a logs, capturas, diferencias de payload, lectura posterior o reporte. REAL, SIMULADO o ARTEFACTO. |
| Ambiente, revisión, fecha y ejecutor | Dónde, sobre qué código y cuándo se ejecutó. Fechas ISO con zona horaria; comunicar en America/Santiago. |
| Motivo no aplica | Justificación y responsable de excluir un caso del alcance. |

Descomponer casos amplios en filas adicionales cuando sus variantes puedan tener resultados distintos: crear/editar/anular, perfiles, visita/ingreso, navegadores o consumidores. Conservar el caso base como comprobación del conjunto: aprobarlo sólo si sus variantes requeridas están aprobadas. No sumar reintentos como pruebas nuevas. Conservar el informe inicial y registrar la repetición con el mismo ID en una nueva corrida.

Ejemplo **ilustrativo, no ejecutado**: “Persistencia de Form2” espera mantener el código seleccionado después de Tab y recarga; obtiene selección vacía; estado FALLIDO, aceptación 0%, hallazgo P1; sugerencia: “Reproducir pérdida de foco, revisar el adaptador del control y comparar `codedAnswer.uuid` con legacy; repetir selección, Tab, guardado y lectura nativa en tres navegadores”. No convertir esa sugerencia en diagnóstico confirmado sin evidencia.

## Política de aceptación inicial

- **P0**: identidad de paciente, integridad clínica, autorización, persistencia o trazabilidad comprometidas.
- **P1**: flujo principal, contratos, configuración, navegación o capacidad de entrega/reversión afectados.
- **P2**: defecto acotado con alternativa operativa, sin impacto clínico ni de seguridad.
- **P3**: detalle menor de presentación.

Clasificar por impacto observado, no por dificultad de reparación. No rebajar la prioridad para conseguir aprobación.

Para cada fase, sean A los casos aplicables (todos salvo NO_APLICA):

```text
Aceptación ponderada = 100 × suma de pesos de APROBADO / suma de pesos de A
Ejecución = 100 × cantidad(APROBADO + FALLIDO) / cantidad(A)
```

Se exige inicialmente **aceptación ≥95%**, **ejecución 100%**, **todas las compuertas obligatorias aprobadas**, **todos los P0/P1 aplicables aprobados** y **ningún hallazgo P0/P1 abierto**. Los cálculos comparan valores completos; el HTML sólo redondea su presentación. La aceptación usa todos los casos aplicables: pendientes y bloqueados no desaparecen del denominador. Si no hay casos aplicables, no se aprueba. No promediar PRE y POST.

Una falla P2/P3 podría dejar la fase aprobada con observaciones si cumple esos límites: debe conservar obtenido, solución sugerida y responsable. PENDIENTE significa que no se intentó; BLOQUEADO significa que un impedimento evitó terminar. Ambos carecen de verificación y reducen ejecución. Un `skipped` del runner se registra pendiente o bloqueado, nunca aprobado.

NO_APLICA requiere justificación concreta y responsable; sólo se permite en casos condicionales. Por ejemplo, una lectura sin escrituras puede excluir persistencia clínica. No sirve para excluir una escritura fallida, una falta de acceso o una limitación de la herramienta. Las compuertas obligatorias del catálogo no pueden eliminarse ni cambiar de fase/prioridad. Ampliar con casos de módulo. Cambiar umbrales sólo antes de ejecutar, documentando `policy.rationale`; el informe muestra siempre la política utilizada.

PRE aprobado significa **candidata lista para desplegar**, sin certificar .225. POST aprobado exige también PRE aprobado para la misma revisión, imagen observada idéntica a la candidata, evidencia del despliegue y resultados posteriores a su fecha en el destino exacto. Una corrección crea una nueva revisión/imagen y nueva campaña; no arrastrar resultados aprobados de la revisión anterior.

## Preparación y ejecución

1. Leer `bahmni-nextjs-migration`, `DEV_MODE.md` y las instrucciones locales. Revisar diferencias del alcance y caracterizar el flujo legacy. No sobrescribir cambios concurrentes.
2. Crear campaña, definir alcance, fuente de verdad, criterios y casos adicionales. El catálogo `docs/qa/catalogo.json` aporta 8 casos PRE y 15 POST; es una base, no una certificación exhaustiva del HIS.
3. Completar perfil, precondiciones y criterios antes de ejecutar. Mantener una copia inicial del plan para revisar cambios de alcance. Usar datos sintéticos explícitos y registrar sus efectos finales. No incluir PHI ni secretos en pauta, logs, capturas o CSV.
4. Ejecutar PRE: lint, typecheck, unitarias completas de corte, build standalone/imagen, E2E del flujo y verify integrado. Contrastar wire format en escrituras; probar dos consumidores en cambios compartidos. Reutilizar `gate:consultation`, `gate:phase2:hcsba` u otras compuertas cuando el alcance corresponda, sin sustituirlas por esta pauta.
5. Generar informe PRE. Si no aprueba, resolver o declarar bloqueos y repetir en otra carpeta; no informar “lista para entrega”.
6. Cuando el despliegue forme parte del encargo, usar el flujo de entrega existente con imagen versionada y reversión; recrear sólo servicios del alcance. Esta skill no amplía autorización a cambios backend/DB/roles. El harness nunca despliega ni ejecuta pruebas.
7. Registrar imagen, revisión y hora reales del despliegue. Ejecutar POST con navegador y servicios reales para casos `requiresReal`; verificar permisos con perfiles reales, persistencia por lectura posterior y auditoría cuando corresponda. Los mocks y una respuesta 200 no acreditan esos casos.
8. Generar informe POST y entregar dictamen, porcentajes, casos fallidos/bloqueados/pendientes, sugerencias y ruta a evidencia. No llamar certificado al sistema completo por aprobar el alcance de una campaña.

No activar ciegamente `HCSBA_E2E_REAL=1`: inspeccionar antes la suite seleccionada, sus escrituras, usuarios/roles temporales y limpieza. Algunas suites crean recursos. Cargar credenciales desde el mecanismo privado existente, sin imprimirlas; no ampliar privilegios por una falla de QA. Los fixtures clínicos sintéticos no se envían a MPI nacional. Ante timeout de escritura, releer estado durable antes de recuperar; no reintentar automáticamente. Nuevas integraciones externas pasan por OpenHIM; Pabellón no incluye kits/insumos y OT nativo permanece oculto.

### Selección del perfil MPI en E2E

`NEXT_PUBLIC_MPI_ADMISSION_MODE` se incorpora al compilar Next.js. `E2E_MPI_PROFILE=integrated|preview` sólo indica al runner qué comportamiento debe comprobar; no cambia la aplicación que está sirviendo la URL. La variable anterior `E2E_MPI_PREVIEW=true` se conserva como alias de selección de `preview`.

Ejecutar `mpi-admission.spec.ts` contra imágenes separadas del mismo manifest: candidata `integrated` y laboratorio `preview`. En ambos perfiles el test recorre la confirmación sin coincidencias; comprueba guardado habilitado en integrado y aviso/guardado deshabilitado en preview. Todas las llamadas OpenMRS/nacionales de esa suite se interceptan. No desplegar preview en `.225` para satisfacer el guion ni reemplazar evidencia POST real con estas simulaciones.

Para accesibilidad, incluir también el documento completo en axe: analizar sólo el panel MPI no detecta la ausencia de `html[lang]`. `document-language.spec.ts` comprueba HTML inicial, preferencia de idioma restaurada, normalización BCP 47 y cambio al autenticar con servicios simulados; repetir axe en la instalación real después de entregar.

## Uso del harness

Desde la raíz del repositorio, con Node 24 y sin dependencias nuevas:

```powershell
$qaPrivateRoot = Join-Path $env:USERPROFILE 'his-qa-private/mi-cambio-r01'
New-Item -ItemType Directory -Force -Path $qaPrivateRoot | Out-Null
npm run qa:init -- "$qaPrivateRoot/pauta.json"
# Completar el JSON con alcance, casos, metadatos y resultados reales.
npm run qa:report -- "$qaPrivateRoot/pauta.json" "$qaPrivateRoot/pre-01" PRE
# Desplegar sólo si corresponde al encargo; registrar deployment y ejecutar POST.
npm run qa:report -- "$qaPrivateRoot/pauta.json" "$qaPrivateRoot/post-01" POST
npm run qa:test
```

La carpeta de cada informe debe ser nueva para preservar corridas. `init` también rechaza sobrescribir una pauta existente. Se exportan `informe.html`, `pauta.csv` (UTF-8 con BOM, separador punto y coma), `pauta.json` (snapshot de la corrida) y `resumen.json`. CSV abre como tabla en Excel, pero los porcentajes calculados se regeneran desde JSON, no editando CSV. Código de salida: **0** fase solicitada aprobada; **1** no aprobada; **2** entrada inválida o error de operación. Ante entrada inválida no se genera un informe nuevo.

No se interpretan automáticamente logs Vitest/Playwright ni se revisa el contenido de evidencias: el ejecutor debe mapear cada resultado a su caso y revisar sus artefactos. El harness valida integridad del registro, referencias declaradas, fases y cálculos; no demuestra por sí mismo veracidad clínica. No afirmar pruebas ejecutadas a partir de la plantilla.

Si está disponible la auditoría histórica `docs/migration/flow-audit-225-2026-10-30.md`, usarla para recuperar casos pendientes (medicación real, órdenes, documentos, Care View, alta y otros). No es una dependencia del harness. No importar sus resultados como aprobación de una imagen posterior ni declarar cerrados sus pendientes por crear esta pauta.
