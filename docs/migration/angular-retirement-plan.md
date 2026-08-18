# Plan de acción para retirar AngularJS

Este documento conserva el orden de ejecución acordado para completar la
migración HCSBA desde `bahmni-web`/AngularJS hacia Next.js. El inventario
reproducible vive en `../legacy-inventory.generated.json` y el avance por
dominio se mantiene en `../migration-ledger.md`.

## Objetivo y criterio de avance

El objetivo no es solamente redirigir rutas a Next.js. Cada funcionalidad debe
avanzar explícitamente por estas compuertas:

1. **Inventariada:** ruta, estado, controlador, servicio, template,
   configuración, privilegios, traducciones y pruebas legacy localizados.
2. **Caracterizada:** reglas, endpoints, payloads, efectos posteriores,
   auditoría y errores relevantes documentados.
3. **Implementada:** conducta nativa en React 19/TypeScript, sin ejecutar
   AngularJS, React 16, HTML o JavaScript remoto.
4. **Contrato verificado:** lecturas y escrituras comparadas semánticamente con
   legacy mediante fixtures anonimizados.
5. **E2E verificada:** flujo ejercitado por Playwright en los modos y perfiles
   relevantes.
6. **Certificada:** paridad aceptada en HCSBA desarrollo con perfiles reales o
   pacientes sintéticos autorizados.
7. **Legacy retirado:** proxy, fallback y runtime heredado eliminados después
   de probar el rollback.

Una fila con proxy activo o E2E local no se considera certificada. No se retira
legacy mientras exista una acción que vuelva silenciosamente a AngularJS.

## Línea base de la fase 0

- AngularJS inventariado: **11 módulos y 67 estados de navegación**.
- Estados interceptados actualmente por rutas Next.js: **52/67 (77,6 %)**.
- Estados que continúan directamente en AngularJS: **15/67 (22,4 %)**.
- El alcance restante de migración a Next.js es de **11 estados**:
  **Administración (8)** y **Reportes (3)**.
- **Pabellón/OT (4)** se conserva en el inventario porque aún existe en
  AngularJS, pero queda fuera del alcance de migración: HCSBA ya dispone de un
  sistema institucional propio. Su destino será una integración externa
  explícita o el retiro del acceso legacy, según el contrato que se defina.
- `common` no expone estados propios, pero continúa como dependencia
  transversal de los módulos y fallbacks legacy.
- Accesos Home: **8 hacia Next.js**, **3 hacia AngularJS** y **3 hacia
  aplicaciones externas**.
- Consulta clínica es la única compuerta integral certificada: **14/14**.
- El dashboard clínico tiene **39/39 instancias trazadas**; Programas ya tiene
  gestión nativa y pruebas locales, mientras IPS e IPS ICVP quedan diferidos y
  ocultos como integraciones OpenHIM opt-in.

| Módulo inventariado | Estados | Enrutamiento actual |
|---|---:|---|
| `home` | 5 | Next.js mediante `NEXT_SHELL` |
| `registration` | 6 | Next.js mediante `NEXT_REGISTRATION` |
| `clinical` | 23 | Next.js mediante `NEXT_CLINICAL` |
| `adt` | 7 | Next.js mediante `NEXT_ADT` |
| `bedmanagement` | 6 | Next.js mediante `NEXT_BEDMANAGEMENT` |
| `document-upload` | 3 | Next.js mediante `NEXT_DOCUMENT_UPLOAD` |
| `orders` | 2 | Next.js mediante `NEXT_ORDERS` |
| **Subtotal interceptado** | **52** | **Next.js, con rollback** |
| `admin` | 8 | AngularJS fallback |
| `reports` | 3 | AngularJS fallback |
| `ot` | 4 | AngularJS inventariado; migración diferida en favor del sistema institucional de pabellón |
| **Subtotal legacy directo** | **15** | **AngularJS** |
| `common` | 0 | Dependencia compartida AngularJS |

Appointments no forma parte de los 67 estados AngularJS inventariados porque
su frontend original es una aplicación separada. La ruta nativa se publica
mediante `NEXT_APPOINTMENTS` y el frontend original se conserva como rollback.

Los accesos a Implementer Interface, Atomfeed Console, Lab Lite, la OWA de
administración de camas y `/person-management` se inventarían como aplicaciones
externas o auxiliares. No se deben contabilizar automáticamente como estados
AngularJS migrados, pero sí auditar antes de retirar el contenedor
`bahmni-web`.

## Fase 0 — Fuente de verdad y tablero ejecutable

### Acciones

- Regenerar `legacy-inventory.generated.json` desde el código legacy y la
  configuración HCSBA vigentes.
- Reconciliar `migration-ledger.md`, la matriz de 39 controles y sus
  manifiestos ejecutables con el código actual.
