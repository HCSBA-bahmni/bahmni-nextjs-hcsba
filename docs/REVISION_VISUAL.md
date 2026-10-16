# Revision visual por menu

Complementa `DISENO_VISUAL.md`. Las pantallas que comparten componentes tambien
comparten el ajuste, pero la comprobacion en navegador se registra por separado.
La primera pasada fue de solo lectura, sin guardar pacientes, resultados, citas,
altas ni preferencias. El usuario autorizo posteriormente crear datos sinteticos
para ampliar las pruebas. Esa autorizacion no convierte los flujos pendientes en
verificados: cada prueba y registro creado debe quedar anotado por separado.

| Menu | Apartados | Ajuste de esta revision | Comprobacion |
| --- | --- | --- | --- |
| Inicio | Aplicaciones | Titulo estable, ritmo compartido, barra adaptable | Navegador |
| Registro | Busqueda | Estilos compartidos, controles dentro de su ancho | Navegador |
| Registro | Alta y edicion | Etapas legibles en movil, padding de formulario uniforme | Ambas en navegador, etapas apiladas y sin desbordamiento |
| Registro | Detalles / atributos de visita | Paciente a izquierda, formularios a derecha | Navegador en escritorio y movil |
| Clinico | Busqueda y dashboard | Margen superior igual al gap, menu global visible en movil | Navegador |
| Clinico | Visita: General, Resumen de alta, Ordenes | Tipografia y acciones del paciente uniformes | Navegador, apilado a 900px |
| Consulta | Observaciones | Selector adaptable, toolbar en tarjeta, pestanas sin compresion | Navegador movil, sin desbordamiento de pagina |
| Consulta | Diagnostico | Superficies y tipografia compartidas | Navegador movil |
| Consulta | Disposicion, Consulta, Ordenes, Medicamentos, Bacteriologia | Superficies, gaps, resumen apilado y controles compartidos | Navegador a 390, 900, 1280 y 1920px; sin desbordamiento de pagina |
| Programas | Busqueda, activos, historicos, enrolamiento | Contexto lateral, contenido independiente, etiquetas legibles | Navegador, enrolamiento abierto sin guardar |
| Documentos | Busqueda, archivos del paciente, radiologia | Gaps y superficies compartidos | Documentos y Radiologia en navegador movil; sin cargar archivos |
| Citas | Resumen, calendario, lista, espera | Gaps uniformes, sidebar adaptable | Navegador |
| Citas | Nueva / editar cita | Controles y acciones adaptables | Nueva cita embebida en navegador movil; edicion usa el mismo componente |
| Citas | Servicios, alta / edicion de servicio | Muestras de color en filas; encabezados y acciones adaptables | Alta, edicion y fila de disponibilidad en navegador movil; sin guardar |
| Camas | Lista y colas de pacientes | Busqueda y navegacion compartidas | Navegador |
| Camas | Mapa, lista, gestion de paciente / cama | Ritmo del workspace, paneles sin margen duplicado | Mapa y paciente en navegador |
| Camas | Dashboard IPD | Contexto lateral, scroll completo y encabezados con contraste | Navegador: seis secciones, ultima tarjeta visible al final |
| Camas | Dialogos de tareas y programacion | Footer adaptable; cada input en su fila en movil | Navegador: dosis y unidad, duracion y unidad separadas a 390 y 700px; columnas a 900 y 1280px |
| Camas | Vista de cuidados | Conserva matriz funcional y estados; estilo compartido | Navegador |
| Administracion | Inicio | Gaps sin duplicacion, titulos uniformes | Navegador |
| Administracion | Beds: ubicaciones, tipos, etiquetas | Gaps, iconos y etiquetas uniformes | Navegador |
| Administracion | Audit Log | Sin margin extra entre filtros y resultados; tipografia | Navegador: gap 13.6px, sin margenes duplicados |
| Sesion | Acceso, ubicacion, contrasena | Familia tipografica compartida y foco visible | Navegador |

## Resoluciones comprobadas

### Repaso de reglas locales: Programas y encabezados secundarios

