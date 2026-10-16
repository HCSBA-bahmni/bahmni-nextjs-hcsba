# MPI en el registro Next.js

## Flujo implementado

`/registration/patient/new` conserva el formulario EIS existente. Cuando se habilita MPI, antes del formulario:

1. Valida el RUN en el navegador.
2. Consulta fichas OpenMRS por FHIR2 `Patient?identifier`, exige coincidencia exacta y rechaza resultados paginados o no verificables. Si FHIR2 no encuentra ninguna, hace una búsqueda REST conservadora para detectar identificadores heredados como `CLRUN*<RUN>`; los candidatos inciertos bloquean el alta.
3. Consulta el canal de admisión MPI mediante `/openmrs/mpi-admission-gateway/fhir/Patient`. La puerta de enlace valida la sesión/privilegio OpenMRS e inyecta la credencial OpenHIM en el servidor.
4. Distingue ficha local existente, coincidencia única MPI, ausencia de coincidencia, ambigüedad, dato desactualizado y error. Solo la persona usuaria confirma la identidad. Un resultado negativo de la copia interna fuerza una consulta nacional antes de permitir crear una ficha; el modo de admisión se comprueba por la cabecera `X-MPI-Purpose`. Una ficha local se abre por UUID; una identidad MPI sin ficha local precarga únicamente datos de identidad y RUN. No se hace `POST /mpi-admision/fhir/Patient` porque ese endpoint también crea una ficha Bahmni parcial.
5. Guarda una sola ficha por `bahmnicore/patientprofile`, después los metadatos `eisidentity`, luego `/_sync/<uuid>` para registrar la fuente Bahmni en OpenCR y vincular el CRID. Foto, biometría y visita siguen después. Si una escritura posterior falla, se navega a la ficha por UUID con estado pendiente; jamás se repite el alta.

El mediador actual solo sincroniza automáticamente fichas con RUN. La rama sin RUN exige confirmar que se buscó por el otro documento y deja el vínculo pendiente; no afirma que el MPI resolvió esa identidad. Si el RUN cambia dentro del formulario, la escritura se bloquea hasta repetir la verificación. Los conflictos 409/412 de OpenMRS no se pueden sobrepasar con «Confirmar duplicado» en esta modalidad.

En la edición de una ficha con RUN, `integrated` sincroniza el índice después de guardar EIS. Un cambio de un RUN ya tipado se bloquea antes de escribir: requiere una verificación/adjudicación de identidad aparte. La incorporación de RUN a una ficha pre-MPI sólo habilita la regularización cuando el valor ingresado coincide exactamente con un identificador histórico válido `RUN*`, `RUT*`, `CLRUN*` o `CLRUT*`; además, la búsqueda local debe resolver únicamente la misma UUID y el MPI debe entregar un resultado vigente y no ambiguo. La persona usuaria confirma la comparación en un diálogo antes de cualquier escritura. Entonces IDGen asigna o promueve el HCSBA institucional, el identificador anterior queda como alias no preferido, se guardan RUN/metadatos EIS y se sincroniza esa misma UUID con MPI. Si cualquiera de esas precondiciones falla, no se modifica la ficha.

El prefijo configurado (`defaultIdentifierPrefix`, actualmente `HCSBA`) se usa para seleccionar la fuente publicada por `/idgen/identifiertype`, pero `POST /idgen` recibe el **nombre** de esa fuente (`identifierSourceName`), no su prefijo visible. En HCSBA ambos valores no son iguales. Si IDGen falla, la actualización del paciente no se envía ni se reintenta automáticamente.

Si la escritura OpenMRS termina pero falla el paso EIS o MPI, la interfaz navega a la misma UUID con estado pendiente y no repite automáticamente la escritura clínica. Si el índice falla, la ficha ofrece reintento manual del vínculo.

## Modos

| `NEXT_PUBLIC_MPI_ADMISSION_MODE` | Conducta |
| --- | --- |
| `off` | Registro actual, sin paso MPI. Valor por defecto. |
| `preview` | Paso MPI y formulario navegables; los botones de guardado clínico están deshabilitados. Usa el laboratorio sintético. |
| `integrated` | Habilita el guardado clínico y `/_sync` después de EIS. Requiere backend real, TLS y configuración EIS completa. |

El modo `integrated` comprueba que el `app.json` activo publique metadatos de identificadores y atributos obligatorios EIS, y que OpenMRS publique el tipo `RUN`. El entorno local de desarrollo ya sirve esa configuración y `.205` publica el OMOD EIS y el tipo `CRID MPI`.

En `integrated`, Registro muestra **Comprobar flujo MPI** en la búsqueda, el alta y la edición de pacientes. Abre `/openmrs/mpi-admission-gateway/demo.html` en otra pestaña, bajo la misma sesión OpenMRS, para inspeccionar el recorrido y los recursos FHIR. El enlace usa la ruta same-origin configurada en `NEXT_PUBLIC_MPI_ADMISSION_BASE` y no incluye el RUN en la URL; el usuario lo escribe en el visor.

En la primera etapa del formulario se escribe el RUN manualmente, como identificador EIS separado. El identificador clínico primario de OpenMRS se muestra en la tercera etapa; con `showEnterID=false` se asigna desde la fuente IDGen configurada al guardar y no se edita a mano. Los números clínicos heredados no preferidos se conservan como alias de solo lectura. El CRID MPI permanece en el payload clínico, pero está oculto a la edición manual. El [inventario de identificadores heredados](mpi-openmrs-legacy-identifiers.md) explica la depuración previa a una migración masiva de pacientes existentes.

## Validación y límites

Las pruebas unitarias cubren el contrato FHIR/cabeceras MPI, seguridad frente a búsquedas locales incompletas, orden de escrituras y conservación del UUID ante fallos EIS/MPI. Playwright prueba vista previa en Chromium, Firefox y Edge: nueva identidad, ficha local existente y MPI desactualizado. El gateway tiene pruebas de acceso y de bloqueo de POST en vista previa.

El 23-09-2026 se probó `integrated` con OpenHIM `.206`, OpenCR/HAPI/OpenSearch persistentes `.227` y OpenMRS `.205`. El paciente **sintético** `12345678-5` quedó en OpenMRS con identificador clínico HCSBA, RUN, metadatos EIS y CRID; `/_sync` terminó vinculado y PIXm resolvió el identificador clínico. En esa fecha la respuesta nacional MINSAL aún era simulada. El worker Atomfeed continúa apagado hasta corregir y validar su marcador; por ahora las altas y ediciones con RUN usan sincronización puntual.

Desde el 16-10-2026 el adaptador compartido `.227` usa el MPI oficial productivo por OpenHIM, con API Persona como contingencia. Los RUN sintéticos anteriores describen solo la prueba histórica y no deben usarse para verificar la consulta productiva. En el ambiente `.225`, un RUN autorizado con refresco devolvió una coincidencia nacional y la consulta siguiente leyó la identidad vigente del índice local. Para pruebas manuales nuevas usar un RUN autorizado por su titular y revisar `X-MPI-Source`/`X-MPI-Decision` sin registrar datos personales en logs. La operación y las rutas privadas están documentadas en `mediadores-mpi/docs/MPI-MINSAL-OFICIAL-PROD-2026-10-16.md`.
