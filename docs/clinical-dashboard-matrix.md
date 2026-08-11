# Dashboard clínico HCSBA — matriz de 39 instancias

Fuente de verdad: `standard-config-HCSBA/openmrs/apps/clinical/dashboard.json`, contrastada con los controles AngularJS de `ui/app/clinical`, `ui/app/common` y los microfrontends `next-ui`.

Estados separados deliberadamente:

- **Implementación:** el adaptador React/TypeScript existe y aplica la configuración de esa instancia.
- **Contrato:** el endpoint, transformación o payload relevante tiene una prueba automatizada local.
- **E2E:** el flujo fue ejecutado con usuario/paciente sintético en HCSBA desarrollo.
- **Certificado:** paridad funcional revisada y aceptada; habilita el corte de proxy.

`Sí` en implementación no equivale a certificación. Ninguna instancia se declara certificada antes de la prueba HCSBA.

## `general` — 28 instancias

| Instancia | Tipo | Implementación | Contrato | E2E | Certificado | Brecha concreta |
|---|---|---:|---:|---:|---:|---|
| `patientInformation` | patientInformation | Sí | Sí | No | No | Dirección, atributos, identificadores, foto, nacimiento estimado/hora, relaciones e indicador de hospitalización portados; falta certificación real |
| `allergies` | allergies | Sí | Sí | No | No | Lectura FHIR y alta REST portadas; certificar catálogos y escritura contra HCSBA desarrollo |
| `forms-v2-react` | formsV2React | Sí | Sí | No | No | Certificar edición/impresión por privilegio |
| `ips-react` | ipsReact | Parcial | Sí | No | No | ITI-67/68, VHL, QR, flags y límites portados; falta mediador same-origin HCSBA y E2E |
| `ips-icvp-react` | ipsIcvpReact | Parcial | Sí | No | No | Generación ICVP/HC1 y flags portada; falta mediador, cámara/decodificación local y E2E |
| `diagnosis` | diagnosis | Sí | Sí | No | No | Certeza, orden, estado, descartados, comentarios, proveedor y vista ampliada portados; falta certificación real |
| `notificacionGes` | custom/GES | Sí | Sí | No | No | Certificar estados y respuestas del servicio institucional |
| `navigationLinksControl` | navigationLinksControl | Sí | Sí | No | No | Orden, parámetros, custom links y base `/bahmni` portados; Inpatient/Programas se retiran con sus módulos |
| `disposition` | disposition | Sí | Sí | No | No | Contrato dashboard por paciente corregido; certificar notas/locale con historial real |
| `treatments` | treatment | Sí | Sí | No | No | Visitas, otros activos, continuidad, flowsheet IPD, detalle, PDF y correo portados; certificar datos reales |
| `radiology` | radiology | Sí | Sí | No | No | Certificar galería/PDF con encuentros RADIOLOGY reales |
| `programs` | programs | Parcial | Parcial | No | No | Lectura/estados portados; falta la ruta Next de gestión de enrolamiento que abría el encabezado legacy |
| `radiologyOrders` | ordersControl | Sí lectura | Sí | No | No | Alcance por paciente corregido; certificar conceptos Summary y detalle expandido |
| `pacs` | pacsOrders | Sí | Sí | No | No | Probar URL Oviyam con orden real y privilegios |
| `labOrdersDisplayControl` | ordersControl | Sí lectura | Sí | No | No | Comparar panel de detalle de orden |
| `bacteriologyResults` | bacteriologyResultsControl | Sí | Sí | No | No | Detalle y edición mediante el encuentro original portados; certificar muestras reales |
| `labResults` | labOrders | Sí | Sí | No | No | Certificar accesiones, paneles, notas, adjuntos y normal/anormal |
| `basicDetails` | observation | Sí | Sí | No | No | Comparar scope latest en expandido |
| `flowsheet` | flowSheet | Sí | Sí | No | No | Alcance por paciente corregido; comparar pivote exacto y orden de conceptos |
| `historyAndExaminations` | vitals | Sí | Sí | No | No | Imágenes, videos, PDF, comentarios y proveedor portados desde el renderer común; falta certificar archivos reales |
| `visits` | visits | Sí | Parcial | No | No | Certificar agrupación y máximo de ocho visitas |
| `admissionDetails` | admissionDetails | Sí lectura | Parcial | No | No | Probar paciente hospitalizado y cama asignada |
| `conditions` | conditionsList | Sí lectura | Sí | No | No | Historial legacy normalizado; certificar estados y fechas con paciente real |
| `formsDisplay` | forms | Sí | Sí | No | No | Renderer Form2 versionado, `formGroup`, privilegios, detalle, edición e impresión portados |
| `patientAppointments` | custom/citas | Sí | Sí | No | No | Certificar arrays UTC y teleconsulta; Appointments continúa externa por diseño |
| `procedureDisplayControl` | ordersControl | Sí lectura | Sí | No | No | Certificar detalle expandido |
| `Form 2 Obs To Obs` | obsToObsFlowSheet | Sí | Sí | No | No | Probar configuración HCSBA cuando contenga formularios/conceptos |
| `allOrdersDashboard` | allOrdersReact | Sí | Sí | No | No | E2E de cinco órdenes + indicaciones, PDF y correo secuencial |

