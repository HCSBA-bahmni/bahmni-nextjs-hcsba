# Órdenes vacías en desarrollo .225 — 2026-10-19

## Estado final: reparado y verificado

El usuario autorizó expresamente la reparación de metadatos con respaldo previo.
Se reparó `.225` mediante la API REST de conceptos, conservando los UUID,
nombres, mappings y referencias clínicas. Se actualizaron 23 conjuntos,
restaurando 492 relaciones y retirando una autorreferencia inválida de Fluoroscopy.
La verificación REST pasó para los 59 conjuntos de la jerarquía.

La prueba Playwright contra el frontend desplegado confirmó:

| Sección | Categorías | Resultado |
| --- | --- | --- |
| Laboratorio | 19 | Catálogo y búsqueda visibles |
| Radiología | 19 | Catálogo y búsqueda visibles |
| Procedimientos | 21 | Catálogo y búsqueda visibles |

La recarga conserva las tres secciones. La prueba bloqueó escrituras clínicas:
no se guardaron órdenes ni encuentros. La navegación usó la ficha que actualmente
posee la visita de la captura; el enlace histórico a la ficha anterior devuelve
400 en `patientprofile`, circunstancia independiente del catálogo.

Respaldo remoto, creado y validado antes de escribir:

```text
/home/arki/bahmni/backups/orders-catalog-20261019T1558Z/
  terminology-before.sql.gz
  configuration-before.tar.gz
  checksums-before.tar.gz
  SHA256SUMS
  metadata-before.json
  metadata-after.json
  plan.json
  applied.jsonl
```

El SQL contiene exclusivamente tablas del diccionario de conceptos, sin tablas
de pacientes, observaciones, encuentros u órdenes. Se comprobaron integridad
gzip/tar y SHA-256. Para revertir, usar el estado previo de los 23 padres en
`plan.json` y no restaurar indiscriminadamente todo el diccionario sobre cambios
posteriores. Cualquier reversa se registra como una nueva modificación auditada.

Configuración persistente desplegada:

```text
hcsba/standard-config:2026.10.19-orders.1
sha256:b944f12beca1000ff8e8573e8d894fc1d2cc79973ffbf8e3579a98d3f5ee730d
```

La imagen deriva de `2026.10.19-clinical.4` y sustituye sólo seis CSV. Su Dockerfile
y contexto exacto están en `patched-configuration/` dentro del respaldo.
Se recreó únicamente `bahmni-config`; Next.js y OpenMRS permanecieron activos,
sin reconstruir ni reiniciar esos servicios. El overlay
`bahmni-docker-HCSBA/bahmni-standard/production-225/docker-compose.mpi-admission.yml`
referencia el nuevo tag. La configuración activa de Initializer también se
actualizó sin forzar una importación general ni borrar checksums.

## Prevención de recurrencia

