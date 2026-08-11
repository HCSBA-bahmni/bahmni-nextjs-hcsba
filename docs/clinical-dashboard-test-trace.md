# Trazabilidad de los 31 specs legacy del dashboard

`Cubierto` significa que la regla observada tiene una prueba TypeScript ejecutable. `Parcial` identifica una regla que aún no puede darse por sustituida. La trazabilidad no declara certificación E2E.

| # | Spec AngularJS | Suite TypeScript | Estado / regla trasladada |
|---:|---|---|---|
| 1 | `clinical/common/services/treatmentService.spec.js` | `services/bahmni/dashboard.test.ts`, `features/clinical/drugOrders.test.ts` | Cubierto: query, actividad y mapping |
| 2 | `clinical/dashboard/controllers/diseaseTemplateController.spec.js` | `config-compat/clinicalConfig.test.ts`, `services/bahmni/dashboard.test.ts` | Cubierto: config y pivote |
| 3 | `clinical/dashboard/controllers/patientDashboardProgramsController.spec.js` | `services/bahmni/clinical.test.ts` | Parcial: lectura; gestión posterior |
| 4 | `clinical/dashboard/controllers/patientDashboardVisitsController.spec.js` | `features/clinical/dashboardContext.test.ts` | Cubierto: contexto/selección |
| 5 | `clinical/displaycontrols/clinicalDashboardConfig.spec.js` | `config-compat/clinicalConfig.test.ts` | Cubierto: tabs, orden y campos adicionales |
| 6 | `clinical/displaycontrols/drugOrderUtil.spec.js` | `features/clinical/drugOrders.test.ts` | Cubierto: activo/scheduled y orden cronológico |
| 7 | `clinical/displaycontrols/models/graphLine.spec.js` | `DashboardControlRegistry` | Parcial: renderer presente; falta aislar escala en unitarios |
| 8 | `clinical/displaycontrols/models/observationGraph.spec.js` | `DashboardControlRegistry` | Parcial: series presentes; falta referencia de crecimiento |
| 9 | `clinical/displaycontrols/models/observationGraphReference.spec.js` | `features/clinical/observationGraph.test.ts` | Cubierto: CSV, género, edad + 1 mes y percentiles |
| 10 | `clinical/displaycontrols/observationData/observationData.spec.js` | `services/bahmni/clinical.test.ts` | Cubierto: conceptos repetidos/scope |
| 11 | `clinical/displaycontrols/observationGraph.spec.js` | `DashboardControlRegistry` | Parcial: requiere fixture gráfico HCSBA |
| 12 | `clinical/displaycontrols/observationGraphConfig.spec.js` | `config-compat/clinicalConfig.test.ts` | Cubierto: yAxis/xAxis/config root |
| 13 | `clinical/displaycontrols/patientContext/directives/patientContext.spec.js` | `features/clinical/patientContext.test.ts` | Cubierto: identidad, dirección y atributos |
| 14 | `clinical/displaycontrols/treatmentTable.spec.js` | `features/clinical/drugOrders.test.ts` | Cubierto: columnas clínicas e indicaciones |
| 15 | `clinical/displaycontrols/visitsTable.spec.js` | `features/clinical/dashboardContext.test.ts` | Parcial: requiere prueba DOM de límite/agrupación |
| 16 | `clinical/models/tabularLabOrderResults.spec.js` | `features/clinical/labResults.test.ts` | Cubierto: etiquetas usadas, columnas y orden |
| 17 | `clinical/services/labOrderResultService.spec.js` | `features/clinical/labResults.test.ts`, `services/bahmni/dashboard.test.ts` | Cubierto: accesiones, paneles y contrato HTTP |
| 18 | `common/displaycontrols/bacteriologyResults/directives/bacteriologyResultsControl.spec.js` | `features/clinical/bacteriology.test.ts`, `services/bahmni/dashboard.test.ts` | Contrato, detalle por espécimen y resolución de encuentro para edición |
| 19 | `common/displaycontrols/chronicTreatmentChart/directives/chronicTreatmentChart.spec.js` | `features/clinical/drugOrders.test.ts` | Parcial: renderer presente; falta fixture de regimen |
| 20 | `common/displaycontrols/dashboard/dashboard.spec.js` | `config-compat/clinicalConfig.test.ts` | Cubierto: tabs y secciones |
| 21 | `common/displaycontrols/dashboard/dashboardSection.spec.js` | `config-compat/clinicalConfig.test.ts` | Cubierto: sección tolerante y orden estable |
| 22 | `common/displaycontrols/dashboard/Directives/dashboard.spec.js` | `features/clinical/DashboardControlRegistry.test.tsx` | Parcial: registro cubierto; E2E de visibilidad pendiente |
| 23 | `common/displaycontrols/dashboard/Directives/dashboardSection.spec.js` | `features/clinical/DashboardControlRegistry.test.tsx` | Parcial: error boundary/empty requieren prueba DOM |
| 24 | `common/displaycontrols/diagnosis/directives/bahmniDiagnosis.spec.js` | `services/bahmni/clinical.test.ts` | Parcial: lectura; certificar certeza/orden |
| 25 | `common/displaycontrols/disposition/directives/disposition.spec.js` | `services/bahmni/dashboard.test.ts` | Cubierto: separación explícita dashboard por paciente / resumen por visita y locale |
| 26 | `common/displaycontrols/drugOrderDetails/directives/drugOrderDetails.spec.js` | `features/clinical/drugOrders.test.ts` | Cubierto: showOnlyActive y mapping |
| 27 | `common/displaycontrols/forms/controllers/versionedFormController.spec.js` | `services/bahmni/forms.test.ts`, `features/forms/form2.test.ts` | Cubierto: versión publicada/encuentro |
| 28 | `common/displaycontrols/forms/directives/formsTable.spec.js` | `services/bahmni/forms.test.ts` | Parcial: lectura cubierta; DOM por formGroup pendiente |
| 29 | `common/displaycontrols/programs/directives/programs.spec.js` | `services/bahmni/clinical.test.ts` | Parcial: lectura cubierta; acciones posteriores |
| 30 | `common/domain/services/conditionsService.spec.js`, `clinical/models/condition.spec.js` | `services/bahmni/clinical.test.ts`, `features/clinical/conditions.test.ts` | Cubierto: historial, anulados, último estado y fecha activa original |
| 31 | `common/services/allergyService.spec.js` | `services/bahmni/clinical.test.ts` | Cubierto: FHIR AllergyIntolerance |

Resumen actual: **19 cubiertos**, **12 parciales**, **0 sin trazabilidad**. Los parciales permanecen como compuertas explícitas de la matriz de 39 instancias.