- Corregir estados obsoletos sin promocionar funcionalidades que aún no tengan
  evidencia HCSBA.
- Mantener un Issue por brecha concreta y enlazar su PR cuando el trabajo lo
  realice un colaborador.
- Separar los cambios de implementación de la activación de proxy para que el
  rollback sea granular.

### Salida y compuerta

- `npm run inventory:legacy:check` aprobado.
- `npm run audit:dashboard:functional` aprobado.
- Ninguna divergencia entre matriz, manifiesto, rutas y pruebas actuales.
- Todos los dominios con una siguiente acción y criterio de aceptación
  explícitos.

## Fase 1 — Cerrar el dashboard clínico

### Programas

- Mantener la gestión nativa de enrolamiento, estados, outcomes, atributos,
  finalización y anulación.
- Ejecutar `docs/programs-clinical-validation.md` con un paciente sintético
  autorizado.
- Comparar los resultados de los pasos de lectura y escritura en Next.js y
  legacy, sin registrar PHI.

### IPS/ICVP (diferidos)

- Ocultar `ipsReact` e `ipsIcvpReact` mientras
  `NEXT_PUBLIC_IPS_ENABLED=false`.
- Conservar código, configuración y overlay opt-in sin promover estas
  integraciones OpenHIM ni convertirlas en compuerta de esta fase.

### Resto del dashboard

- Ejecutar la matriz de 39 instancias con datos sintéticos representativos.
- Cubrir vacíos, error parcial, reintento, vistas expandidas, impresión,
  permisos, archivos y traducciones.
- Confirmar por red que no se cargan AngularJS, React 16, `react2angular` ni
  bundles legacy.

### Salida y compuerta

- **37 controles clínicos activos implementados, con contrato y E2E local**.
- **2 controles OpenHIM ocultos y diferidos** (`ipsReact`, `ipsIcvpReact`).
- Las brechas del backend compartido se registran sin atribuirlas al frontend;
  ninguna función se promueve a `Certificado HCSBA` sin evidencia clínica.

## Fase 2 — Certificar los módulos Next.js ya activos

Se ejecutarán campañas independientes para evitar que un dominio bloquee el
rollback de los demás.

### Campaña A: Home y autenticación

- Login OpenMRS y Keycloak, OTP, expiración, logout y cambio de contraseña.
- Restauración/cambio de ubicación, Provider y perfiles sin ubicación válida.
- Recarga, sesión expirada y retorno únicamente a URLs locales autorizadas.

### Campaña B: Registro

- Búsqueda, alta, edición, visita activa y nueva visita.
- Form2, segunda página, identificadores, relaciones y atributos dinámicos.
- Impresiones, privilegios y payloads dorados de paciente, visita, encuentro y
  observaciones.

### Campaña C: ADT, camas, Care View e IPD

- Paciente con cama, admitido sin cama, trasladado, dado de alta y pendiente de
  cierre de visita.
- Conflicto concurrente, read-back, escritura ambigua y sesión expirada.
- Equipo de cuidados, tareas, tratamientos uniformes/PRN y dosis variable por
  etapas.

### Campaña D: Documentos, Órdenes y Appointments

- Archivos nuevos/existentes, autoría, edición, void y conciliación.
- Órdenes, cumplimiento, archivos, impresión y errores previos/posteriores al
  commit.
- Agenda, recurrencias, conflictos, lista de espera, cambios de estado,
  proveedor, teleconsulta, impresión y administración de servicios.

### Compuerta común de certificación

- Contratos y payloads legacy/Next equivalentes.
- Playwright en Chromium, Firefox y Edge.
- Axe, teclado y 1366x768.
- Perfiles de privilegios representativos.
- Estados vacíos y errores HTTP relevantes.
- Build standalone, rollback y relectura posterior a cada escritura probados.

## Fase 3 — Migrar los módulos Angular que permanecen en alcance

La fase 3 cubre originalmente **11 estados**: Reportes (3) y Administración (8).
El dashboard de Administración y Audit Log ya disponen de implementación y
corte selectivo, por lo que quedan **9 estados** en esta fase: Reportes (3) y
Administración (6). Los cuatro
estados de Pabellón/OT permanecen contabilizados como deuda legacy hasta que
se sustituya su acceso, pero no se reimplementarán en Next.js.

### 1. Reportes

Migrar primero por ser predominantemente de lectura y tener sólo tres estados:
dashboard, reportes y mis reportes. Caracterizar parámetros, filtros,
ejecución, descarga, estados, errores y privilegios antes de implementar.

### 2. Administración

