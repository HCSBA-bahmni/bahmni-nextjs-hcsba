# Form2 y adaptadores

El renderer consume únicamente formularios publicados, su versión, traducciones y conceptos obtenidos desde OpenMRS/Bahmni. Los campos desconocidos del contrato se conservan. Nunca se ejecuta JavaScript descargado ni los eventos remotos de una definición.

## Contrato de definición

- Se aceptan las dos estructuras que publica Form Builder: controles de observación con `label` anidado y etiquetas estáticas con `value`/`translationKey` directamente en el control.
- La versión usada en `formFieldPath` proviene de `latestPublishedForms.formVersion`; prevalece sobre una versión antigua incluida dentro del recurso.
- El orden, filas, columnas, grupos y secciones se toman de la definición publicada.
- Los formularios visibles y abiertos por defecto provienen de `extension.json`, los privilegios publicados del formulario, el tipo de visita y la existencia de observaciones previas.
- Los formularios fijados por cada usuario conservan el contrato legacy: `userProperties.favouriteObsTemplates`, con nombres internos separados por `###`. Se persisten mediante `POST /openmrs/ws/rest/v1/user/{uuid}` y no en `localStorage`, por lo que acompañan al usuario en atenciones futuras.

## Reglas admitidas

- `conceptSetUI`: propiedades declarativas conocidas como `multiSelect`, `buttonSelect`, `grid`, `autocomplete`, `allowAddMore`, `allowFutureDates`, `conciseText`, `codedConceptName`, `nonCodedConceptName`, `durationRequired`, `required` y valores predeterminados.
- Rangos normales y absolutos, obligatorios, marca de anormalidad, notas, grupos, valores codificados, fechas y controles calculados conocidos.
- `addMore`: cada repetición conserva su índice en `formFieldPath` (`grupo-0`, `grupo-1`, etc.) y sus miembros quedan anidados bajo el grupo correcto.
- `ImageUrlHandler` y `VideoUrlHandler`: cargan de inmediato mediante `/bahmnicore/visitDocument/uploadDocument`, guardan la URL devuelta como valor Complex y usan el mismo marcador reversible `voided` del legacy.
- Visibilidad por tipo de visita: sólo se extrae una lista literal de `visitTypes` de la configuración conocida. El cuerpo de `showIf` no se evalúa.
- History and Examination: “Chief complaint (text)” sólo aparece al escoger “Other generic”. Cada repetición se valida de forma independiente. Duración y unidad se exigen únicamente cuando `durationRequired=true`; nunca se acepta duración sin motivo.
- El encabezado de cada formulario conserva las cuatro acciones legacy: expandir secciones, contraer secciones, fijar/desfijar y quitar. Quitar queda deshabilitado cuando existen observaciones persistidas; un formulario fijado permanece en el listado lateral y al quitarlo sólo se limpia su instancia nueva.
- La descripción de un concepto se presenta mediante `Tooltip` de PrimeReact sobre el icono de ayuda. Usa seguimiento del cursor (`mouseTrack`), no modifica la grilla ni agrega filas al formulario y conserva una etiqueta accesible completa para lectores de pantalla.

## RepresentaciÃ³n de conceptos codificados

Se respeta la selecciÃ³n visual de Form Builder con la misma precedencia legacy: `multiSelect`, `autocomplete`, `dropdown` explÃ­cito y, por defecto, botones visibles (`buttonSelect`). La cantidad de respuestas no modifica el tipo de control. Los alias publicados `autocomplete`/`autoComplete` y `dropdown`/`dropDown` se normalizan sin alterar el wire format de la observaciÃ³n.

## Registro de adaptadores

Los eventos conocidos se registran en `FormEventAdapterRegistry`. Un evento sin adaptador no se ejecuta y debe quedar como brecha explícita de certificación.
