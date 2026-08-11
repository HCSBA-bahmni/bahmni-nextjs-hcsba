# Trazabilidad y compuerta

La selección inicial contiene 44 suites legacy de Consulta y modelos clínicos compartidos. Se conservan los paths originales en `legacy-inventory.generated.json` y se relacionan con pruebas TypeScript y E2E.

| Grupo legacy | Suites | Destino Next | Estado |
|---|---:|---|---|
| Shell, contexto, salida y URL | 7 | ruta de Consulta, contexto, bridges y guard de navegación | Certificado |
| Form2/observaciones | 6 | `Form2Renderer`, configuración, adaptadores y payloads dorados | Certificado |
| Diagnóstico/condición/disposición/resumen | 8 | registry, tableros, borrador y guardado parcial | Certificado |
| Órdenes/bacteriología | 8 | tableros, servicios y mapper legacy | Certificado |
| Tratamiento/order sets/modelos | 15 | `extension.json`, `medication.json`, `/config/drugOrders`, activas/prescritas, alergias, editor, historial y mapper | Implementado para la configuración HCSBA vigente |
| Total | 44 | matriz general de 293 specs | Trazado; ninguna suite omitida sin justificación |

## Verificación automatizada

- 59 archivos y 240 pruebas unitarias aprobadas; el pad incluye cobertura histórica, Órdenes prueba la jerarquía `All Orderables` y Medicamentos cubre catálogo y sinónimos, persistencia de la selección al perder foco, omisión de `concept` para fármacos codificados según el mapper legacy, cálculo de cantidad por dosis × frecuencia diaria × duración en días con redondeo superior y sobrescritura manual, grupos por visita, fechas ISO/epoch, relleno, revisión y suspensión.
- 66 escenarios Playwright definidos para Chromium, Firefox y Edge; la regresión local completa terminó aprobada. La suite HCSBA se ejecuta únicamente con variables protegidas.
- Los siete tableros y los cinco modos operativos fueron recorridos contra HCSBA desarrollo.
- Los payloads dorados cubren Form2, diagnósticos, condiciones/disposición, órdenes, bacteriología y tratamiento; Chromium añade un medicamento desde el catálogo y verifica el payload real de guardado.
- Una escritura retrospectiva real fue verificada y anulada; el enrolamiento sintético de programa también fue anulado.
- Tres perfiles efectivos de privilegios (0, 1 y 7 tableros) fueron certificados mediante usuarios técnicos temporales posteriormente purgados.
- Se verificaron 409, escritura ambigua, fallo parcial de condiciones y bloqueo CDSS crítico sin duplicar escrituras.
- Impresión rápida, documentos y teleconsulta quedaron cubiertos. Receta PDF/correo no se activa en HCSBA porque `printPrescriptionFeature` no está configurado.
- Axe y teclado fueron verificados en los cinco modos reales en Chromium, Firefox y Edge.

## Compuerta de activación

`npm run gate:consultation` exige 14/14 criterios aprobados. El flag sólo puede permanecer activo si lint, typecheck, unitarios, build, contratos, pruebas reales y accesibilidad siguen aprobados.
