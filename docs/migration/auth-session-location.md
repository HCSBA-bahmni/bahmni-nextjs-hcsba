# Login, sesión y ubicación

## Fuente legacy caracterizada

La paridad se obtuvo de `home/controllers/loginController.js`, `loginLocationController.js`, `common/auth/authentication.js`, `userService.js`, `locationService.js` y sus specs AngularJS.

OpenMRS sigue siendo la autoridad de la sesión clínica que consume el frontend. El navegador conserva `JSESSIONID` y llama directamente a `/openmrs` con `credentials: "include"`; no existe una sesión paralela de Next.js ni se almacenan access/refresh tokens en el navegador. La identidad humana puede obtenerse por dos modos parametrizados:

- `NEXT_PUBLIC_AUTH_MODE=openmrs` mantiene usuario, contraseña y OTP legacy.
- `NEXT_PUBLIC_AUTH_MODE=keycloak` redirige a `/openmrs/oauth2login`; el módulo OAuth2 de OpenMRS valida OIDC, sincroniza el usuario y crea la misma sesión `JSESSIONID` utilizada por Next.js y legacy.

## Flujo implementado

1. `GET /ws/rest/v1/session?v=custom:(uuid)` valida una sesión existente en ambos modos.
2. En modo `openmrs`, el login usa Basic `usuario:clave[:otp]`. El segundo factor aparece exclusivamente cuando OpenMRS responde `204` al primer intento; tanto un `401` como la respuesta core `200 {"authenticated":false}` significan credenciales incorrectas y no activan OTP. Tras solicitar OTP, conserva los contratos `401` (código inválido), `410`, `429` y `resendOTP=true`.
3. En modo `keycloak`, `/bahmni/login` conserva únicamente un `returnUrl` local en `sessionStorage`, evita redirecciones OIDC duplicadas durante 60 segundos y navega de página completa a `/openmrs/oauth2login`. Al volver no interpreta tokens: relee `/ws/rest/v1/session` y continúa con el mismo flujo de Provider y ubicación.
4. Tras autenticar se cargan el usuario completo y el primer proveedor no retirado. Sin proveedor activo se elimina la sesión, como en legacy.
5. Las ubicaciones se obtienen por tag `Login Location`. Si el proveedor tiene atributos `Login Locations`, estos restringen la lista y se escriben también en `localStorage.loginLocations` para convivencia con AngularJS.
6. La última `bahmni.user.location` se reutiliza solo si continúa habilitada. La restauración ejecuta `POST /ws/rest/v1/session` con `sessionLocation` y locale; no es solo estado local.
7. Si la ubicación guardada falta, está dañada o dejó de estar asignada, se elimina y se muestra `/location`.
8. Un `401` global limpia identidad/proveedor, conserva la ubicación recordada y vuelve a `/login` con la ruta interna de retorno.
9. El logout audita, recuerda temporalmente la ruta por UUID de proveedor cuando `bahmni.contextCookieExpirationTimeInMinutes` lo habilita, destruye la sesión OpenMRS y conserva la última ubicación durante siete días. En modo `keycloak` limpia primero el estado local, aborta solicitudes Bahmni pendientes, invalida OpenMRS y navega a la URL de logout OIDC devuelta por el servidor o a `/openmrs/oauth2logout`.

## Compatibilidad de estado

| Estado | Contrato |
|---|---|
| `JSESSIONID` | Sesión OpenMRS; nunca se reemplaza por token Next. Se conserva el workaround legacy que elimina únicamente un `JSESSIONID` erróneo con path `/`. |
| `bahmni.user` | Nombre de usuario como texto, no JSON, para compatibilidad con módulos legacy. |
| `bahmni.user.location` | JSON `{ uuid, name }`, path `/`, siete días. |
| `bahmni.locale` / `NG_TRANSLATE_LANG_KEY` | Locale seleccionado; además se guarda `userProperties.defaultLocale`. |
| `loginLocations` | Ubicaciones asignadas al proveedor para módulos AngularJS aún activos. |
| cookie `<providerUuid>` | Ruta recordada hasta la expiración configurada por OpenMRS. |

Los retornos externos del parámetro legacy `from` o de `returnUrl` solo se aceptan si coinciden con `home/login_config.json.whiteListedDomains`; los retornos internos se normalizan al `basePath` de Next.

## Decisión sobre Auth.js y Keycloak

No se incorporó Auth.js. Envolver `JSESSIONID` en otra cookie produciría dos tiempos de expiración, dos mecanismos de logout y riesgo de mostrar una sesión Next válida cuando OpenMRS ya respondió `401`. La integración Keycloak mantiene una sola sesión clínica porque OIDC termina en OpenMRS y Next.js continúa confiando exclusivamente en `JSESSIONID`.

## Evidencia automatizada

- Unitarios de cookies legacy, proveedor activo/retirado, asignaciones y restauración mediante `POST /session`.
- Playwright de credenciales, accesibilidad, selección obligatoria sin contexto, omisión de `/location` con una ubicación guardada válida y retorno posterior al logout Keycloak sin recrear inmediatamente la sesión SSO.
- Lint, TypeScript estricto, suite completa y build standalone.

La certificación final sigue requiriendo usuarios HCSBA sintéticos con y sin atributos de ubicación, un usuario OTP en modo `openmrs`, expiración real de `JSESSIONID` y una campaña Keycloak completa de login, logout global, TOTP, código de recuperación y revocación de sesión administrativa.
