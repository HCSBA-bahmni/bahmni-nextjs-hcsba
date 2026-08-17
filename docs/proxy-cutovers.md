# Interruptores de corte por módulo

Los recursos compartidos `/bahmni/_next`, `/bahmni/api` y `/bahmni/i18n` deben resolverse siempre contra `bahmni-next-web` y declararse antes del fallback general `/bahmni`. El último prefijo contiene los bundles de locale y los overlays de Form Builder por UUID.

El proxy usa definiciones Apache declaradas en `NEXT_PROXY_DEFINES`. El valor activo en el ambiente local de certificación desde 2026-08-07 es:

```text
-D NEXT_SHELL -D NEXT_REGISTRATION -D NEXT_CLINICAL -D NEXT_BEDMANAGEMENT
```

### Gestión de Camas / IPD

- Define: `NEXT_BEDMANAGEMENT`.
- Prefijo: `/bahmni/bedmanagement`.
- Rollback: retirar únicamente `-D NEXT_BEDMANAGEMENT` de `NEXT_PROXY_DEFINES` y recrear el servicio proxy.
- La OWA administrativa de layouts y admission locations no cambia.
- El corte local está activo para certificación contra `.205`; todavía no equivale a aprobación clínica de producción.

- `NEXT_SHELL`: login, ubicación, Home, cambio de contraseña y logout.
- `NEXT_REGISTRATION`: búsqueda, alta/edición, visita y segunda página de Registro.
- `NEXT_APPOINTMENTS`: operación de Agenda en `/bahmni/appointments`; `/appointments` conserva la administración y el respaldo original. Sin el define, la ruta Next redirige al módulo original.
- `NEXT_ORDERS`: búsqueda y cumplimiento de órdenes en `/bahmni/orders`; al retirar el define, el fallback general conserva el módulo AngularJS en la misma ruta.
- `/bahmni/_next` y `/bahmni/api` permanecen siempre en Next.js mientras exista cualquier módulo migrado.
- Las rutas sin interruptor continúan en `bahmni-web` por el fallback `/bahmni`.

Para rollback de Registro se elimina solamente `-D NEXT_REGISTRATION` de `.env` y se recrea `proxy`. No se reinicia OpenMRS, no se modifica la base de datos y el contenedor Next puede seguir levantado. Cada módulo futuro añadirá su propia sección `<IfDefine NEXT_…>` antes del fallback.

Para rollback de Agenda se elimina solamente `-D NEXT_APPOINTMENTS` y se recrea `proxy`. El acceso de Home seguirá funcionando porque Apache redirige `/bahmni/appointments` a `/appointments/`.

Para rollback de Órdenes se elimina solamente `-D NEXT_ORDERS` y se recrea `proxy`. La configuración de Home no cambia: el mismo enlace volverá a resolverse mediante el fallback legacy.
