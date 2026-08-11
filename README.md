# bahmni-nextjs-hcsba

Frontend HCSBA basado en Next.js 16 Pages Router. Su objetivo es sustituir completamente `bahmni-web` sin modificar OpenMRS, Bahmni Core, FHIR ni `standard-config`. La transición se realiza por módulos y conserva `JSESSIONID` y rollback por proxy hasta retirar AngularJS del runtime.

## Desarrollo

Requiere Node.js 24 LTS.

```bash
npm ci
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
```

El sitio se sirve bajo `/bahmni`. El navegador consume `/openmrs`, `/bahmni_config` e `/implementation_config` con cookies incluidas. Las únicas APIs propias son `/bahmni/api/health` y `/bahmni/api/runtime-config`.

## Estado actual del RC

- Sesión, login, OTP, reenvío, ubicación, cambio de contraseña y logout.
- Dashboard por `extension.json` y privilegios.
- Búsqueda y alta/edición de pacientes, identificador, dirección, foto y atributos tipados.
- Flujo de Registro separado: guardar, iniciar/ingresar a visita, cierre y forwards configurables.
- Segunda página `Registration Details` con Form 2 React tipado, encuentro `REG` y observaciones compatibles.
- Cuatro adaptadores React de impresión y rechazo seguro de templates desconocidos.
- Compatibilidad de bookmarks con hash.
- Dashboard clínico configurado con registro explícito de controles, formularios React 19, órdenes, laboratorio, radiología, GES, citas, tendencias e integraciones IPS/ICVP protegidas por mediador same-origin.

La certificación con datos reales requiere usuarios y pacientes sintéticos de HCSBA. El contrato de autenticación está en [docs/migration/auth-session-location.md](docs/migration/auth-session-location.md), el estado transversal en [docs/migration-ledger.md](docs/migration-ledger.md), la evidencia v1 en [docs/characterization-matrix.md](docs/characterization-matrix.md), los cortes en [docs/proxy-cutovers.md](docs/proxy-cutovers.md) y el inventario completo se genera con `npm run inventory:legacy`.

## Imagen y rollback

Construir `hcsba/bahmni-next-web:0.1.0-rc.0`. Producción debe promover el mismo digest con tag semántico, nunca `latest`. El rollback consiste en quitar las reglas específicas Next del proxy; no existen migraciones de datos.
