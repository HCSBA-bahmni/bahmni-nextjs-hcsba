# Marca visible HIS HCSBA

El 2026-10-23 se reemplazó la marca visible Bahmni por **HIS HCSBA** en el
frontend Next.js, por solicitud del usuario.

- Encabezado compartido y nombre accesible del enlace a Inicio.
- Acceso OpenMRS y acceso mediante Keycloak.
- Portada de Administración y descripción/error de Auditoría.
- Título de pestaña y metadato `application-name` globales.
- Mensaje de tipo de encuentro clínico sin exponer el nombre de la propiedad
  técnica de configuración.

Se conservan los contratos de integración: `/bahmni`, `/bahmni_config`, cookies,
permisos, namespaces de formularios, endpoints y nombres internos. Los repositorios
legacy siguen como referencia y rollback; este cambio corresponde al frontend
Next.js activo. El logo configurado en el acceso ya corresponde al Hospital
Clínico San Borja Arriarán.

## Verificación

- Lint: sin errores; dos advertencias previas sobre imágenes en otros componentes.
- Typecheck: correcto.
- Unitarios de `services/bahmni/consultation.test.ts`: cuatro correctos.
- Build standalone: correcto con `npm run build -- --webpack`, en copia temporal
  dentro del contenedor, sin alterar `.next` ni reiniciar el servidor de desarrollo.
  Turbopack rechazó el enlace a las dependencias compartidas de esa copia temporal.
- `dev-environment.ps1 verify`: correcto, incluido WebSocket de Fast Refresh.
- Playwright Chromium: cinco de seis pruebas existentes de acceso y Auditoría
  correctas. La prueba de portada de Administración espera un H1, mientras que
  el código anterior y el actual usan H2; discrepancia previa ajena a la marca.
- Comprobación adicional con Playwright y respuestas sintéticas en acceso,
  Administración y error de Auditoría: título `HIS HCSBA`, marca nueva visible y
  ausencia de Bahmni en el texto de la página. Sin escrituras clínicas.
- Revisión de literales de texto y JSX en `src`: sin referencias textuales de
  marca pendientes. Los identificadores técnicos se mantienen.

Capturas locales: `F:/Proyectos/HIS/outputs/his-hcsba-branding-20261023/`.
Disponible por Fast Refresh en `https://localhost`.

## Entrega en `.225` (2026-10-23)

Publicado `hcsba/bahmni-next-web:2026.10.23-his-hcsba.1` en
`https://10.68.174.225`, desde el commit local `81d1a218` más los cambios de marca.
Imagen cargada: `sha256:373ee8c295c621cf88cbfb02b5620ffc6aac85d2ced35dcfefb78a047eec97db`.
El Dockerfile completo compiló con Turbopack y configuración pública de destino:
autenticación OpenMRS, consulta clínica habilitada y MPI integrado.

Se recreó únicamente `bahmni-next-web`; los demás contenedores del proyecto
conservaron sus IDs y el frontend quedó `healthy`. Se verificó HTTP 200 en salud
de Next, biometría, Registro, Administración, Auditoría y Camas. La suite completa
local pasó: 633 pruebas. Diez E2E Chromium de acceso, Auditoría y perfiles pasaron
contra el frontend remoto con respuestas sintéticas. Se excluyó la discrepancia
H1/H2 previa descrita arriba.

Además se verificó el acceso real con la cuenta demo existente, la selección de
ubicación y la portada: marca y título `HIS HCSBA`, sin Bahmni visible. Se cerró la
sesión de verificación; no se escribieron datos clínicos. Capturas locales en
`F:/Proyectos/HIS/outputs/his-hcsba-branding-20261023/remote225/`.

La imagen anterior `2026.10.21-patient-trace.2` permanece disponible. Respaldo privado
de `.env` y overlay Compose en el host:
`/home/arki/bahmni/bahmni-docker-HCSBA/bahmni-standard/production-225/releases/2026.10.23-his-hcsba.1/`.
Para reversa, restaurar `environment.before` y
`docker-compose.mpi-admission.yml.before` a sus rutas originales, validar la misma
composición y recrear sólo `bahmni-next-web` con `--no-deps --no-build --pull never`.
El checkout fuente remoto y sus cambios locales se preservaron.
