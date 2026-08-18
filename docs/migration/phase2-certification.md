# Fase 2 — campañas de módulos Next.js activos

## Estado

El alcance **frontend/local** de las campañas A, B, C y D está completo y
queda controlado por `phase2-gate.json`. Esto significa que los contratos
caracterizados, las escrituras simuladas, las protecciones ante ambigüedad, la
accesibilidad declarada y los recorridos multinavegador pasan sin cargar el
runtime AngularJS.

No significa que los cuatro dominios estén certificados institucionalmente.
La columna HCSBA permanece pendiente hasta ejecutar escrituras reversibles con
usuarios y pacientes sintéticos autorizados contra desarrollo. Los mocks y una
copia local de OpenMRS no pueden sustituir esa evidencia.

## Campaña A — Home y autenticación

- OpenMRS: credencial incorrecta, OTP, Provider, ubicación, ubicación
  recordada, expiración, retorno local y cambio de contraseña con las políticas
  devueltas por Bahmni.
- Keycloak: la prueba sólo se habilita cuando el runtime publicado declara
  `authMode=keycloak`; así una build OpenMRS no genera falsos fallos ni una
  build SSO omite su logout.
- La contraseña OpenMRS no aparece en modo Keycloak y no se almacenan tokens en
  el navegador.

## Campaña B — Registro

- Búsqueda Lucene y normalización de resultados.
- Alta con metadatos dinámicos HCSBA, prefijo/identificador generado,
  atributos, fecha estimada y sobre `patient/person` idéntico al mapper legacy.
- Edición, `Jump-Accepted`, visita, resolución de ubicación, Form2 publicado,
  observaciones, identificadores adicionales, relaciones y workflows cubiertos
  por contratos unitarios.
- Segunda página y `showLatest` ejercitados por Playwright; impresión conserva
  el registro cerrado de cuatro templates React.

## Campaña C — ADT, camas, Care View e IPD

- Paciente con cama, admitido sin cama, modo administrativo, reserva/bloqueo,
  admisión, traslado, conflicto concurrente y alta.
- Transferencia y alta incluyen el `visitUuid` activo. Es una protección
  intencional frente a pacientes con más de una visita: no se revierte a una
  selección implícita del backend.
- Care View confirma equipo de cuidados con el turno vigente.
- El dashboard individual usa exclusivamente `ipdDashboard/app.json` y sus
  seis claves tipadas `VT`, `AL`, `DG`, `TR`, `NT`, `DC`.
- El filtro de tareas expone nombre accesible en el input, trigger y select
  interno de PrimeReact.

La dosis variable por etapas permanece como criterio HCSBA pendiente y no se
declara soportada por inferencia.

## Campaña D — Documentos, Órdenes y Appointments

- Documentos: autoría, edición, retiro/restauración, visita nueva y auditoría.
- Órdenes: selección local, cancelación sin escritura, limpieza tras fallo
  pre-commit, bloqueo cuando falla el archivo y conciliación sin reintento ante
  timeout post-commit.
- Appointments: calendario, recursos, acciones, resumen, lista, búsqueda de
  paciente, formulario lateral y CRUD de servicios.

## Comandos de compuerta

```powershell
npm run certification:phase2
npm run gate:phase2
```

`gate:phase2` exige únicamente evidencia reproducible local. La promoción
institucional debe ejecutar además:

```powershell
npm run gate:phase2:hcsba
```

Este último comando debe fallar mientras `hcsbaCriteria` conserve criterios
pendientes. Sólo se cambian a `passed` después de adjuntar evidencia
anonimizada, sin credenciales ni PHI.