Se retiró la columna `Members` vacía de `orders.csv`, `lab_samples.csv`,
`procedure_sections.csv` y `radiology_order_sections.csv`. Esas relaciones las
administra `conceptsets`, por lo que una nueva importación de las definiciones
no debe vaciarlas. El código oficial
[NestedConceptLineProcessor 2.7.0](https://github.com/mekomsolutions/openmrs-module-initializer/blob/2.7.0/api/src/main/java/org/openmrs/module/initializer/api/c/NestedConceptLineProcessor.java)
confirma el borrado ante una columna presente vacía y la conservación al omitirla.

El mapping `SNOMED-CT:86273004` resuelve a dos conceptos activos. El miembro de
Procedure Orders ahora referencia directamente la UUID de la categoría Biopsy
declarada en `procedure_sections.csv`. No se fusionaron ni retiraron conceptos.
En el CSV español de `.225`, el nombre de esa categoría se calificó como
«Procedimientos de biopsia», evitando colisionar en una importación posterior
con el concepto clínico que conserva «Biopsia». No se cambiaron sus nombres en
la base de datos durante esta reparación.

Se retiró de `radiology_order_section_mapping.csv` la fila que agregaba
`SNOMED-CT:44491008` a Fluoroscopy: ambos identificadores resuelven a la misma
UUID. El resto de relaciones existentes se conservó. Para filas repetidas se
respetó la última ponderación, como hace `ConceptSetLineProcessor` 2.7.0.

Regresión de configuración: `python scripts/check-order-catalog.py`, desde
`standard-config-HCSBA`. Pasó junto con `git diff --check` de los archivos
modificados. No hubo cambios de código frontend ni se ejecutó un build Next.
No se afirma un arranque nuevo de OpenMRS: se verificó la persistencia de la
configuración en checkout, imagen, volumen compartido y carpeta activa.

Evidencia local sin panel de identidad:
`F:/Proyectos/HIS/analisis/2026-10-19/orders-repair/`, con tres capturas del
tablero y `browser-verification.json`/`verification.json`.

Observación de UI preexistente: con un catálogo extenso, el footer fijo puede
interceptar el clic sobre la última sección al desplazarla al borde inferior.
La prueba navegó contrayendo la sección abierta antes de cambiar a la siguiente;
no certifica ese problema de layout. Los 404 de overrides opcionales y de
traducciones base observados no impidieron la carga desde `bahmni_config`.

## Resultado de la revisión

El mensaje «No hay tipos de órdenes configurados en All Orderables» corresponde
a una jerarquía de conceptos vacía en OpenMRS de `.225`. La petición del frontend
responde HTTP 200 y encuentra el concepto raíz. No es una falla HTTP ni un filtro
de `orderTypeClassMap`: `configuredOrderableTemplates` recibe `setMembers: []`.

Se comprobó mediante lecturas autenticadas de metadatos, sin consultar historias
clínicas ni modificar conceptos, órdenes, roles o servicios.

| Concepto | UUID | `set` | Miembros directos |
| --- | --- | --- | --- |
| All Orderables | d6344fab-5e07-11ef-8f7c-0242ac120002 | false | 0 |
| Lab Samples | d32a6beb-5e07-11ef-8f7c-0242ac120002 | false | 0 |
| Radiology Orders | 9bb0795c-4ff0-0305-1990-000000000048 | false | 0 |
| Procedure Orders | 6a8bb973-e61e-4fbb-b7ca-94ebf163874e | false | 0 |

## Contrato y configuración

`src/services/bahmni/consultation.ts:getAllOrderables` reproduce la representación
de `ui/app/clinical/ordersTabInitialization.js` del repositorio AngularJS.
`conceptSetService` legacy usa la constante
`/ws/rest/v1/concept?s=byFullySpecifiedName`, igual que Next. La consulta real con
esa representación y otra representación reducida devolvieron la misma raíz
sin miembros. Los nombres españoles no impiden localizar el nombre completo
inglés `All Orderables`.

`standard-config-HCSBA/masterdata/configuration/conceptsets/all_orderables_set.csv`
define tres relaciones, en este orden: Lab Samples, Radiology Orders y Procedure
Orders. Los CSV de los tres grupos y sus asociaciones de categorías/exámenes
también existen en el checkout remoto y dentro del contenedor OpenMRS.
Que estén disponibles por `bahmni_config` no acredita que estén aplicados al
catálogo efectivo.

## Estado del importador

Dentro de `bahmni-standard-openmrs-1`, el MD5 de los siguientes CSV coincide con
su archivo en `/openmrs/data/configuration_checksums/conceptsets/`:

| Archivo | MD5 |
| --- | --- |
| all_orderables_set.csv | b2dd4315843c9667cf389f231bcd6df2 |
| lab_samples_set.csv | cb35080f7dfb1cbf161146aff7da3cd9 |
| radiology_orders_set.csv | 05d995da1b6c112a2910c1875cb51a12 |
| procedure_orders_set.csv | 3ba2575f138d06c44f47a21650306acf |

Los checksums conservan fecha del 6 de abril de 2026; los CSV de configuración
del contenedor tienen fecha del 19 de octubre. El estado del importador puede
omitir esos archivos sin cambios aunque el estado efectivo de los conceptos
ya no tenga sus relaciones. Un reinicio o copiar nuevamente el mismo CSV no
demuestra recuperación.

Los logs del arranque revisado registran además:

```text
procedure_sections.csv ('concepts' domain): 1 out of 6 entities were not saved
DuplicateConceptNameException: 'Biopsia' is a duplicate name in locale 'es'
```

La entidad afectada es `bb718d23-92ed-4159-bd34-3f641a17a26b`, nombre inglés
`Biopsy`, mapping `SNOMED-CT:86273004`. No se comprobó que ese error sea la causa
única de la jerarquía vacía ni se identificó la operación histórica que retiró
las relaciones o desmarcó los conjuntos. Evitar atribuirlo a la entrega de
frontend sin evidencia adicional.

## Propuesta inicial de reparación (ejecutada según el estado final anterior)

1. Respaldar los conceptos y relaciones efectivos de la jerarquía de órdenes,
   los CSV aplicados y los checksums específicos antes de intervenir `.225`.
2. Conciliar por UUID/mapping el conflicto Biopsy/Biopsia sin retirar ni fusionar
   conceptos con referencias clínicas de forma automática.
3. Preparar la reaplicación controlada de los conjuntos afectados y sus
   asociaciones desde los CSV HCSBA, resolviendo sus dependencias y conservando
   UUID y orden. Restaurar sólo el vínculo de All Orderables es insuficiente:
   sus tres miembros también están vacíos.
4. Verificar por REST los conjuntos y sus hojas ordenables, y después la
   navegación y búsqueda del tablero en `.225`. No crear órdenes clínicas para
   demostrar únicamente la carga del catálogo.

La revisión inicial fue de sólo lectura. La reparación y las verificaciones
posteriores se describen al comienzo de este documento.
