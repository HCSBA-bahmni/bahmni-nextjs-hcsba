# Formulario dinámico de alta y edición de pacientes

Este documento registra el contrato reconstruido desde `bahmni-web` para no confundir la configuración de búsqueda con la composición del formulario de Registro.

## Fuente de verdad legacy

La composición está definida por:

- `registration/app.json > config.patientInformation`;
- tipos de atributos de persona de `GET /openmrs/ws/rest/v1/personattributetype`;
- tipos y fuentes de identificador de `GET /openmrs/ws/rest/v1/idgen/identifiertype`;
- niveles de dirección de Address Hierarchy;
- `fieldValidation`, traducciones y metadatos de OpenMRS.

El algoritmo de referencia es `Bahmni.Registration.PatientConfig` en `ui/app/registration/models/patientConfig.js`.

## Clasificación exacta de atributos

1. `patientInformation.hidden.attributes` no se renderiza.
2. `patientInformation.defaults` inicializa valores; no es una sección visual.
3. `givenNameLocal`, `middleNameLocal` y `familyNameLocal` forman el bloque de nombre social sólo cuando existen los tres tipos, igual que `PatientConfig.local()`.
4. Las demás entradas de `patientInformation` son secciones configuradas. Conservan `title`, `translationKey`, `shortcutKey`, `order`, `expanded` y la lista de atributos.
5. Un atributo no oculto, no reservado para nombre social y no asignado a una sección aparece en **Otra información**.
6. `patientSearch.customAttributes` y `patientSearch.socialAttributes` sólo configuran búsqueda. Nunca hacen visible un campo en el formulario.

Para HCSBA, `additionalPatientInformation` contiene actualmente `email` junto con otros atributos que pueden no existir en todos los ambientes. El título sin `translationKey` usa `REGISTRATION_TITLE_ADDITIONAL_PATIENT`, reproduciendo el comportamiento legacy: **Información Adicional del Paciente**.

## Identificadores

- El identificador preferido conserva tipo, fuente, prefijo, formato, obligatoriedad y UUID al editar.
- Todos los tipos restantes se representan bajo **Identificadores adicionales**.
- Cada identificador adicional conserva su UUID y se envía con `preferred: false`.
- Vaciar un identificador existente produce `voided: true`; no se elimina silenciosamente del payload.
- Las reglas `format`, `formatDescription`, `required` e Identifier Sources provienen de OpenMRS.

## Secciones de la vista

La vista Next.js mantiene la presentación moderna, pero sigue el orden conceptual legacy:

1. datos de identificación, nombres, género, edad y nacimiento;
2. información de dirección;
3. identificadores adicionales;
4. otra información;
5. secciones configuradas y ordenadas;
6. relaciones e información de fallecimiento.

Las secciones adicionales se abren si `expanded` es verdadero o si el paciente ya tiene un valor, igual que los controladores de alta y edición AngularJS.

## Reglas para futuras modificaciones

- No agregar atributos al formulario porque aparezcan en búsqueda.
- No comparar por etiquetas visibles; usar nombres técnicos y UUID.
- No cambiar el wire format de `patientprofile` al reorganizar la UI.
- Probar alta y edición, un identificador adicional, un atributo vacío/voided, una sección oculta y una sección con valor previo.
- Mantener pruebas de caracterización para `PatientConfig`, mappers y el flujo E2E en los tres navegadores.
