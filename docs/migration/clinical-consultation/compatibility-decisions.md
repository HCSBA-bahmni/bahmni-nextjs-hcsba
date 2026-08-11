# Decisiones de compatibilidad

- La configuración HCSBA es la fuente de verdad. Un adaptador implementa la capacidad legacy sin forzarla; por ejemplo, la duración del motivo sólo es obligatoria cuando `durationRequired=true`.
- No se evalúan eventos Form2 ni JavaScript remoto. Sólo se aceptan propiedades declarativas permitidas y adaptadores TypeScript registrados.
- `NeedsPrint` se conserva dentro de `commentToFulfiller`, igual que en el selector legacy.
- Bacteriología conserva `extensions.mdrtbSpecimen` y los grupos configurados para atributos y resultados.
- El override de proveedor sólo se acepta con la cookie y el privilegio legacy exactos. Logout elimina la cookie.
- Impresión y correo de receta usan los endpoints existentes y generan auditoría; no se añadió una API clínica Next.
- El encuentro se guarda antes que las condiciones. Un fallo posterior o una lectura de `conditionhistory` que no confirme los cambios se informa como parcial y sólo reintenta condiciones; antes del reintento se relee para evitar duplicar una escritura ya aplicada.
- HCSBA devuelve algunas global properties como texto aunque declare `application/json`; el cliente intenta JSON y conserva el texto si no es válido, igual que el `transformResponse` legacy.
- Retrospectivo nunca hereda una visita activa. Histórico recupera la visita persistida; sólo una `visitUuid` explícita puede reemplazarla.
- Documentos y aplicaciones externas conservan navegación completa same-origin para compartir `JSESSIONID`.
- `clinicalConsultationEnabled` quedó activo únicamente después de aprobar la compuerta 14/14 y se mantiene como mecanismo de corte/rollback operativo.
- La pestaña Consulta conserva el alcance del pad legacy: `extension.json` decide su presencia, orden y privilegio, pero su contenido se limita al encuentro actual. Los diagnósticos y condiciones longitudinales siguen disponibles en sus tableros y no se duplican en el pad.
