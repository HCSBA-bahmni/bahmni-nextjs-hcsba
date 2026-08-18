# Evidencia de certificación — Fase 1

Fecha: 17-08-2026
Ambiente: HCSBA DEV, sin registrar nombres, RUN ni UUIDs de pacientes reales.

## Compuerta Programas

- La sesión clínica same-origin está operativa y presenta ubicación de login.
- La configuración real expone `TB Program` y `HIV Program`, fecha de inicio,
  identificador obligatorio, atributos y estado inicial.
- Se creó un fixture exclusivamente sintético con identificador reservado
  `SYN-PHASE1-20260817`. Su UUID no se registra en documentación ni logs
  compartidos.
- La suite real ahora exige `HCSBA_SYNTHETIC_PATIENT_UUIDS` y vuelve a leer cada
  UUID para comprobar un identificador con prefijo incluido en
  `HCSBA_SYNTHETIC_IDENTIFIER_PREFIXES` (por defecto `SYN-`).
- Next.js intentó enrolar el fixture en `TB Program`, primero con estado y
  atributos opcionales y después con el conjunto mínimo requerido. OpenMRS
  respondió HTTP 500 y la relectura confirmó cero enrolamientos activos o
  históricos.
- Se repitió el mismo enrolamiento en la pantalla AngularJS legacy, habilitada
  temporalmente sólo para esta comparación. OpenMRS volvió a fallar y la
  relectura desde Next.js confirmó cero enrolamientos.
- El endpoint, la forma de `patient`, `program`, `dateEnrolled`, `states` y
  `attributes`, y la representación de cada `attributeType` coinciden con el
  cliente legacy. El proxy fue restaurado a Next.js después de la prueba.

Resultado: la implementación y el contrato frontend quedan cerrados, pero la
promoción clínica de escrituras de Programas permanece retenida por un fallo
compartido del backend OpenMRS/Bahmni. No es posible ejecutar edición,
finalización ni anulación porque el enrolamiento inicial no llega a crearse.
La primera acción después de reparar el backend es repetir los pasos 3--7 con
el mismo fixture y rollback.

## IPS/ICVP diferidos

- El upstream DEV está accesible por red y una consulta ITI-67 con un
  identificador sintético inexistente devolvió un `Bundle` vacío.
- La misma consulta sin credenciales devolvió HTTP 200. Esto incumple la
  compuerta prevista: el upstream debe rechazar acceso anónimo y el mediador
  debe usar una cuenta técnica rotada.
- No existen aún los archivos Docker Secret para usuario y contraseña del
  upstream. El overlay permanece desactivado y no se reutilizaron las
  credenciales históricas expuestas en el frontend legacy.

Resultado: estas integraciones OpenHIM quedan fuera del alcance de cierre de la
fase 1. Los controles `ipsReact` e `ipsIcvpReact` se ocultan en dashboard y
vista de visita mientras `NEXT_PUBLIC_IPS_ENABLED=false`; su configuración y
código permanecen versionados para reactivación explícita posterior.

## Cierre de fase 1

La fase se cierra para el alcance de migración frontend cuando las compuertas
técnicas estén verdes. No se declara `Certificado HCSBA` para Programas: su
certificación clínica queda explícitamente retenida hasta reparar el fallo 500
compartido y completar los pasos reversibles 3--7. IPS/ICVP no bloquean este
cierre porque permanecen ocultos y diferidos por decisión de producto.

## Compuertas técnicas finales

- `npm run inventory:legacy:check`: aprobado.
- `npm run audit:dashboard:functional`: aprobado, 39/39 controles trazados,
  37 implementados y dos integraciones diferidas.
- `npm run audit:dashboard`: aprobado, 519 archivos inspeccionados y cero
  runtimes prohibidos.
- `npm run lint`: cero errores; permanecen dos advertencias conocidas por
  imágenes clínicas renderizadas con `<img>`.
- `npm run typecheck`: aprobado.
- `npm test`: 101 archivos y 479 pruebas aprobadas.
- `npm run build`: build standalone aprobado con Next.js 16.2.12.
- `e2e/programs.spec.ts`: aprobado en Chromium, Firefox y Edge.
- `dev-environment.ps1 verify`: ocho verificaciones same-origin aprobadas.
- `/bahmni/api/runtime-config`: `integrations.ips.enabled=false` en el
  despliegue DEV al cerrar la fase.
