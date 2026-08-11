# Compatibilidad de Form Builder / Form 2

Este documento registra decisiones que deben conservarse durante la eliminación de AngularJS. La implementación compartida vive en `src/features/forms` y se usa tanto en Registro como en el dashboard clínico.

## Fuentes de verdad

1. La definición publicada se obtiene desde `GET /openmrs/ws/rest/v1/form/{uuid}?v=custom:(resources:(value))`.
2. Los textos publicados se consultan en `GET /openmrs/ws/rest/v1/bahmniie/form/translations` con `formName`, `formVersion`, `formUuid` y `locale`.
3. Los overlays de locale se cargan, de menor a mayor precedencia, desde:
   - `/bahmni/i18n/forms/{formUuid}/locale_{locale}.json` (compatibilidad incluida en Next.js);
   - `/bahmni_config/openmrs/i18n/forms/{formUuid}/locale_{locale}.json`;
   - `/implementation_config/openmrs/i18n/forms/{formUuid}/locale_{locale}.json`.
4. Para un locale regional, por ejemplo `es_CL`, se combina primero `es` y luego `es_CL`.
5. El texto original de la definición sólo se usa cuando ninguna fuente contiene su `translationKey`.

Los overlays conservan el contrato importable de Form Builder:

```json
{
  "labels": { "FORM_NAME": "Nombre localizado", "SECTION_1": "Sección" },
  "concepts": { "CONCEPT_KEY": "Etiqueta localizada" }
}
```

`FORM_NAME` es una extensión segura del host Next.js para localizar el encabezado. No altera el nombre técnico del formulario ni el `formFieldPath`.

## Hallazgo HCSBA: locales publicados

Al 4 de agosto de 2026, los 23 archivos de `bahmni-standard/clinical_forms/translations` contienen únicamente el locale `en`. El formulario **Registration Details** (`7f659037-5aa5-44cc-aced-32a4d6ed113e`) también declara `defaultLocale: "en"`. En consecuencia, pedir `es` al endpoint legacy puede devolver el bundle inglés por defecto.

La traducción española inicial se conserva como datos en:

`public/i18n/forms/7f659037-5aa5-44cc-aced-32a4d6ed113e/locale_es.json`

Para traducir otro formulario se agrega el archivo equivalente bajo su UUID; no se modifica `Form2Renderer` ni se codifican comparaciones por texto visible.

## Reglas de renderizado que no deben perderse

- `properties.location.row/column` determina el orden y la composición de filas y columnas.
- `section` y `obsGroupControl` conservan sus límites visuales y su jerarquía clínica.
- `mandatory`, límites absolutos, rangos normales, unidades, notas, valores anormales y opciones codificadas provienen de la definición.
- Las escrituras preservan `formFieldPath`, UUID de concepto, UUID de respuesta codificada, grupos y el wire format del encuentro.
- Nunca se ejecutan `events` JavaScript remotos. Las reglas usadas por HCSBA se implementan como adaptadores TypeScript explícitos y verificables.
- `showLatest` y `conceptNames` vienen de la extensión de Registro y controlan el panel de observaciones recientes.

## Contrato del panel Reciente

El directive legacy `latestObs` llama a `observationsService.fetch(patientUuid, conceptNames, "latest")` sin enviar `numberOfVisits`. Next.js debe conservar esa llamada: limitarla a una visita puede ocultar el último IMC válido cuando fue registrado en un encuentro anterior.

Después de guardar el encuentro REG se invalida y vuelve a consultar la clave `registration/latest-observations` del paciente. Esto permite pasar de “No hay observaciones recientes” a los valores persistidos —por ejemplo peso, IMC y estado del IMC— sin recargar la página.

La configuración HCSBA vigente obtiene la lista desde `registration/extension.json`: `Height (cm)`, `Weight (Kg)`, `Body mass index` y `BMI Status`. La comparación visual es tolerante a mayúsculas/minúsculas, pero las solicitudes conservan los nombres configurados.

## Precedencia y seguridad

El overlay del locale solicitado prevalece sobre la respuesta del endpoint porque el backend actual retorna el locale por defecto cuando no existe una publicación española. Los archivos de implementación tienen la última palabra, permitiendo que HCSBA corrija terminología sin recompilar el componente.

Los payloads se tratan como JSON; nunca se evalúan como código. Las claves desconocidas se ignoran y un texto ausente cae de forma determinista al valor publicado en la definición.

## Verificación mínima al agregar un formulario

1. Confirmar UUID, versión, `defaultLocale` y claves presentes en la definición publicada.
2. Crear el overlay por UUID y locale sin cambiar las claves.
3. Probar secciones, grupos, conceptos, descripciones y respuestas codificadas.
4. Verificar al menos un locale regional (`es_CL`) para comprobar el fallback a `es`.
5. Comparar el payload de guardado con el legacy; la traducción nunca debe cambiar UUID, valor o `formFieldPath`.
6. Ejecutar `npm test`, `npm run typecheck`, `npm run lint` y los E2E del formulario.
