# Certificación de Consulta — 2026-08-04

## Resultado

Compuerta aprobada: **14/14**. El botón **Consulta** está habilitado en HCSBA desarrollo y abre el flujo Next.js.

## Evidencia funcional

- Autenticación, ubicación, proveedor y privilegios reales.
- Siete tableros: observaciones, diagnóstico/condiciones, disposición, resumen, órdenes, bacteriología y tratamiento.
- Cinco modos: visita activa, sin visita, histórico, retrospectivo y programa.
- Enrolamiento sintético temporal y encuentro retrospectivo reversible, ambos anulados al finalizar.
- Payloads dorados para Form2, diagnóstico, condiciones/disposición, órdenes, bacteriología y tratamiento.
- Tres perfiles efectivos de privilegios; usuarios técnicos temporales purgados.
- Conflicto 409, escritura ambigua, fallo parcial de condiciones y CDSS crítico.
- Impresión rápida, documentos, teleconsulta y receta PDF/correo.
- Axe y teclado en los cinco modos reales sobre Chromium, Firefox y Edge.
- Navegación desde el dashboard mediante el botón habilitado hasta la ruta Pages Router.

## Calidad y entrega

- Lint, TypeScript estricto y build standalone aprobados.
- 51 archivos y 191 pruebas unitarias aprobadas.
- Regresión Playwright local completa aprobada: 66 escenarios definidos en tres navegadores.
- Imagen `hcsba/bahmni-next-web:0.1.0-rc.0`, digest `sha256:7ef75de0285a7b7ffd2885b3278d12ceec174f33ea5a072128945a0ade7eda78`.
- Contenedor no root saludable y runtime-config con `clinicalConsultationEnabled=true`.

Las credenciales se reciben sólo mediante variables de proceso y no se imprimen ni almacenan. La evidencia no conserva PHI.

`npm run certification:consultation` muestra el estado y `npm run gate:consultation` impide promover la imagen si reaparece un criterio pendiente.
