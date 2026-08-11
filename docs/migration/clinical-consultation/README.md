# Migración de Consulta Clínica

Este directorio es la especificación ejecutable del reemplazo de Consulta AngularJS. La fuente funcional se consulta en este orden: HCSBA desarrollo, remoto HCSBA y copia local.

- [Matriz legacy/Next](./legacy-next-matrix.md)
- [Contrato de encuentro](./payload-contracts.md)
- [Paridad de diagnóstico y condiciones](./diagnosis-conditions-parity.md)
- [Paridad del tablero Órdenes](./orders-parity.md)
- [Form2 y adaptadores seguros](./form2-adapters.md)
- [Modos de consulta](./consultation-modes.md)
- [Endpoints existentes](./endpoints.md)
- [Decisiones de compatibilidad](./compatibility-decisions.md)
- [Evidencia de certificación](./certification-2026-08-04.md)
- [Compuerta de activación](./activation-gate.json)
- [Trazabilidad](./test-trace.md)

La compuerta de Consulta quedó aprobada con 14/14 criterios el 4 de agosto de 2026. El flag público no sensible `clinicalConsultationEnabled` está activo en HCSBA desarrollo y el botón **Consulta** abre la ruta Next.js certificada.

`npm run certification:consultation` imprime la evidencia sin PHI. `npm run gate:consultation` exige que todos los criterios de `activation-gate.json` permanezcan aprobados antes de construir o promover una imagen.
