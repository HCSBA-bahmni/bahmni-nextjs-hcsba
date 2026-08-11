# Modos de Consulta

| Modo | Entrada | Visita/tipo | Restricciones |
|---|---|---|---|
| Visita activa | `visitUuid` o visita abierta en ubicación | Conserva la visita | Todos los tableros según privilegios |
| Sin visita | No hay visita y `allowConsultationWhenNoOpenVisit=true` | `defaultVisitType` | Crea encuentro sin abrir una API nueva |
| Histórico | `encounterUuid` | Conserva ubicación/encuentro | Edición controlada del encuentro solicitado |
| Retrospectivo | `retrospectiveDate` | `visitTypeForRetrospectiveEntries` | Órdenes, bacteriología y disposición deshabilitadas |
| Programa | `programUuid` + `enrollment` | Tipo de encuentro por mapping de programa | Usa extensiones de programas y `context.patientProgramUuid` |

La precedencia del tipo de encuentro es mapping de programa, mapping de ubicación y global property `bahmni.encounterType.default`. `dateEnrolled` y `dateCompleted` se conservan en la URL del contexto de programa. El proveedor otorgado en `app.clinical.grantProviderAccessData` tiene precedencia únicamente con el privilegio exacto `app:clinical:grantProviderAccess`; en los demás casos se usa el proveedor actual.
