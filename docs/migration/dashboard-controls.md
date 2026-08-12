# Controles configurables del dashboard

## Tratamientos por visita

El control `treatment` conserva la estructura de `treatmentTable.html`: agrupa por fecha de visita, mantiene `otherActiveDrugOrders` como seccion independiente y presenta medicamento, pauta, fecha de inicio y detalle del profesional en filas compactas. `showRoute`, `showDrugForm`, `showDetailsButton`, `showProvider`, `showOtherActive`, `numberOfVisits`, `showListView` y `showFlowSheet` siguen gobernados por `dashboard.json`.

Las fechas de visita pueden llegar como epoch numerico serializado en texto. Deben normalizarse antes de aplicar el locale; nunca se debe mostrar el epoch crudo como titulo de la seccion. Descargar y enviar receta siguen siendo acciones por visita, agrupadas bajo una unica accion de compartir como en legacy.

La lista visible prioriza densidad: encabezados de visita y filas de medicamento permanecen en una linea siempre que el ancho lo permita. Cuando `showFlowSheet` aplica a una visita hospitalizada, el cuadro de tratamientos se conserva plegado por defecto para no dominar la vista; el usuario puede abrirlo desde su resumen compacto.

## Densidad y navegacion de tarjetas

El control de diagnostico conserva la regla legacy de `showDetailsButton`: cuando no hay comentarios, el profesional se revela con un chevron compacto dentro de la fila. El detalle no debe reservar una franja completa mientras esta cerrado. Nombre, fecha, certeza, orden y estado siguen visibles en la fila principal.

Todas las tarjetas basadas en `ClinicalDashboardSectionCard` exponen una accion accesible para colapsar o mostrar su contenido. El estado es local a cada tarjeta, no altera `dashboard.json`, no oculta las acciones configuradas del encabezado y deja visible el titulo para reducir el desplazamiento vertical.

## Cumplimiento de órdenes

El control `ordersControl` conserva el contrato específico de legacy y no se renderiza mediante la tabla genérica. Consume `orderType`, `dashboardConfig.conceptNames`, `numberOfVisits`, `obsIgnoreList`, `showHeader` y `expandedViewConfig`. El nombre visible prioriza `order.concept` —incluidas sus traducciones y nombre corto publicados— antes de `conceptName`; la primera orden aparece expandida y cada orden muestra profesional, fecha, observaciones de cumplimiento o `NO_FULFILMENT_MESSAGE`.
