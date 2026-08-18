# Libro de migración AngularJS → Next.js

Este documento es la compuerta de avance del plan maestro. El inventario detallado y reproducible se encuentra en `legacy-inventory.generated.json` y se valida con `npm run inventory:legacy:check`. El orden de ejecución, las campañas de certificación y el retiro final se describen en `migration/angular-retirement-plan.md`.

## Línea base congelada

- Referencia funcional: HCSBA desarrollo; luego remoto HCSBA; finalmente copia local.
- AngularJS inventariado: 11 dominios y 67 estados de navegación.
- Configuración HCSBA: 15 apps, 6 scripts configurables y 14 templates configurables.
- Microfrontends embebidos: 96 fuentes JavaScript/JSX sobre React 16 y puentes Angular.
- Pruebas legacy: 293 specs, cada una asignada a una suite TypeScript objetivo.
- Contratos transversales: 98 constantes de endpoint, 25 privilegios literales/configurados y 183 archivos de traducción inventariados.
- `appointments/locale_es.json` ya es JSON válido; el inventario conserva la validación estructural de todos los locales y seguirá fallando si reaparece un archivo malformado.
- No se almacenan credenciales, PHI ni respuestas reales sin anonimización.

## Estado por dominio

| Dominio | Inventariado | Caracterizado | Implementado | Contrato | E2E | Certificado HCSBA | Legacy retirado |
|---|---:|---:|---:|---:|---:|---:|---:|
| Plataforma `common` | Sí | Parcial | Parcial: sesión, configuración, Form2, rutas y servicios tipados | Parcial | Parcial local | No | No |
| Home/autenticación | Sí | Sí | Sí; ver `migration/auth-session-location.md` | Sí local | Sí local OpenMRS/Keycloak | No: falta campaña HCSBA real de OTP, expiración, MFA/revocación Keycloak y perfiles | No; proxy Next activo y rollback disponible |
| Registro | Sí | Sí para el alcance frontend | Sí: búsqueda, alta, edición, visita, segunda página, Form2 e impresión | Sí local, incluido sobre `patient/person` | Sí local multinavegador | No: falta campaña reversible HCSBA | No; proxy Next activo y rollback disponible |
| Clinical — dashboard/visita | Sí | Sí, 39/39 controles trazados | 37/39 activos; IPS e IPS ICVP diferidos y ocultos por switch | 39/39 trazados | E2E local; HCSBA por control pendiente | No | No; proxy Next activo y rollback disponible |
| Clinical — Consulta | Sí | Sí | Sí: siete tableros, cinco modos y guardado unificado | Sí, incluidos payloads dorados | Sí multinavegador | **Sí: compuerta 14/14 del 04-08-2026** | No; el código de rollback continúa versionado |
| Clinical — Programas | Sí | Sí | Sí: enrolamiento, edición, estados, outcomes, atributos, finalización y anulación | Sí local y paridad legacy confirmada | Sí local; escritura HCSBA bloqueada por HTTP 500 compartido | No | No |
| ADT | Sí | Sí; ver `migration/ipd-bedmanagement.md` | Sí, con relectura de cama/visita/encuentro | Sí local, `visitUuid` explícito | Sí local multinavegador | No: certificación HCSBA pendiente | No; proxy Next activo y rollback disponible |
| Gestión de camas/Care View/IPD | Sí | Sí | Parcial: Bed Management nativo; Care View y seis secciones IPD implementadas | Sí local para flujos cubiertos | Sí local multinavegador | No: faltan escrituras HCSBA y dosis variables por etapa | No; proxy Next activo y rollback disponible |
| Documentos | Sí | Sí para el alcance frontend; ver `migration/phase2-certification.md` | Sí: radiología y documentos del paciente | Sí local, incluida conciliación de escrituras | Sí local multinavegador | No: falta almacenamiento y perfiles HCSBA | No; proxy Next activo y rollback disponible |
| Órdenes | Sí | Sí para el alcance frontend; ver `migration/phase2-certification.md` | Sí: búsqueda y cumplimiento | Sí local, incluidos archivos y escritura ambigua | Sí local multinavegador | No: falta cumplimiento reversible HCSBA | No; proxy Next activo y rollback disponible |
| Agenda de citas | Sí | Sí | Sí: operación y administración de servicios nativas | Sí local y lecturas HCSBA verificadas | Sí local | No: faltan perfiles y flujos reales completos | No; proxy Next activo y rollback externo disponible |
| Reportes | Sí | No | No | No | No | No | No: 3 estados AngularJS |
| Administración | Sí | Parcial: dashboard y Audit Log caracterizados; ver `migration/admin-audit-log.md` | Parcial: dashboard y Audit Log nativos | Sí local para dashboard y Audit Log | Sí local Edge para dashboard y Audit Log | No: falta campaña HCSBA real y los demás estados | No; corte selectivo con rollback, 6 estados AngularJS restantes |
| Pabellón/OT | Sí | Diferido: HCSBA usa un sistema institucional propio | Fuera del alcance Next.js | No aplica hasta definir integración | No aplica hasta definir integración | No | No: 4 estados AngularJS pendientes de sustituir por integración o retiro controlado |

