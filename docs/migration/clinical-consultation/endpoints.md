# Endpoints existentes

No se agregan APIs clínicas Next. Todas las llamadas se hacen desde el navegador con `credentials: include`.

| Dominio | Endpoint |
|---|---|
| Encuentro | `/ws/rest/v1/bahmnicore/bahmniencounter`, `/find`, `/{uuid}` |
| Condiciones | `/ws/rest/emrapi/condition` |
| Diagnóstico | `/ws/rest/v1/bahmni/terminologies/concepts` |
| Conceptos/Form2 | `/ws/rest/v1/concept`, `/ws/rest/v1/bahmniie/form/latestPublishedForms`, `/ws/rest/v1/form/{uuid}`, `/ws/rest/v1/bahmniie/form/translations` |
| Archivos Form2 | `/ws/rest/v1/bahmnicore/visitDocument/uploadDocument`; lectura de previsualización en `/document_images/{value}` |
| Órdenes | `/ws/rest/v1/concept?s=byFullySpecifiedName&name=All+Orderables` con la jerarquía configurada; `orderTypeClassMap` filtra sus miembros localmente |
| Medicamentos | `/ws/rest/v1/drug`, `/ws/rest/v1/bahmnicore/config/drugOrders`, `/ws/rest/v1/bahmnicore/drugOrders/active`, `/ws/rest/v1/bahmnicore/drugOrders` |
| Alergias en Medicamentos | `/ws/fhir2/R4/AllergyIntolerance`; visible por la sección `allergies` configurada en `extension.json` |
| Order sets | `/ws/rest/v1/bahmniorderset?s=byQuery`, `/ws/rest/v1/bahmnicore/calculateDose` |
| Configuración | `app.json`, `extension.json`, `extension-programs.json`, `medication.json`, global properties y entity mappings |
| CDSS | `/ws/rest/v1/cdss?service=medication-order-select` |
| Teleconsulta | `/ws/rest/v1/adhocTeleconsultation/generateAdhocTeleconsultationLink` |
| Auditoría | servicio Bahmni existente con acción `EDIT_ENCOUNTER` |
