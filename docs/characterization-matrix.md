# Matriz de caracterización v1

| Dominio | Contrato Angular/HCSBA observado | Implementación Next v1 | Estado de certificación |
|---|---|---|---|
| Sesión | `GET/DELETE /ws/rest/v1/session`, `JSESSIONID`, limpieza 401 y retorno por proveedor | Cliente directo, `credentials: include`, redirección global 401, logout y contexto recordado | Unitario + E2E Chromium; pendiente expiración real HCSBA |
| Login/OTP | Basic `usuario:clave[:otp]`, 204/401/410/429, `resendOTP`, proveedor activo, locale y whitelist | Mismo header, estados explícitos, proveedor obligatorio, preferencia de locale y retorno seguro | Unitario + E2E sin OTP; pendiente usuario OTP de prueba |
| Ubicación | Login Locations, atributos de proveedor, cookie `{uuid,name}` y `POST /session` | Restaura solo una ubicación aún permitida; si no, selección explícita | Unitario + E2E Chromium; pendiente atributos de proveedor reales |
| Home | `home/extension.json`, orden, online, privilegio | Merge standard/implementation y filtro de privilegios | Unitario; pendiente 3 perfiles |
| Paciente | `bahmnicore/patientprofile` | Envelope patient/person, `Jump-Accepted` | Mapper unitario; comparar fixture real |
| Búsqueda | `bahmni/search/patient` | Filtros URL, paginación | Pendiente fixture HCSBA anonimizado |
| Visita | REST visit + `bahmnicore/visit/endVisit` | Guardar separado de iniciar; acción por visita activa, mapping por ubicación y cierre protegido ante admisión | Unitario; pendiente fixture HCSBA |
| Segunda página Registro | Form 2 publicado, `bahmniencounter/find`, encuentro `REG`, observaciones con namespace/path | Renderer React tipado, adaptador IMC conocido, payload directo y auditoría | Automatizado local; pendiente payload dorado |
| Impresión | 4 `templateUrl` HCSBA | Registro cerrado de 4 componentes React | Local; pendiente comparación visual |
| Legacy | Hash routes y módulos AngularJS | Bridges hash → rutas limpias, enlaces full-page | Unitario |

## Trazabilidad automatizada

- `legacy-inventory.generated.json` contiene los 293 specs legacy, sin duplicados y con suite TypeScript objetivo.
- `workflow.test.ts` caracteriza la precedencia de `patient.next`, visita activa, inicio y forwards por tipo.
- `form2.test.ts` caracteriza el wire format de observaciones y verifica que ningún script configurado se ejecuta.
- La suite actual ejecuta 219 pruebas unitarias/contrato en 54 archivos y mantiene los escenarios Playwright para certificación de ambiente.
- Los 31 specs legacy directamente relacionados con dashboard tienen trazabilidad individual en `clinical-dashboard-test-trace.md`: 19 cubiertos y 12 parciales, ninguno sin destino.

## Precedencia

Al reconciliar diferencias se aplica: ambiente HCSBA desarrollo, remoto HCSBA y copia local. No se almacenan respuestas reales sin anonimización y nunca credenciales ni PHI.
