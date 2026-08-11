# Controles configurables del dashboard

## Cumplimiento de órdenes

El control `ordersControl` conserva el contrato específico de legacy y no se renderiza mediante la tabla genérica. Consume `orderType`, `dashboardConfig.conceptNames`, `numberOfVisits`, `obsIgnoreList`, `showHeader` y `expandedViewConfig`. El nombre visible prioriza `order.concept` —incluidas sus traducciones y nombre corto publicados— antes de `conceptName`; la primera orden aparece expandida y cada orden muestra profesional, fecha, observaciones de cumplimiento o `NO_FULFILMENT_MESSAGE`.