Dividir en entregas revisables: auditoría, importación CSV, exportación CSV,
exportación FHIR y conjuntos de órdenes. Mantener la OWA de camas fuera del
alcance hasta que se decida migrarla explícitamente. El dashboard visual y
Audit Log se migraron como primera entrega mediante `/bahmni/admin` y
`/bahmni/admin/audit-log`, con el define independiente
`NEXT_ADMIN_AUDIT_LOG`; las herramientas todavía legacy usan un alias aislado.
Su contrato y rollback están documentados en `admin-audit-log.md`.

### Pabellón/Operation Theatre — fuera de alcance y pendiente de integración

No portar la agenda quirúrgica, creación/edición de cirugías ni sus estados a
Next.js. HCSBA cuenta con un sistema propio de Pabellón y duplicar esa lógica
crearía dos fuentes operativas para un flujo clínico de alto riesgo.

Antes de retirar el acceso AngularJS se deberá caracterizar la integración con
el sistema institucional y acordar, como mínimo:

- URL o mecanismo de navegación y si requiere contexto de paciente o visita.
- SSO, cierre de sesión, perfiles y autorización.
- Datos que deben intercambiarse, autoridad de cada sistema y auditoría.
- Comportamiento cuando el sistema externo no está disponible.
- Switch de configuración y rollback independientes.

Hasta entonces el acceso OT legacy debe quedar oculto o conservarse como
fallback controlado según la decisión operativa; nunca se marcará como migrado
por el solo hecho de ocultarlo.

Reportes y Administración deben llegar a certificación y disponer de un
define de proxy independiente antes del corte.

## Fase 4 — Retiro del runtime legacy

- Auditar `/person-management`, aplicaciones externas y recursos aún servidos
  por `bahmni-web`.
- Sustituir el acceso legacy de Pabellón/OT por la integración institucional o
  demostrar que puede retirarse sin consumidores antes de apagar
  `bahmni-web`.
- Retirar dependencias de `common`, jQuery, React 16, `react2angular`, templates
  y bundles legacy.
- Eliminar el fallback general de `/bahmni` sólo después de demostrar que no
  quedan consumidores.
- Conservar una imagen/versionado de rollback durante la ventana de
  observación; no eliminar datos, volúmenes ni configuración clínica.
- Retirar finalmente el contenedor `bahmni-web`.

## Orden de entrega

1. Inventario y matrices actualizados.
2. Programas cerrado en frontend; IPS e IPS ICVP ocultos y diferidos.
3. Campañas de certificación de módulos Next.js activos.
4. Reportes.
5. Administración.
6. Definición e implementación del acceso al sistema institucional de
   Pabellón/OT, sin reimplementar su dominio clínico.
7. Retiro de `common`, fallback y contenedor legacy.

## Regla operativa para cada entrega

- Caracterizar legacy antes de modificar.
- No inventar endpoints, privilegios ni reglas clínicas.
- No crear BFF clínico en Next.js ni cambiar OpenMRS para simplificar el
  frontend.
- Mantener same-origin, `credentials: "include"`, `JSESSIONID`, ubicación,
  proveedor, zona horaria y auditoría.
- No reintentar automáticamente escrituras ambiguas.
- Ejecutar lint, typecheck, unitarios, build y Playwright proporcional al
  cambio; ejecutar la suite completa antes de un corte.
- Documentar la regla descubierta y actualizar la matriz en la misma entrega.

## Registro de ejecución

### 17-08-2026 — Fase 0

- Inventario legacy regenerado: 11 módulos, 67 estados, 293 specs, 98
  constantes de endpoint, 25 privilegios y 183 archivos de traducción.
- Matriz del dashboard reconciliada: 39/39 trazadas, 37 implementadas y 2
  parciales (`ipsReact`, `ipsIcvpReact`).
- Programas promovido únicamente a **Implementado/Contrato/E2E local**; su
  certificación HCSBA continúa bloqueada por los pasos clínicos 2--7.
- All Orders reconciliado como implementación React 19 completa con
  certificación HCSBA pendiente.
- Ledger, Auth/Keycloak e IPD actualizados para eliminar estados documentales
  obsoletos.
- Compuertas aprobadas: inventario, auditoría funcional y auditoría de runtime.
- Verificación aprobada: lint sin errores, TypeScript, 470 unitarios, build
  standalone y Programas en Chromium/Firefox/Edge.

Con la línea base reconciliada, se abrió la Fase 1 con la certificación clínica
de Programas y el cierre técnico de IPS/IPS ICVP.

### 17-08-2026 — Fase 1 cerrada (alcance frontend)

- Contrato IPS/ICVP legacy caracterizado, incluyendo ITI-67/68, VHL, ICVP,
  cámara y decodificación HC1 local.
- Cámara y previsualización ICVP implementadas nativamente en React 19; la UI
  declara que la previsualización no verifica la firma COSE.
