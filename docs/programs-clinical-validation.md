# Validacion clinica de Programas antes del corte

Esta matriz es la compuerta para retirar el fallback de Bahmni legacy para
Programas. Compara el comportamiento nativo Next.js con las llamadas del
cliente AngularJS, no solo la apariencia de la pantalla.

## Evidencia automatizada

La suite de contratos debe ejecutarse antes de una prueba clinica manual:

```powershell
npm test -- --run src/services/bahmni/clinical.test.ts src/services/bahmni/programs.test.ts src/features/clinical/navigationLinks.test.ts src/features/programs/ProgramSearch.test.ts
npm run typecheck
```

| Flujo | Legacy | Next.js | Prueba de contrato |
| --- | --- | --- | --- |
| Cola de programas activos | `bahmnicore/sql?q=emrapi.sqlSearch.activePatients&v=full` | Mismo endpoint y parametros de ubicacion/proveedor | `clinical.test.ts` |
| Busqueda Todos | `bahmni/search/patient/lucene` | Mismo endpoint, `filterOnAllIdentifiers`, `q`, `identifier` y ubicacion | `clinical.test.ts`, `ProgramSearch.test.ts` |
| Programas del paciente | `GET bahmniprogramenrollment?patient=<uuid>&v=full` | Misma representacion completa | `clinical.test.ts` |
| Definiciones y atributos | `GET program?v=default`; `GET programattributetype?v=custom:(...)` | Mismos endpoints y proyeccion de atributos | `programs.test.ts` |
| Enrolar | `POST bahmniprogramenrollment` | Mismo paciente, programa, fecha, estado y atributos | `programs.test.ts` |
| Editar/finalizar | `POST bahmniprogramenrollment/<enrollment>` | Mismo endpoint y contrato de fecha, estados, outcome y atributos | `programs.test.ts` |
| Quitar estado | `DELETE programenrollment/<enrollment>/state/<state>` | Mismo endpoint y motivo tecnico legacy | `programs.test.ts` |
| Anular | `POST bahmniprogramenrollment/<enrollment>` | Mismo contrato, con motivo obligatorio adicional para auditoria | `programs.test.ts` |
| Dashboard y Consulta | Parametros `programUuid`, `enrollment`, `dateEnrolled`, `dateCompleted` | Se conservan al entrar a Consulta; `configName=programs` | `navigationLinks.test.ts` |

Referencias de origen: `ui/app/common/domain/services/programService.js` y
`ui/app/common/uicontrols/programmanagement/controllers/manageProgramController.js`.

## Ejecucion clinica con paciente de prueba

No usar pacientes reales. Para cada caso, registrar solamente UUIDs y el
resultado (sin nombres, RUN ni capturas con datos identificatorios).

1. Identificar un paciente de certificacion y un programa de prueba con al
   menos un estado, un atributo configurable y un outcome.
2. En legacy, abrir Programas y anotar los UUIDs de enrolamiento existentes,
   fecha, estado activo, atributos y resultado. Repetir en Next y comprobar
   que los valores son identicos.
3. Crear en Next un enrolamiento nuevo con una fecha conocida, estado inicial
   y todos los atributos requeridos. Abrir legacy y confirmar la misma fila,
   estado y atributos. Anotar el UUID creado.
4. En Next, editar fecha/atributo y cambiar estado. Verificar en legacy el
   historial de estados y que la fecha nueva no sea anterior al estado activo.
5. Finalizar otro enrolamiento de prueba con outcome. Comprobar en legacy la
   fecha de termino, outcome e historial.
6. Desde un programa historico abrir el dashboard y despues Consulta.
   Confirmar que la URL conserva `programUuid`, `enrollment`,
   `dateEnrolled` y `dateCompleted`; verificar una lectura de observaciones y
   tratamientos limitada al mismo periodo.
7. En otro enrolamiento desechable, anular con un motivo. Confirmar en legacy
   que deja de aparecer como programa activo y que el registro queda auditado
   como anulado.

## Criterio de corte y rollback

El fallback solo se puede apagar cuando los pasos 2--7 pasan con el mismo
paciente de prueba en ambos clientes, las pruebas automatizadas estan verdes y
un responsable clinico firma la matriz. Conservar un interruptor dedicado de
proxy para Programas: el rollback debe ser retirar solo ese interruptor y
recrear el proxy, sin cambiar datos ni reiniciar OpenMRS.

Estado actual: contratos de codigo cubiertos; validacion con paciente de
certificacion pendiente de que se indique el UUID autorizado.
