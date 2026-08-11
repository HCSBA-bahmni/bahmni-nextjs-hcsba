# Paridad de diagnóstico y condiciones

## Fuentes legacy caracterizadas

- `clinical/consultation/views/diagnosis.html`, `conditions.html`, `diagnosisRow.html` y `conditionRow.html`.
- `clinical/consultation/controllers/diagnosisController.js`.
- `common/domain/models/diagnosis.js`, `condition.js`, `diagnosisMapper.js` y `conditionsService.js`.
- `clinical/consultation/mappers/encounterTransactionMapper.js`.

## Conducta conservada

- Un formulario de alta separado de los diagnósticos ya guardados.
- Una fila vacía de diagnóstico se mantiene disponible, se elimina del payload al guardar y vuelve a crearse al completar la anterior.
- La búsqueda normaliza `conceptUuid`, `conceptName`, `matchedName`, `conceptSystem` y `code` del endpoint de terminología; los resultados se muestran y pueden seleccionarse. A diferencia de `restEmptyRowsToOne` legacy, escribir una consulta pendiente no crea otra fila: la siguiente aparece al seleccionar un concepto o aceptar texto libre.
- Orden y certeza usan grupos de botones con opciones visibles y mutuamente excluyentes, no desplegables.
- Comentarios de diagnóstico y detalle adicional de condición permanecen cerrados hasta activar su botón, como `comment-toggle` en legacy.
- Diagnósticos del encuentro actual y diagnósticos anteriores, con orden primario primero, datos iniciales/actuales, comentarios y edición.
- Texto libre sólo después de **Aceptar** cuando `allowOnlyCodedDiagnosis` es falso.
- La validación de duplicados compara diagnósticos nuevos entre sí y contra los ya guardados en el encuentro actual. Un diagnóstico presente únicamente en encuentros anteriores puede volver a registrarse, igual que en legacy.
- Conversión a condición sólo para diagnósticos confirmados que no tengan una condición activa equivalente.
- Eliminación directa por `/bahmnicore/diagnosis/delete` únicamente con `app:clinical:deleteDiagnosis`.
- Un formulario de alta de condición con `ACTIVE`, `HISTORY_OF` e `INACTIVE`.
- El estado de condición usa las tres opciones visibles del `buttons-radio` legacy.
- Listas separadas de condiciones activas, historial e inactivas; las inactivas permanecen colapsadas inicialmente.
- Transiciones desde activo a historial/inactivo con la fecha local del encuentro, seguimiento mediante `Follow-up Condition` y fecha activa original obtenida de la cadena `previousConditionUuid`.
- Duplicados activos y reactivaciones anteriores a la fecha activa original se rechazan de forma visible.
- En modo retrospectivo las condiciones se leen, pero no se modifican.

Los contratos de escritura no cambiaron: diagnósticos siguen dentro de `/bahmniencounter` y condiciones se guardan después por `/emrapi/condition`, conservando el reintento aislado ya certificado. El resultado se reconcilia desde `/emrapi/conditionhistory`, igual que `saveConditions` en legacy; el estado local no puede simular una condición persistida.

## Evidencia

- `diagnosisBoard.test.ts`: agrupación, duplicados, reactivación, fechas, conversión y orden primario.
- `draft.test.ts`: separación actual/anterior, normalización del historial y confirmación read-after-write de condiciones.
- `goldenPayloads.test.ts`: wire formats de diagnóstico y condición.
- `consultation.spec.ts`: jerarquía visible, diagnóstico anterior, condición activa, acciones y guardado del payload.
- `consultation.test.ts`, `registry.test.ts` y `consultation.spec.ts`: contrato de resultados de terminología, lista visible, selección, creación diferida de la siguiente fila y repetición permitida desde el historial.