- Mediador HCSBA implementado como servicio independiente: valida sesión y
  privilegio OpenMRS, limita rutas/métodos, protege escrituras por origen y
  mantiene las credenciales técnicas fuera del navegador.
- Overlay, proxy, secretos Docker, healthcheck y switch opt-in preparados. El
  ambiente existente permanece en `IPS_MEDIATOR_ENABLED=false`.
- Contratos Go, TypeScript y seguridad local aprobados; la activación contra
  el upstream requiere credenciales técnicas rotadas.
- Se creó un fixture `SYN-*` autorizado y se intentó el enrolamiento en
  `TB Program` desde Next.js y desde AngularJS legacy. Ambos clientes recibieron
  HTTP 500 y dejaron cero enrolamientos activos o históricos.
- El contrato de enrolamiento y atributos coincide con legacy; la
  certificación clínica de Programas queda retenida por el backend compartido
  hasta que el enrolamiento inicial funcione y puedan ejecutarse los pasos
  reversibles 3--7.
- Por decisión de producto, IPS/ICVP se difieren. Ambos controles quedan
  ocultos en dashboard y visita mientras `NEXT_PUBLIC_IPS_ENABLED=false`, sin
  eliminar su implementación ni su overlay opt-in.

La fase 1 queda cerrada para el alcance frontend: 37 controles clínicos
activos y dos integraciones OpenHIM dormantes. Esto no equivale a certificar
Programas en HCSBA ni autoriza retirar el fallback clínico completo.

- Compuertas finales aprobadas: inventario legacy, auditoría funcional 39/39,
  auditoría de runtime (519 archivos, cero runtimes prohibidos), lint sin
  errores, TypeScript, 479 unitarios y build standalone.
- Programas aprobado en Chromium, Firefox y Edge; verificación Docker
  same-origin aprobada en ocho rutas y runtime DEV confirmado con
  `integrations.ips.enabled=false`.

### 18-08-2026 — Fase 2 iniciada: campaña A

- Se cerró la brecha del cambio de contraseña: acceso desde la cabecera sólo
  en modo OpenMRS, políticas leídas del endpoint Bahmni y payload de escritura
  idéntico a legacy. En modo Keycloak no se expone una acción de contraseña
  OpenMRS.
- Se añadió evidencia local del recorrido OTP → Provider → selección de
  ubicación, expiración con retorno interno y cambio de contraseña, incluida
  accesibilidad Axe.
- La campaña A pasa contrato y E2E local en Chromium, Firefox y Edge. La
  certificación HCSBA queda deliberadamente pendiente de perfiles sintéticos,
  expiración real y MFA/revocación Keycloak; el stack SSO permanece apagado en
  desarrollo liviano.

### 18-08-2026 — Fase 2 cerrada en alcance frontend/local

- Las campañas A, B, C y D aprobaron contratos, unitarios, build standalone y
  Playwright en Chromium, Firefox y Edge.
- Registro añadió una prueba de alta que valida el sobre `patient/person`, el
  identificador generado y `Jump-Accepted` sin persistir datos reales.
- IPD dejó de probar el antiguo dashboard de Bed Management y ahora valida las
  seis secciones configuradas en `ipdDashboard/app.json`. Transferencia y alta
  conservan `visitUuid` para evitar escrituras sobre una visita ambigua.
- Documentos, Órdenes y Appointments cubren escritura, conciliación y fallos
  pre/post-commit en 15 recorridos E2E locales.
- La prueba Keycloak se separó por `runtime-config`; la matriz OpenMRS ya no
  interpreta como fallo una build que deliberadamente tiene SSO apagado.
- La compuerta reproducible vive en `phase2-gate.json` y se consulta con
  `npm run certification:phase2`. `npm run gate:phase2` exige el cierre local.

La fase 2 queda lista para la campaña institucional, no certificada en HCSBA.
`npm run gate:phase2:hcsba` continuará fallando hasta completar los cinco
criterios reales documentados: perfiles de autenticación, Registro reversible,
IPD reversible, integraciones institucionales y privilegios representativos.
No se retira ningún fallback legacy por este cierre local.

### 18-08-2026 — Alcance de la fase 3 ajustado

- La migración activa de la fase 3 se reduce a **11 estados**: Reportes (3) y
  Administración (8).
- Pabellón/OT no se reimplementará en Next.js porque HCSBA dispone de un
  sistema institucional propio para ese dominio.
- Sus cuatro estados continúan visibles en el inventario como deuda legacy
  hasta definir y validar la navegación, SSO, contexto, auditoría, fallos y
  rollback de la integración externa, o aprobar su retiro sin reemplazo.
- Esta decisión evita declarar OT como migrado por ocultamiento y queda como
  condición explícita antes de retirar `bahmni-web`.