## `trends` — 6 instancias

| Instancia | Tipo | Implementación | Contrato | E2E | Certificado | Brecha concreta |
|---|---|---:|---:|---:|---:|---|
| `patientInformation` | patientInformation | Sí | Sí | No | No | Filtrado por atributos configurados portado; verificar valores reales |
| `growthChart` | observationGraph | Sí | Sí | No | No | Certificar percentiles con paciente pediátrico sintético |
| `BP` | observationGraph | Sí | Parcial | No | No | Certificar aliases español/inglés y escalas |
| `weight/BMI` | observationGraph | Sí | Parcial | No | No | Certificar series Weight/BMI/IMC |
| `diabetes/BloodSugar` | observationGraph | Sí | Parcial | No | No | Certificar escalas/unidades reales |
| `observationGraph` | observationGraph | Sí | Parcial | No | No | Certificar aliases Pulse/Pulso |

## `patientSummary` — 5 instancias

| Instancia | Tipo | Implementación | Contrato | E2E | Certificado | Brecha concreta |
|---|---|---:|---:|---:|---:|---|
| `Bacteriology Concept Set` | obsToObsFlowSheet | Sí | Sí | No | No | Probar agrupación por fecha de muestra |
| `HistoryAndExamination` | historyAndExamination | Sí lectura | Parcial | No | No | Certificar grupos e imágenes |
| `drugOther` | drugOrderDetails | Sí | Sí | No | No | Certificar `showOnlyActive` y concepto All Other Drugs |
| `malaria` | obsToObsFlowSheet | Sí | Sí | No | No | Probar formulario Malaria real |
| `Chronic Treatment Chart` | chronicTreatmentChart | Sí | Sí | No | No | Certificar headers, Stop/Error, mes y programa |

## Totales de esta entrega

- Caracterizadas y trazadas por función legacy: **39/39**.
- Con implementación local completa pendiente de certificación: **36/39**.
- Parciales: **3/39** (`programs`, `ipsReact`, `ipsIcvpReact`).
- Bloqueadas sin adaptador: **0/39**. IPS/ICVP permanecen deshabilitadas por despliegue hasta disponer del mediador seguro.
- E2E verificadas en HCSBA: **0/39**.
- Certificadas: **0/39**.

El dashboard no debe cambiar todavía su proxy de rollback. El corte exige 39/39 certificadas y cero solicitudes de AngularJS/React 16.

La traza ejecutable por instancia vive en `docs/clinical-dashboard-functional-audit.json` y se valida con `npm run audit:dashboard:functional`. El comando falla si aparece, desaparece o cambia de tipo una sección configurada sin actualizar explícitamente su cobertura.

## Frontera de microfrontends React 19

`ClinicalMfeHost` entrega únicamente paciente, visita, visitas disponibles, proveedor, usuario, ubicación, idioma y la sección configurada. `hostApi` limita capacidades a navegación, refresco selectivo, vista expandida, impresión y auditoría. Los componentes se cargan dinámicamente sólo en navegador y no reciben un service locator.

`formsV2React`, `allOrdersReact`, `ipsReact` e `ipsIcvpReact` se ejecutan desde fuente TypeScript/React 19 del repositorio. No se cargan `next-ui.min.js`, `react2angular`, plantillas Angular ni JavaScript remoto.
