# Libro de migración AngularJS → Next.js

Este documento es la compuerta de avance del plan maestro. El inventario detallado y reproducible se encuentra en `legacy-inventory.generated.json` y se valida con `npm run inventory:legacy:check`.

## Línea base congelada

- Referencia funcional: HCSBA desarrollo; luego remoto HCSBA; finalmente copia local.
- AngularJS inventariado: 11 dominios y 67 estados de navegación.
- Configuración HCSBA: 15 apps, 6 scripts configurables y 14 templates configurables.
- Microfrontends embebidos: 96 fuentes JavaScript/JSX sobre React 16 y puentes Angular.
- Pruebas legacy: 293 specs, cada una asignada a una suite TypeScript objetivo.
- Contratos transversales: 98 constantes de endpoint, 25 privilegios literales/configurados y 180 archivos de traducción inventariados.
- El inventario marca como malformado el JSON legacy `appointments/locale_es.json`; no se copiará sin corregir y validar.
- No se almacenan credenciales, PHI ni respuestas reales sin anonimización.

## Estado por dominio

| Dominio | Inventariado | Caracterización | Next.js | Certificación HCSBA | Angular retirado |
|---|---:|---:|---:|---:|---:|
| Plataforma `common` | Sí | En progreso | Parcial: sesión incluye proveedor y Form 2 tipado | No | No |
| Home/autenticación | Sí | Caracterizada: login, OTP, sesión, proveedor, locale, ubicación y logout | Implementada; ver `docs/migration/auth-session-location.md` | No, falta OTP/expiración y perfiles HCSBA reales | No |
| Registro | Sí | Parcial | Parcial avanzado: flujo y segunda página implementados | No | No |
| Clinical/Programas | Sí | Parcial avanzada | Dashboard migrado; Consulta tiene shell, siete tableros y guardado unificado implementados bajo flag apagado, con certificación HCSBA pendiente | No | No |
| ADT | Sí | Caracterizada; ver `docs/migration/ipd-bedmanagement.md` | Implementada con relectura de cama/visita/encuentro | Certificación manual HCSBA `.205` en curso | Sí en ambiente local; rollback disponible |
| Gestión de camas/IPD | Sí | Caracterizada: rutas de Bed Management, Care View y dashboard IPD individual | Bed Management y Care View nativos; dashboard individual con seis secciones y acciones de tratamientos uniformes/PRN | Parcial: falta certificar escrituras en HCSBA y portar tratamientos de dosis variable por etapa | Sí local para Bed Management; rollback disponible |
| Documentos | Sí | No | No | No | No |
| Órdenes | Sí | No | No | No | No |
| Pabellón | Sí | No | No | No | No |
| Reportes | Sí | No | No | No | No |
| Administración | Sí | No | No | No | No |

Un dominio sólo cambia a “Caracterizado” cuando cada ruta, acción, privilegio, configuración, endpoint y escritura tiene una prueba o fixture. Sólo cambia a “Certificado” tras comparar el flujo contra HCSBA desarrollo.

## Registro de adaptadores configurables

| Artefacto legacy | Política Next.js | Estado |
|---|---|---|
| `registration/fieldValidation.js` | Adaptadores TypeScript conocidos; nunca ejecutar JavaScript remoto | Implementado para reglas HCSBA vigentes; falta fixture de certificación |
| `clinical/formConditions.js` | Registro declarativo de condiciones con entradas tipadas | Pendiente |
| `clinical/diagnosisServiceConfig.js` | Cliente/configuración tipada de diagnósticos | Pendiente |
| `clinical/dashboard.json` | Parser de tabs/secciones, contexto paciente/visita y registro explícito para las 39 instancias HCSBA | 36 implementadas y 3 parciales; IPS/ICVP tienen adaptador seguro condicionado al mediador — ver `clinical-dashboard-matrix.md` |
| `dbNameCondition/dbNameCondition.js` | Regla tipada de visibilidad por base/configuración | Pendiente |
| `customDisplayControl/js/customControl.js` | Componentes React registrados por tipo | Pendiente |
| `JsBarcode.all.min.js` | `jsbarcode` npm, ya integrado sin bundle remoto | Implementado |
| Templates de Registro | Cuatro componentes React cerrados | Parcial, falta certificación visual |
| Templates Clinical/IPD/OT | Renderers React explícitos; no interpretar HTML Angular | Pendiente |
| Microfrontends React 16 | Portar fuente a React 19/TypeScript sin `react2angular` | Forms V2, All Orders e IPS/ICVP portados al monorepo; estos últimos permanecen deshabilitados hasta desplegar el mediador same-origin |

## Registro: comportamiento implementado y brechas de certificación

- Salvar vuelve a edición; Iniciar visita es una acción separada y sólo crea la visita.
- Una visita activa ofrece Ingresar a visita o la acción configurada por tipo.
- La segunda página carga el Form 2 publicado, conserva `formNamespace`/`formFieldPath` y crea el encuentro `REG` al guardar.
- Se aplican `forwardUrlsForVisitTypes`, `afterVisitSaveForwardUrl`, `enableDashboardRedirect` y extensiones de siguiente acción.
- El script remoto de IMC de `Registration Details` fue sustituido por un adaptador TypeScript explícito; nunca se evalúan eventos JavaScript del formulario.
- Sigue bloqueada la certificación hasta comparar fixtures dorados de paciente, visita, encuentro y observaciones contra HCSBA desarrollo, validar `showLatest` y ejecutar usuarios reales por privilegio.