El usuario detecto encabezados claros y ancho restringido en Programas. Se elimino
el max-width heredado de 1180px del workspace, conservando el contenedor global.
Enrolamiento, programas activos/historicos y cabeceras de cada programa usan la
paleta aprobada; acciones de cabecera tienen contraste blanco. Estados vacios
sin altura minima decorativa ni icono pseudo-elemento ilegible.
Una nueva busqueda de fondos de header/heading/title en todas las hojas CSS
identifico reglas locales pendientes en Medicamentos, IPD, Registro, servicios
de Citas y Administracion. Se armonizaron esas cabeceras; matrices, calendarios,
leyendas y colores de estado no se repintan con una regla indiscriminada.
Cuatro pruebas especificas de Programas a 390, 900, 1280 y 1920px verifican ancho,
titulos, boton de abrir y estado vacio compacto. Suite: 557 pruebas aprobadas;
typecheck aprobado. El navegador interactivo sigue fallando al iniciar, por lo
que NO se ha completado el recorrido real menu a menu pedido por el usuario.

### Citas: formulario en dialogo

Por solicitud del usuario, Nueva cita deja de ocupar el sidebar del calendario y
se presenta con Dialog de PrimeReact, no modal y alineado a la derecha por la
solicitud posterior del usuario. No bloquea el scroll del calendario.
Reutiliza AppointmentForm embedded,
initialSlot y los mismos callbacks onCancel/onSaved; no cambia campos, validacion
ni guardado. Abrirlo no agrega columnas al contenedor del calendario. Selector de
fecha en flujo flex con wrap, sin centrado absoluto que solape Semana/Dia.
Dialogo con paleta aprobada, scroll interior y campos apilados hasta 700px.
Proveedores usa MultiSelect con busqueda en vez de select multiple nativo. Conserva
visibleProviders, UUIDs, limite configurado y payload. Un test de componente con
datos sinteticos verifica seleccion, limite y deseleccion sin guardar citas.
Pruebas: once tests de Citas y diecinueve pruebas aisladas de
estilos/geometria aprobadas. Las cuatro nuevas usan fixtures a 390, 700, 1024 y
1280px; no sustituyen una prueba de creacion real contra backend.

### Paleta de encabezados aprobada y extendida

