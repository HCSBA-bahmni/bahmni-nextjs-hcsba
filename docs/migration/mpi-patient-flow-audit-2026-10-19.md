# Ficha vigente y colas después de consolidar

Entrega `.225`: Next y configuración `2026.10.19-clinical.6`. El mediador conserva `.5`; no se modificaron datos clínicos ni se reinició OpenMRS para esta corrección.

## Hallazgo y corrección

La pantalla Activo mostraba HCSBA100009 y HCSBA100010 para **el mismo UUID paciente y la misma visita activa**. La consolidación conserva el segundo número como alias y los nombres originales. Las consultas nativas unían todos los identificadores del tipo clínico y nombres no anulados, multiplicando las filas. `hasBeenAdmitted=false`: era una visita ambulatoria, no dos hospitalizaciones.

Se corrigieron diez propiedades SQL operativas en su fuente de configuración: un identificador vigente por paciente/tipo y un nombre vigente, priorizando `preferred` y usando el menor ID como desempate. Se excluyen pacientes/personas/filas anulados. Se conservan los filtros clínicos, por proveedor, ubicación y visita. No se deduplican personas por nombre ni se borran identificadores históricos.

El límite compartido `PatientRouteGuard` comprueba el UUID antes de montar páginas de paciente en Clínico, Órdenes, Camas, Citas y Documentos. Una ficha retirada ofrece abrir la vigente en el mismo módulo, conservando los parámetros. Registro mantiene su protección existente. Los resúmenes clínicos, Registro e IPD seleccionan nombres/direcciones/identificadores preferidos vigentes cuando corresponde.

## Revisión y alcance

| Flujo | Evidencia | Alcance |
|---|---|---|
| Búsqueda de Registro/Clínico | Número vigente, alias anterior, pasaporte anterior y apellido sintético devuelven el mismo UUID vigente | Lectura real Lucene en `.225` |
| Colas operativas compartidas | Diez consultas ejecutadas antes/después; mismo conjunto paciente/visita, sin filas repetidas por alias | SQL real MySQL; cinco consultas además verificadas mediante la API Bahmni |
| Activo / proveedor / ubicación | Una tarjeta HCSBA100009 y la visita `27473e5d-020e-46c2-a522-8b77eaf41e18` | API real; Activo comprobado visualmente |
| Hospitalizados / órdenes pendientes | El ensayo no aparece como hospitalizado ni con órdenes pendientes | API real; no se crearon ingresos u órdenes para probar |
| Dashboard vigente | Visita activa y dos visitas históricas visibles; historia y diagnóstico previos accesibles | Navegador real, sin guardar observaciones |
| URL clínica de ficha retirada | Protección y enlace a la vigente | Navegador real |
| URL retirada en Clínico, Órdenes e IPD | No monta el consumidor antiguo; enlace conserva módulo y visita | Nueve E2E, Chromium/Firefox/Edge |
| Dashboard, órdenes e IPD existentes | Contexto clínico/visita, contrato de órdenes, colas y mapa/camas | Doce E2E de regresión, Chromium/Firefox/Edge, con fixtures |
| Citas y Documentos | Incluidos en la protección compartida | Inspección de código; no se certificó una escritura completa de estos módulos |

Las consultas históricas `bedsGroupedByAdmission` y `movimientosCamasDia` fueron inventariadas y no se modificaron: no equivalen a una cola de pacientes vigentes. La revisión no certifica todo Bahmni ni propagación a laboratorio/imágenes u otros sistemas. El dashboard mostró además un error parcial de carga del control de bacteriología, independiente de la duplicación; ese control queda pendiente de diagnóstico específico.

## Pruebas y publicación

- 624 unitarias frontend, cuatro pruebas SQL (incluye restauración de ambas tarjetas después de separación), typecheck, lint sin errores y dos advertencias existentes, build standalone.
- 21 E2E focalizadas y de regresión, distribuidas en Chromium, Firefox y Edge.
- Modo local Fast Refresh y `dev-environment.ps1 verify` conservados.
- Publicadas sólo las imágenes Next/config `.6` en `.225`; health HTTP 200. Sin cambios de historias, visitas, admisiones ni matching OpenCR en esta corrección.

Los fixtures E2E existentes se aislaron de peticiones REST reales no simuladas; la comprobación de scripts legacy distingue la ruta real IPD de los chunks Next que contienen `/ipd/` en su nombre.

La primera publicación de SQL con operadores angulares sufrió el escape XSS de `systemsetting` y devolvió error de consulta. Se corrigió la expresión para evitar esos operadores, se verificó igualdad del valor leído desde REST y se repitieron las consultas por la API nativa antes de dar por terminada la publicación.

Evidencia local, sólo identificadores sintéticos: `F:/Proyectos/HIS/analisis/2026-10-19/validacion-visual-mpi/patient-flow-final-verification.json`, `queue-repair-verification.json`, `cola-clinica-unica-corregida.png` y `acceso-clinico-ficha-anterior-protegido.png`. El backup de configuración `queue-settings-before.json` permite restaurar las propiedades; no debe usarse para restaurar datos clínicos.

Estado final del ensayo: HCSBA100009 tiene tres visitas (una activa); la anterior no tiene visitas propias. HCSBA100010 sigue siendo localizable como alias. No se cerró la visita del usuario ni se repitió consolidación/separación sobre su ensayo.

## Revalidación con tres parejas independientes

El estado del párrafo anterior corresponde a aquella validación; puede cambiar por acciones posteriores del usuario. Los nuevos ciclos no modificaron la pareja manual 100009/100010. Se probaron 100011/100013, 100014/100015 y 100016/100018, y las tres terminaron separadas con datos restituidos y sin visitas abiertas de ensayo. Se volvió a comprobar una sola tarjeta durante consolidación, inicio de visita en la vigente, acceso protegido a la retirada, alergias/visitas conservadas y asignación coherente del peso nuevo al separar. La separación del tercer ciclo se confirmó mediante el navegador.

Pruebas de este cierre: 624 frontend, 174 mediador, 11 gateway, cuatro SQL y 102 ejecuciones de 51 escenarios E2E con dos repeticiones y tres motores de navegador; typecheck pasó, lint sin errores y dos advertencias existentes. Los E2E usan fixtures: no equivalen a 102 recorridos clínicos contra datos reales. Para Axe del diálogo se espera su transición terminada; se corrigió una aserción durante el fade, sin cambiar el contraste del producto.

La publicación nueva afectó mediador `.225`, OpenCR aislado y traducción de vencimiento de pasaporte; se preservó el frontend concurrente. Continúan pendientes los timeouts nativos intermitentes, el control de bacteriología y las dependencias fuera del alcance probado. No se ejecutó verify local con Docker Desktop apagado. Ver el cierre técnico y la galería referidos en `MPI-CONSOLIDACION-REVERSIBLE-2026-10-19.md` del repositorio MPI; el resumen reproducible está en `F:/Proyectos/HIS/analisis/2026-10-19/validacion-visual-mpi/cycles-final-summary.json`.
