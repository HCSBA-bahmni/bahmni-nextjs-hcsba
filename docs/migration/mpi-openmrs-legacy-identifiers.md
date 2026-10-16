# Identificadores heredados de OpenMRS antes de la carga MPI

El 23-09-2026 se inspeccionaron en modo lectura los 29 pacientes que devolvió FHIR2 R4 de OpenMRS `.205` y sus identificadores REST. La captura reportada como `CLRUN*<RUN>` no contenía dos filas concatenadas: era **un solo valor** de tipo `Patient Identifier`, preferido y sin fuente IDGen asociada. La pantalla deducía visualmente la fuente `CL` por el inicio del texto, aunque OpenMRS no la registraba. Por eso la búsqueda FHIR exacta por RUN no encontraba al paciente.

Tras reparar la ficha puntual, el inventario restante mostró **26 pacientes sin identificador tipado `RUN`** y **22 identificadores preferidos con prefijo heredado `RUN*` o `RUT*`**. Once de los valores compuestos simples contenían un RUN con dígito verificador válido; cinco tenían un valor compuesto simple inválido. Otros patrones, como valores con letras internas o separadores irregulares, requieren clasificación individual. Estas cifras son una fotografía del entorno de desarrollo, no un padrón nacional ni una orden de cambio masivo.

La ficha comunicada por el usuario se corrigió sin crear un segundo paciente: se agregó su RUN como identificador propio y metadatos EIS (`typeCode=1`, uso `official`, país emisor `152`); IDGen asignó un número clínico HCSBA como preferido; el valor anterior quedó no preferido y conservado como alias para búsqueda y trazabilidad. Después, la sincronización puntual escribió la fuente Bahmni en OpenCR y vinculó el CRID; un segundo intento devolvió el mismo vínculo. El frontend presenta el RUN manualmente en la primera etapa y el número clínico generado en la tercera. No vuelve a deducir una fuente para identificadores existentes sin fuente real.

Antes de migrar los demás pacientes:

1. Inventariar identificadores y comprobar duplicados de RUN en todo OpenMRS. Una coincidencia textual no equivale a un RUN verificado.
2. Para cada ficha, cotejar RUN y datos demográficos con el documento y resolver los valores inválidos o duplicados con admisión. No derivar el RUN automáticamente desde un `RUN*` mal formado.
3. Agregar el RUN como identificador tipado y sus metadatos EIS. Si el número clínico preferido está contaminado, asignar uno institucional mediante IDGen y conservar el anterior como alias no preferido hasta revisar consumidores externos.
4. Sincronizar esa misma UUID con `/_sync/<uuid>` y comprobar que OpenMRS, OpenCR y PIXm resuelvan un solo vínculo. Repetir la sincronización para verificar idempotencia.

La edición Next automatiza este procedimiento únicamente para el patrón seguro anterior. Al agregar manualmente un RUN que coincide con el valor compuesto válido de la ficha, comprueba que la búsqueda local apunte exclusivamente a esa misma UUID, consulta el MPI y exige confirmación explícita. No deriva ni guarda el RUN por sí sola, no regulariza formatos inválidos y no permite usar este camino para reemplazar un RUN tipado existente.

El paso de admisión consulta FHIR2 y, si no encuentra coincidencia exacta, busca de forma conservadora los identificadores heredados en REST. Una respuesta paginada, mal formada o con candidatos que no se pueden verificar bloquea el alta; no se interpreta como ausencia. Esto protege durante la depuración, pero no reemplaza la normalización de OpenMRS.
