# Despliegue seguro de IPS e IPS ICVP

## Contrato migrado

Los controles `ipsReact` e `ipsIcvpReact` conservan los contratos legacy de
consulta ITI-67, apertura ITI-68, emisión/resolución VHL y generación ICVP.
La diferencia deliberada es de seguridad: Next.js nunca conoce la URL privada
ni las credenciales técnicas del upstream.

El navegador usa únicamente estas rutas same-origin:

- `/openmrs/ips-mediator/regional`
- `/openmrs/ips-mediator/vhl/_generate`
- `/openmrs/ips-mediator/vhl/_resolve`
- `/openmrs/ips-mediator/icvpcert/_from-bundle`

El prefijo `/openmrs` permite que el navegador aplique la cookie OpenMRS con
su alcance original. El gateway valida esa `JSESSIONID` contra la sesión
OpenMRS, exige `app:clinical`, limita rutas y métodos, verifica el origen de
las escrituras y sólo entonces agrega la autenticación técnica del upstream.
No registra cuerpos, cookies, tokens ni identificadores clínicos.

La implementación desplegable está en
`bahmni-docker-HCSBA/bahmni-standard/ips-mediator`; no es un BFF de Next.js.

## Cámara y HC1

El lector de ambos controles admite pegado y cámara. ICVP además decodifica
localmente HC1 (Base45, zlib, COSE_Sign1 y CWT/CBOR) para una previsualización
mínima. La UI señala explícitamente que esa lectura **no valida la firma**;
la resolución autoritativa continúa en el mediador.

## Activación

El despliegue permanece apagado por defecto mediante
`IPS_MEDIATOR_ENABLED=false`. Para habilitarlo se deben proporcionar secretos
rotados en archivos ignorados por Git y las variables descritas en
`bahmni-standard/.env.ips.example`. No se deben reutilizar las credenciales
que estuvieron embebidas en el frontend legacy: al haber sido entregadas al
navegador deben considerarse expuestas.

Después de activar el overlay:

```powershell
cd ..\bahmni-docker-HCSBA
.\dev-environment.ps1 recreate
.\dev-environment.ps1 verify
```

## Compuerta clínica pendiente

Antes de promover los dos controles desde `partial` se requiere:

1. Credenciales técnicas rotadas y un upstream DEV alcanzable.
2. Paciente sintético autorizado con DocumentReference IPS e inmunización.
3. ITI-67/68, PDF/Bundle, VHL e ICVP verificados sin datos identificatorios en
   la evidencia.
4. Prueba de cámara con permisos concedidos y denegados.
5. Perfil con `app:clinical` permitido y perfil sin privilegio rechazado.
6. Confirmación de que ninguna solicitud contiene `Authorization` desde el
   navegador y ningún bundle legacy se carga por red.