Un dominio sólo cambia a “Caracterizado” cuando cada ruta, acción, privilegio, configuración, endpoint y escritura está documentado. “Implementado”, “Contrato”, “E2E”, “Certificado” y “Legacy retirado” son estados independientes: el proxy activo no certifica paridad y conservar rollback no equivale a retirar legacy.

## Registro de adaptadores configurables

| Artefacto legacy | Política Next.js | Estado |
|---|---|---|
| `registration/fieldValidation.js` | Adaptadores TypeScript conocidos; nunca ejecutar JavaScript remoto | Implementado para reglas HCSBA vigentes; falta fixture de certificación |
| `clinical/formConditions.js` | Registro declarativo de condiciones con entradas tipadas | Pendiente |
| `clinical/diagnosisServiceConfig.js` | Cliente/configuración tipada de diagnósticos | Pendiente |
| `clinical/dashboard.json` | Parser de tabs/secciones, contexto paciente/visita y registro explícito para las 39 instancias HCSBA | 37 activas y 2 OpenHIM diferidas/ocultas por switch — ver `clinical-dashboard-matrix.md` |
| `dbNameCondition/dbNameCondition.js` | Regla tipada de visibilidad por base/configuración | Pendiente |
| `customDisplayControl/js/customControl.js` | Componentes React registrados por tipo | Pendiente |
| `JsBarcode.all.min.js` | `jsbarcode` npm, ya integrado sin bundle remoto | Implementado |
| Templates de Registro | Cuatro componentes React cerrados | Parcial, falta certificación visual |
| Templates Clinical/IPD | Renderers React explícitos; no interpretar HTML Angular | Pendiente; OT no se portará y queda sujeto a integración institucional |
| Microfrontends React 16 | Portar fuente a React 19/TypeScript sin `react2angular` | Forms V2 y All Orders portados; IPS/ICVP conservados como integraciones OpenHIM opt-in, ocultas por defecto |

## Registro: comportamiento implementado y brechas de certificación

- Salvar vuelve a edición; Iniciar visita es una acción separada y sólo crea la visita.
- Una visita activa ofrece Ingresar a visita o la acción configurada por tipo.
- La segunda página carga el Form 2 publicado, conserva `formNamespace`/`formFieldPath` y crea el encuentro `REG` al guardar.
- Se aplican `forwardUrlsForVisitTypes`, `afterVisitSaveForwardUrl`, `enableDashboardRedirect` y extensiones de siguiente acción.
- El script remoto de IMC de `Registration Details` fue sustituido por un adaptador TypeScript explícito; nunca se evalúan eventos JavaScript del formulario.
- Sigue bloqueada la certificación hasta comparar fixtures dorados de paciente, visita, encuentro y observaciones contra HCSBA desarrollo, validar `showLatest` y ejecutar usuarios reales por privilegio.