El usuario aprobo la variante de Clinico y solicito extenderla a los modulos
modernos. Se retiro la clase piloto de Documentos. Los encabezados de pagina, identidad del
paciente y visita usan exactamente el fondo de las tarjetas de Clinico:
linear-gradient(110deg, #075d73, #087b96), con textos blancos. Ambas superficies
referencian --hcsba-clinical-heading; Clinico conserva su aspecto previo.
Se aplica a Inicio, Registro, Clinico, Consulta, Programas, Documentos/Radiologia,
Citas, Ordenes, Camas, Administracion y titulos de sesion. Los botones secundarios
de los encabezados oscuros conservan contraste blanco. Formularios, estados,
acciones, datos y aplicaciones legacy no cambian.
Trece pruebas aisladas de estilos y geometria verifican la paleta en encabezados
compartidos, texto blanco y anchos adaptables. No equivalen al recorrido funcional
de todas las paginas. La directriz visual registra la aprobacion.

### Ancho completo al apilar: 16 de octubre de 2026

Las columnas de Clinico y ADT conservaban align-items: start al convertirse en
flex-column, haciendo que cada tarjeta se ajustara al texto y no al contenedor.
Se explicitaron width: 100% en los items y align-items: stretch al apilar. Las
colecciones de programas y tareas IPD pasan a una columna hasta 900px.
Se auditaron las reglas de alineacion y ancho intrinseco de las hojas CSS modernas;
no se aplico stretch global a botones, encabezados, matrices o campos internos.

Regresion: `e2e/responsive-card-width.spec.ts`, nueve pruebas aprobadas en Edge
headless a 390, 620, 700, 768, 900, 1024, 1180, 1280 y 1920px. Usan fixtures
sinteticos con las hojas CSS reales, sin servidor ni registros de pacientes.
Comprueban ancho de items y tarjetas, apilado de programas/tareas/contexto y
ausencia de scroll horizontal de pagina. No equivalen a recorrer menus reales.
Sin cambios en rutas, JSX de producto, acciones, permisos o payloads.

Las comprobaciones de esta seccion corresponden a las pasadas anteriores. No
certifican los cambios nuevos de la auditoria estatica registrada a continuacion.

Los 18 accesos principales Next.js fueron abiertos en navegador a 390, 900, 1280 y
1920px. Despues de corregir la navegacion de Camas, ninguno desborda el ancho
de la pagina. Las tablas y matrices conservan su scroll interior.
Visita tambien se comprobo a 900px, donde se apilan contexto y contenido.
Las siete pestanas de Consulta se comprobaron a 390, 900, 1280 y 1920px.
El desbordamiento del resumen movil se corrigio apilando las columnas.
En IPD se elimino la altura fija que recortaba las ultimas tarjetas. Se comprobo
el final del scroll y el contraste de las acciones blancas en encabezados oscuros.
Los dialogos se comprobaron sin guardar tareas ni programacion.
Estas mediciones complementan la inspeccion visual; no certifican todos los
estados posibles de datos ni las pantallas externas.

## Segunda pasada: dialogos y datos sinteticos

### Auditoria estatica transversal del 15 de octubre de 2026

Se volvio a intentar iniciar el navegador; fallo antes de acceder a la pagina con
`failed to write kernel assets`. No se pudo realizar el recorrido boton a boton
solicitado. No se marca como completo ni se confunde con pruebas de componentes.

Inventario reproducible: `node scripts/audit-visual-surfaces.mjs --details`.
Analiza TSX con el parser de TypeScript; no usa datos de pacientes ni modifica
archivos en modo normal. Se encontraron elementos visuales en 62 archivos:
285 instancias Button, 39 button nativos, 29 Dialog, 2 ConfirmDialog, 3 Menu,
17 h1, 55 h2 y 28 h3. Son sitios de codigo, no cantidades de botones visibles:
hay componentes repetidos y opciones que dependen de permisos/configuracion.
El inventario no certifica accesibilidad, campos dinamicos ni cobertura funcional.

Correcciones acotadas segun la guia existente:

- Se agregaron tooltips a 46 botones de icono reutilizando literalmente su
  aria-label existente. Sin nombres nuevos ni cambios en callbacks o payloads.
- Titulos de dialogos y secciones secundarias alineados con los tamanos de la
  guia: politicas de contrasena, servicios, administracion, visitas OIRS, IPS,
  medicamentos, condiciones y ordenes seleccionadas.
- Tipografia de campos, etiquetas y controles en dialogos uniformada; footer
  con contenedor interno tambien permite wrap y gap entre acciones.
- Nota de orden sin ancho minimo que fuerce desbordamiento en movil; fieldsets
  y campos del dialogo pueden contraerse sin perder su contenido.
- Texto largo de identidad del paciente y nombre/contexto de documentos permite
  multiples lineas en vez de truncarse. Opciones de menus y listas desplegables
  permiten ajuste de linea; se conserva el ancho de la pantalla como limite.
- Etiquetas y controles de documentos e IPD usan los tokens tipograficos de la guia.

No se agregaron ni eliminaron campos, menus, rutas, permisos ni opciones clinicas.
No se cambio la guia de diseno ni se modificaron aplicaciones legacy.
Verificacion: 554 pruebas (118 archivos), typecheck y parseo CSS aprobados; lint
sin errores, con dos advertencias preexistentes sobre img. La verificacion
interactiva de cada boton, opciones condicionales y resoluciones sigue PENDIENTE.

### Flujo de tarjetas de altura variable

Se sustituyeron las filas compartidas de ADT por el mismo componente de columnas
independientes que Clinico. Se conservaron los cortes Full-Page, privilegios y
orden movil; a 1180px ADT apila las tarjetas. Programas y grupos de tareas IPD
usan columnas CSS para evitar huecos por alturas diferentes. Los controles
clinicos ocultos tampoco reservan un wrapper vacio con gap.
Las matrices de camas, calendarios, tablas, formularios y mosaicos uniformes
mantienen su alineacion funcional. IPD individual y Visita ya fluyen verticalmente.
Comprobacion automatizada: cuatro pruebas de distribucion y estructura. La
comprobacion visual de estos cambios sigue pendiente por el fallo del navegador.

Inventario estatico del 15 de octubre de 2026: la busqueda de `Dialog`,
`ConfirmDialog` y `confirmDialog` encontro referencias en 19 archivos de `src`.
Esto no incluye necesariamente todos los overlays o formularios embebidos.
No sustituye la comprobacion en navegador descrita arriba.

Pendientes de ampliar en navegador:

- Registro: captura fotografica, busqueda biometrica y sus errores.
- Documentos: vista previa de archivo y estados de carga con archivo sintetico.
- Administracion Beds: distribucion, cama, tipo, etiqueta y confirmaciones.
- Citas: detalle, edicion de cita existente y confirmacion de eliminar servicio.
- IPD: gestion de tarea, confirmacion de administracion, visitas autorizadas y
  descarte de programacion; no ejecutar acciones sobre pacientes ajenos a QA.
- Camas: confirmaciones ADT de admision, traslado o alta con paciente sintetico.
- Clinico: tarjeta expandida, nota de orden y confirmacion de bacteriologia.
- Programas: ventanas condicionadas por el estado del enrolamiento.
- Adaptadores modernos: visor IPS/ICVP, lector QR y compartir ordenes. No enviar
  correo a destinatarios reales durante pruebas.

Registros creados en esta segunda pasada: ninguno hasta el momento.
El navegador automatizado no pudo inicializarse al retomar la revision
(`failed to write kernel assets`), incluso tras reiniciar su sesion. No se han
probado guardados ni modificado datos del backend en esta pasada.

## Reanudacion en navegador del 16 de octubre

Tras reiniciar Codex, el navegador integrado volvio a funcionar. Se ingreso con
la cuenta de pruebas autorizada. No se guardaron datos clinicos ni configuracion.

Recorrido real de esta pasada:

- Inicio y Registro: busqueda y los tres pasos de Nuevo paciente. Igualdad de
  dimensiones de los pasos comprobada; vista movil de 390px sin desbordamiento.
- Programas: busqueda, detalle, apertura y cancelacion del enrolamiento.
  Encabezados con paleta aprobada, ancho compartido y campos apilados en movil.
- Citas: resumen, calendario, lista, espera, formulario lateral de nueva cita,
  selector multiple y lista de proveedores; administracion de servicios,
  nuevo servicio y agregar disponibilidad. Formularios cancelados sin guardar.
- Administracion: Beds, sus tres pestanas y dialogos de nueva ubicacion, tipo y
  etiqueta; Audit Log. No se ejecutaron eliminaciones ni cambios de configuracion.
- Camas: lista, mapa/gestion, Care View y ADT del paciente de pruebas.
- Clinico: busqueda, dashboard (25 tarjetas al ancho disponible en movil), las
  siete pestanas de Consulta y Visita (General, Resumen de alta y Ordenes).
  Se uso el descarte previamente autorizado al salir de Observaciones sin datos
  ingresados. No se probaron envios de ordenes ni guardados clinicos.
- Documentos de pacientes y Radiologia: busqueda/contexto y detalle documental,
  sin subir archivos ni crear visitas.

Hallazgos corregidos en esta pasada:

- ADT: una pista de grilla con minimo intrinseco expandia las tarjetas a 706px
  en pantalla de 390px. Se uso minmax(0, 1fr) en contenedor y columna interna;
  comprobacion real posterior: siete tarjetas de 351px y pagina sin overflow.
- Nuevo paciente: barra inferior sticky de unos 338px tapaba contenido movil.
  Ahora fluye normalmente hasta 700px y no usa margenes laterales negativos.
- Audit Log: titulo Filtros incorporado al mismo encabezado compartido.

Este recorrido no equivale a probar cada boton o estado condicionado. Siguen
pendientes los dialogos especializados enumerados arriba (salvo los tres
dialogos de alta de Beds ya abiertos), ediciones y confirmaciones destructivas,
biometria, archivos sinteticos y acciones especificas de IPD. Legacy sigue
fuera de alcance. Las mediciones DOM no sustituyen capturas de todos los estados.

## Pantallas separadas

CSV Upload, CSV Export y Order Set abren `admin-legacy`. Reportes, Pabellon,
Interfaz de Implementacion y Consola AtomFeed tambien son aplicaciones externas
al frontend Next.js. No reciben `visual-system.css`. Por decision del usuario,
todos los menus legacy quedan PENDIENTES hasta su migracion. No se modifican
su codigo ni sus estilos durante esta revision.

## Hallazgos funcionales fuera de estilo

- Algunos controles dinamicos muestran errores de carga o no tienen adaptador.
  No se cambian sus contratos clinicos durante la armonizacion visual.
- Consulta puede pedir confirmacion de cambios sin guardar al abrir formularios
  durante la revision. El usuario autorizo continuar sin guardar unicamente en la
  pestana de pruebas abierta por Codex, donde no se ingresaron datos clinicos.
  No se guardaron cambios durante la comprobacion de las pestanas.
