# Directrices visuales HCSBA

Esta guia rige las pantallas Next.js. Fuente de estilos compartidos:
`src/styles/visual-system.css`, cargada despues de los estilos de cada modulo.
Los cambios visuales preservan permisos, validaciones, rutas y operaciones clinicas.

## Composicion y espacio

- Mantener el contenedor centrado actual: ancho maximo 1760px, laterales entre
  0.5rem y 1rem segun espacio disponible. No cambiar este ancho por pantalla.
- Separacion de referencia entre bloques: 0.85rem. Aplicarla tambien entre la
  barra global y el titulo, entre titulo y contenido, y entre toolbar y tarjetas.
- El padding interior habitual es 1rem; las toolbars compactas usan 0.55rem.
- No acumular margin y gap para la misma separacion.
- Las colecciones de tarjetas de altura variable fluyen en columnas independientes,
  sin filas compartidas que generen huecos bajo tarjetas cortas. Clinico y ADT
  comparten `ClinicalDashboardSections`; conservar sus cortes Full-Page y el orden
  configurado al apilar en movil. Programas y grupos de tareas usan columnas CSS.
  Al colapsar o expandir una tarjeta, las siguientes deben reajustarse sin offsets.
- Esta regla no altera matrices de camas, calendarios, tablas, campos de formulario
  ni mosaicos de navegacion de altura uniforme: su alineacion tiene significado.
- En pantallas de paciente: contexto a la izquierda (17rem a 21rem), navegacion
  y acciones arriba a la derecha, contenido inmediatamente debajo.
- Las columnas deben ser independientes: la altura del paciente no empuja el
  contenido derecho. No compensar alturas con margenes fijos ni negativos.
- Por debajo de 900px, apilar contexto y contenido; los bloques derechos con
  dos columnas deben apilarse antes de que se vuelvan ilegibles.
- Al apilar, cada tarjeta de datos ocupa el 100% del ancho de su columna,
  conservando solo el padding lateral compartido. No usar ancho intrinseco por
  contenido ni heredar align-items: start al convertir una grilla en flex-column.
- Mantener los margenes inferiores acordados en Consulta. Una barra fija nunca
  debe tapar el ultimo campo; comprobar el final del scroll y botones envueltos.
- No introducir nuevos bloques sticky sin comprobar altura disponible y la
  barra global. En pantallas estrechas, preferir flujo normal.

## Tipografia

- Familia del proyecto: Inter, Segoe UI, Arial, sans-serif; PrimeReact debe
  heredarla. No cargar otra fuente por modulo.
- Texto de trabajo y controles: 1rem. Etiquetas secundarias: 0.875rem.
- Titulo de pagina: 1.5rem; titulo de tarjeta o seccion: 1rem, peso 650-700.
- Identidad del paciente: 1.05rem a 1.18rem, con ajuste de linea cuando haga falta.
- No escalar tipografia con el ancho de ventana; letter-spacing: 0.
- No truncar datos clinicos necesarios para decidir. Permitir ajuste de texto.

## Color y superficies

- Usar variables `--hcsba-*`: tinta #17333d, secundario #607680, acento #155bb5,
  encabezado #075d73, borde #cbdde2, superficie blanca.
- Conservar la identidad existente de encabezados y tarjetas, sus radios y
  sombras discretas. No introducir otra paleta por modulo.
- Paleta de encabezados aprobada: --hcsba-clinical-heading, el mismo fondo de
  Clinico (linear-gradient(110deg, #075d73, #087b96)), con letras blancas.
  Aplicar a titulos de pagina y cabeceras de identidad del paciente. Mantener
  formularios claros y colores semanticos de estados, sin cambiar operaciones.
- Las toolbars deben tener superficie blanca, borde y espacio interior.
- Las acciones en encabezados oscuros usan iconos y texto blancos; en superficies
  claras usan el acento azul. No poner azul sobre azul.
- Respetar colores semanticos de error, advertencia, exito y estados clinicos.

## Botones y formularios

- Accion principal: petroleo intermedio #086c85 (--hcsba-button-primary), texto
  blanco; secundaria: mismo tono en borde y texto con fondo transparente.
  Hover #075d73 y pulsacion #064f62 con sombra interior y desplazamiento de 1px.
  Contornos usan fondo tintado en hover/pulsacion. Respetar reduced-motion,
  disabled y colores semanticos (danger, success, warning, info). Los botones
  sobre encabezados oscuros mantienen blanco para conservar contraste.
- Mantener PrimeReact y PrimeIcons existentes. Iconos solos para acciones como
  expandir, contraer, imprimir o eliminar, con nombre accesible y tooltip.
- Comandos como Guardar, Agregar y Cancelar pueden llevar icono y texto.
- En tarjetas de paciente distribuir acciones cortas en dos columnas cuando
  quepan; permitir una accion principal a todo el ancho.
- No desplazar botones al seleccionar un campo. Alinear las toolbars al centro,
  permitir wrap y conservar tamanos estables de iconos.
- Campos con etiqueta visible, estado disabled/loading y errores junto al campo.
- Los controles no pueden superar el ancho de su columna. Tablas y calendarios
  densos pueden tener scroll local; la pagina no debe desbordarse horizontalmente.
- En dialogos a 700px o menos, cada campo ocupa una fila completa, incluidos
  dosis, unidad, duracion y horarios. No conservar pares de inputs en la misma fila.
- Mantener navegacion por teclado y foco visible. No depender solo del color.

## Revision por modulo

Revisar Inicio; Registro (busqueda, alta, edicion, visita); Clinico (busqueda,
dashboard, visita, todas las pestanas de consulta); Programas (busqueda, detalle,
enrolamiento); Documentos; Citas (resumen, calendario, lista, espera, formulario,
servicios); Ordenes (busqueda, cumplimiento); Camas (mapa, gestion, paciente,
Care View); Administracion (inicio, Beds, Audit Log); ubicacion y contrasena.

Las aplicaciones externas/legacy y superficies especializadas (mapa de camas,
calendario, Care View, captura biometrica) conservan su estructura funcional.
Consultar antes de redisenar su interaccion; armonizar color y tipografia si
es posible sin alterar esa estructura.

Por decision del usuario, todos los menus que aun usan legacy quedan pendientes
hasta su migracion. No modificar su codigo ni sus estilos durante esta revision.

## Verificacion

- Revisar escritorio ancho, ventana intermedia y movil (1920, 1280, 900, 390px).
- Comprobar titulos, margenes, textos largos, wrap, foco y ultimo campo al hacer scroll.
- Revisar estados vacios, carga, error y acciones deshabilitadas.
- No guardar datos clinicos durante una revision visual.
- Ejecutar lint y typecheck; tests funcionales solo si se modifica comportamiento.
- Registrar lo revisado y distinguir revision de codigo de verificacion en navegador.
