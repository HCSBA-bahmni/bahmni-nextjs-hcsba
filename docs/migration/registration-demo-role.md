# Demo con acceso a Registro

## Fuente de verdad

Bahmni usa los privilegios efectivos de OpenMRS para resolver `requiredPrivilege`.
El frontend no concede acceso por el nombre de un rol. OpenMRS incluye los
privilegios heredados en `user.privileges`; no hay que reconstruir la jerarquía en Next.

Referencias contrastadas el 2026-10-06:

- [Filtro oficial de extensiones](https://github.com/Bahmni/openmrs-module-bahmniapps/blob/master/ui/app/common/app-framework/models/appDescriptor.js): compara el privilegio, descarta los retirados y respeta el punto de extensión.
- [Roles oficiales de Bahmni Core](https://github.com/Bahmni/bahmni-core/blob/master/bahmnicore-omod/src/main/resources/V1_96_NewRolesAndPrivileges.sql): `Registration-App` hereda `Registration-App-Read-Only`, que hereda `Bahmni-App-User-Login`.
- [Configuración oficial de usuarios](https://bahmni.atlassian.net/wiki/spaces/BAH/pages/34013682/Configure+Users): los usuarios y proveedores se administran en OpenMRS.
- El fork local conserva el filtro en `ui/app/common/app-framework/models/appDescriptor.js` y exige `app:registration` en `ui/app/registration/initialization.js`.

`FrontDesk` no es un perfil de solo Registro: en nuestro CSV hereda `Lab` y
`Appointments:FullAccess`, y añade `app:patient-documents`, `app:appointments` y
`app:reports`. Cambiarlo afectaría a los usuarios existentes.

## Perfil preparado

`standard-config-HCSBA/masterdata/configuration/roles/roles.csv` añade
`HCSBA-Registro-Demo`, que hereda el rol oficial `Registration-App` y añade:

| Privilegio | Uso |
| --- | --- |
| `Get Concept Sources` | Metadatos utilizados por Registro HCSBA, ya presentes en FrontDesk |
| `Get Care Settings` | Metadatos auxiliares del flujo existente |
| `Add Observations`, `Edit Observations` | Observaciones de la segunda página de Registro |
| `app:common:closeVisit` | Acción de cierre de visita de Registro |

Su único privilegio de acceso a una aplicación es `app:registration`, heredado de
`Registration-App`. Este rol también hereda `Add Patients`, requerido por el
gateway MPI local. El subprivilegio `app:common:closeVisit` no crea otro menú.

El rol de login oficial incluye `Edit Users`, `Get Users` y `Get Providers`.
Se conserva esa herencia para mantener el contrato de login y guardado de locale;
este perfil restringe los menús, no establece un modo de demostración de solo lectura.

## Crear la cuenta

El CSV es una definición local. Servirlo desde `bahmni-config` no importa roles en
el OpenMRS compartido `.205`. Tampoco un reinicio del frontend crea usuarios.
Antes de usar la cuenta, un administrador debe crear o importar el rol en el
OpenMRS del ambiente elegido y comprobar su herencia efectiva.

1. Abrir `https://localhost/openmrs/admin/index.htm` con un administrador del ambiente de desarrollo. El proxy local usa `.205`.
2. En **Manage Roles**, crear `HCSBA-Registro-Demo`, heredar únicamente `Registration-App` y agregar los cinco privilegios de la tabla. Si el rol ya existe, revisar su definición antes de modificarlo.
3. En **Manage Users**, crear una persona de prueba y un usuario, por ejemplo `demo.registro`, con una contraseña que cumpla la política del ambiente. Asignar únicamente `HCSBA-Registro-Demo`; OpenMRS añade sus roles implícitos. Revisar que estos y sus ancestros no concedan otras aplicaciones.
4. Crear un proveedor activo asociado a la misma persona. La autenticación Next y legacy exige un proveedor; el objeto proveedor es independiente del rol llamado `Provider`.
5. Configurar una ubicación de login autorizada si se quiere restringir el puesto de Registro.
6. Mantener el flujo OTP vigente; este perfil no añade `bypass2FA`.
7. Cerrar la sesión anterior y entrar con la cuenta nueva para recargar los privilegios efectivos.

## Resultado esperado y pruebas

- Inicio muestra una sola tarjeta: **Registro**.
- La navegación principal conserva **Inicio** y **Registro**; también quedan disponibles las acciones de sesión y ubicación.
- No aparecen Clínico, Citas ni Camas. La URL directa de Clínico muestra el aviso de falta de `app:clinical` y no su buscador.
- Un privilegio retirado, tanto booleano `true` como texto `"true"`, no concede acceso en `hasPrivilege`.

`AppShell.test.tsx` y `auth.helpers.test.ts` cubren permisos, roles, privilegios
retirados y cuatro perfiles. `e2e/registration-role.spec.ts` usa la configuración
home realmente servida por el entorno local, con sesión, usuario y proveedor
sintéticos, sin escribir usuarios ni datos clínicos en `.205`. Incluye entrada a
Registro, recarga y denegación de Clínico por URL.

## Cuenta real creada en desarrollo

El 2026-10-06 se creó `demo.registro` en el OpenMRS de desarrollo `.205` mediante
el proxy `https://localhost/openmrs`, usando el acceso administrativo facilitado
por el usuario. También se creó el rol `HCSBA-Registro-Demo` y un proveedor activo
`DEMO-REGISTRO - Demo Registro`, asociado a la misma persona de prueba y con
`Registration Desk` como única ubicación de login asignada.

Se comprobó la autenticación real HTTP 200 con `authenticated: true` y que los
privilegios efectivos de aplicación son únicamente `app:registration` y el
subprivilegio de cierre `app:common:closeVisit`. Los roles oficiales y los usuarios
existentes no fueron modificados. No se añadió `bypass2FA`.

Se inició sesión con la cuenta real desde el navegador en `https://localhost`,
se seleccionó `Registration Desk` y se verificó una sola tarjeta **Registro** en
Inicio y los enlaces **Inicio / Registro** en la navegación. Las lecturas de
proveedor, tipos de identificadores, atributos de persona, tipos de relación y
jerarquía de direcciones respondieron HTTP 200 bajo esta cuenta.

Las credenciales y los UUID de la cuenta se guardan en
`bahmni-docker-HCSBA/.local/development-access.json`, excluido de Git. El usuario
confirmó que todos los ambientes actuales, incluido el remoto, son desarrollo;
este contexto se conserva en `AGENTS.md` en la raíz del workspace y en `DEV_MODE.md`.

Esta comprobación de autenticación y menús no certifica un alta clínica MPI
completa; esa operación no se ejecuta para verificar una cuenta de demo.

## Verificación del remoto `.225`

El 2026-10-06 se desplegó `hcsba/bahmni-next-web:2026.10.06-registro.1` en
`https://10.68.174.225`, conservando la integración MPI. La cuenta demo ya existe
y autentica en ese origen. Se verificó desde el navegador con la cuenta real:
ubicación `Registration Desk`, una tarjeta **Registro** en Inicio, navegación
**Inicio / Registro** y entrada a **Registro de pacientes**.
La opción **Nuevo paciente** carga **Verificación de identidad MPI** y su búsqueda
por RUN con la misma cuenta, sin ejecutar un alta ni una consulta de identidad.

Las 15 pruebas de `e2e/registration-role.spec.ts` pasaron también contra la imagen
remota en Chromium, Firefox y Edge. Para esas pruebas se simulan exclusivamente
las respuestas de sesión, usuario, proveedor y metadatos OpenMRS; se consume
la configuración home y el frontend desplegados. Incluyen rechazo de la ruta
Clínico y privilegios retirados. No se crearon pacientes para estas verificaciones.

Acceso de pruebas: `https://10.68.174.225/bahmni/login`; entrada directa al módulo:
`https://10.68.174.225/bahmni/registration`. Las credenciales permanecen en el
archivo local ignorado ya indicado. El respaldo y el procedimiento de reversa
están en `bahmni-docker-HCSBA/bahmni-standard/production-225/README.md`.

## Perfiles MPI con separación de funciones (2026-10-19)

El flujo nuevo utiliza **HCSBA-MPI-Admision** y **HCSBA-MPI-Gestor**, sin modificar `HCSBA-Registro-Demo`. El primer rol declara explícitamente los privilegios de Registro y no hereda `Edit Users`, administración de roles ni eliminación de visitas. El gestor hereda ese rol y añade **Manage MPI Identity Reviews**. No se añadió bypass de segundo factor.

Next guarda la preferencia de idioma localmente cuando el usuario carece de `Edit Users`, evitando necesitar administración de cuentas para ingresar. El permiso gestor se comprueba también en el gateway y mediador, no sólo al mostrar enlaces.

Cuentas sintéticas verificadas en navegador `.225`: `demo.mpi.admision` y `demo.mpi.gestor`; proveedor activo y puesto `Registration Desk`. El mismo UUID y credencial autentica por el proxy local hacia `.205`; las referencias privadas de ambos accesos se guardan en `.local/development-access.json` sin publicar contraseñas. Las definiciones de privilegio/roles quedan en los CSV correspondientes de `standard-config-HCSBA`; servir esos CSV no reemplaza su provisión en OpenMRS.

Admisión guarda y envía alertas, sin resolver candidatos. El gestor utiliza `/bahmni/registration/reviews` con motivo/evidencia, manteniendo pendiente o resolviendo mediante OpenCR. Ver el [contrato vigente](mpi-admission.md).

### Ensayo personal y lectura de formularios

El 2026-10-19 se verificó que `Registration Details` estaba publicado pero el perfil dedicado carecía de **Get Forms**: su definición respondía 403 aunque la lista de formularios era visible. Se agregó únicamente ese permiso de lectura a `HCSBA-MPI-Admision`, heredado por el gestor, sin `Edit Users` ni acceso clínico adicional. La lectura real de la definición (incluido Weight) quedó verificada con ambas cuentas en `.225`. La definición CSV y el aprovisionador de los perfiles conservan ese permiso. Volver a iniciar sesión después del cambio.

Se preparó por elección explícita del usuario una pareja nueva, sin visitas, encuentros ni revisiones: `HCSBA100009` / `HCSBA100010`, nombre sintético `ENSAYO UNIFICACIONMANUAL`. La primera tiene pasaporte; la segunda otro pasaporte y RUN de ensayo `99000228-2`, preparado sólo en MPI local. El usuario realizará las atenciones, propondrá el RUN en la primera ficha y resolverá/consolidará/separará desde la bandeja. No recrear esa segunda ficha desde Nuevo paciente ni consultar el RUN sintético al MPI nacional.

Estado sin credenciales: `F:/Proyectos/HIS/analisis/2026-10-19/validacion-visual-mpi/manual-test-fixture.json`. Guía privada solicitada con las dos credenciales demo: `bahmni-docker-HCSBA/.local/manual-mpi/guia-prueba-personal-mpi.html`, excluida de Git. No copiarla a la galería compartible. Peso desde Registro permite el ensayo con los perfiles disponibles; alergias requieren un perfil clínico. La vista **Reciente** presenta el último valor por concepto y no es un visor de toda la historia.
