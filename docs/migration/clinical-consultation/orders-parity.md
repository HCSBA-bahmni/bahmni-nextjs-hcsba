# Paridad del tablero Órdenes

## Fuente de verdad

La vista se caracteriza desde `ordersTabInitialization`, `orderController`, `orderSelector`, `orders.html`, `ordersTemplate.html`, `orderNotes.html`, `Order` y `EncounterTransactionMapper` del frontend AngularJS.

`extension.json` controla la presencia, el orden y el privilegio `app:clinical:ordersTab`. El contenido procede del concepto **All Orderables** y `app.json` conserva tres reglas dinámicas:

- `orderTypeClassMap` filtra los miembros visibles de cada tipo de orden.
- `enableLabOrderOptions` activa `Urgent` y/o `NeedsPrint` para laboratorio y tipos no radiológicos.
- `enableRadiologyOrderOptions` activa esas opciones para radiología.

## Distribución e interacción

- Cada miembro superior de **All Orderables** es una sección colapsable; la primera abre inicialmente.
- La categoría activa —por ejemplo Blood, Urine o Serum— aparece a la izquierda y la primera queda seleccionada.
- Los ordenables se agrupan por `conceptClass.description` y se presentan como botones visibles, no como autocomplete.
- La búsqueda es local dentro de la categoría y compara nombre corto, nombre completo y sinónimos sin otra llamada de red.
- Las órdenes seleccionadas permanecen visibles junto a categorías, con urgencia, nota y quitar/restaurar.
- Elegir un panel retira órdenes hijas directas y deja sus exámenes marcados como seleccionados indirectamente y no editables.

## Validaciones y persistencia

- No existen filas incompletas: sólo se crea una orden al seleccionar un concepto publicado.
- La selección impide duplicados directos y duplicados introducidos mediante un panel.
- Una orden guardada no permite editar urgencia ni nota. Quitarla produce `DISCONTINUE`; restaurarla antes de guardar cancela esa suspensión.
- `NeedsPrint` sólo está disponible para órdenes nuevas y agrega el marcador traducido al inicio de `commentToFulfiller` una sola vez.
- El modo retrospectivo bloquea por completo el tablero, igual que legacy.
- El textarea genérico “Notas de órdenes de laboratorio” no forma parte de `orders.html`; por eso no se muestra en este tablero.

La evidencia automatizada está en `orderables.test.ts`, `consultation.orders.test.ts`, `goldenPayloads.test.ts` y el flujo Chromium de `e2e/consultation.spec.ts`.
