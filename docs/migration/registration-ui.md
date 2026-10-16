# Registro de pacientes: reglas de interfaz

## Alcance

El formulario Next conserva el orden clínico y la configuración dinámica del registro legacy, pero presenta el flujo en tres etapas: identificación, dirección e información adicional. Las mejoras visuales no reemplazan reglas configuradas por valores locales; el payload sólo incorpora datos exigidos por el contrato OpenMRS, como la ubicación de cada identificador.

## Selectores y catálogos

- Los catálogos dinámicos de conceptos, tipos y fuentes de identificador, relaciones y tipos de visita usan el filtro nativo de `Dropdown` de PrimeReact 10.
- Los catálogos conceptuales de atributos se solicitan en paralelo al cargar la configuración. Los obligatorios siguen bloqueando la apertura segura del formulario; los opcionales se precargan en segundo plano y comparten cinco minutos de caché con el `Dropdown`, por lo que abrirlo no dispara una segunda lectura.
- Los catálogos de más de 50 respuestas usan el virtual scroller de PrimeReact para reducir el trabajo de render inicial del panel.
- El filtro busca sobre las propiedades semánticas disponibles (`display`, `name`, `description` o `prefix`), enfoca el cuadro de búsqueda al abrir y se limpia al cerrar.
- Los selectores pequeños y cerrados, como género o formatos de impresión con pocas opciones, no agregan un buscador innecesario.
- La dirección jerárquica mantiene el `AutoComplete` legacy: exige dos caracteres, aplica una demora corta a la consulta y requiere seleccionar una sugerencia válida.
- Las búsquedas de pacientes o proveedores para relaciones también requieren una selección válida, evitando conservar texto libre sin UUID.

## Disposición y accesibilidad

- Cada parte del nombre tiene una etiqueta visible y un nombre accesible estable; los placeholders son ejemplos y no sustituyen la etiqueta.
- Los controles mantienen una altura mínima de 44 px, foco visible y errores asociados al campo cuando están disponibles.
- En escritorio se usa una grilla de dos columnas; los nombres e identificadores ocupan el ancho necesario. En 900 px o menos la grilla se reduce, y en 620 px los pasos muestran número, total y nombre de la etapa activa.
- La barra de acciones es parte del flujo del documento y no queda superpuesta sobre controles ni foco de teclado.
- El cambio de etapa mueve el foco al encabezado correspondiente para conservar orientación por teclado y lector de pantalla.
- El paso activo se comunica mediante número y texto enfatizados, sin agregar una tarjeta blanca dentro de la barra de progreso.

## Validación y ubicación de identificadores

- OpenMRS exige una `location` no nula en cada `PatientIdentifier`. El mapper envía la ubicación seleccionada para identificadores nuevos y conserva la ubicación original cuando edita identificadores existentes.
- Si el perfil histórico no publica esa ubicación, la edición usa como respaldo la ubicación clínica activa de la sesión.
- El perfil puede contener identificadores internos que no publica `/idgen/identifiertype` (por ejemplo, `CRID MPI`). Se conservan en el estado y el payload aunque no se rendericen; si su ubicación histórica está vacía, se completa con la ubicación activa antes de guardar.
- Antes de escribir, el formulario bloquea un identificador sin ubicación, muestra el error junto al número de ficha y enfoca un resumen accesible. Si un backend antiguo igualmente devuelve `PatientIdentifier.location.null` o su texto traducido, se transforma al mismo mensaje de campo y no se expone el error técnico crudo.
- Los errores de validación y persistencia se muestran tanto en el resumen accesible/inline como en un toast temporal. El toast es complementario y nunca reemplaza la marca del campo ni el foco del resumen.

## Barra de acciones

- En la última etapa, navegación, impresión y persistencia se agrupan por función para que el selector no reduzca ni recorte las etiquetas de los botones.
- La barra permanece visible en el borde inferior mientras se recorre el formulario. Conserva espacio dentro del flujo, compensa el foco de teclado y se reorganiza en dos filas en anchos intermedios.
- En pantallas pequeñas reorganiza impresión y guardado en una cuadrícula compacta, manteniendo también la acción explícita para volver a la etapa anterior.

## Regularización pre-MPI

- Agregar un RUN a una ficha heredada no se trata como una corrección ordinaria. Si coincide con el RUN válido contenido en el identificador histórico y la misma UUID es confirmada por OpenMRS, se abre una comparación con el resultado MPI.
- La confirmación informa antes de escribir que se conservará el número histórico, se asignará un HCSBA preferido y no se creará otro paciente.
- RUN distintos, identificadores heredados inválidos, candidatos locales múltiples y resultados MPI ambiguos o desactualizados permanecen bloqueados para adjudicación.

## Compatibilidad comprobada

Estas reglas se implementaron y verificaron con PrimeReact `10.9.8`, PrimeFlex `4.0.0`, React `19.2.8` y Next.js `16.2.12`. Un cambio a PrimeReact 11 debe tratarse como una migración independiente porque modifica APIs y estilos de componentes.

## Cobertura

El E2E de registro comprueba el precargado sin segunda consulta al abrir, el filtro de un catálogo, navegación entre etapas, conservación de valores, ausencia de scroll horizontal a 375 px, Axe sin hallazgos serios o críticos y equivalencia del payload EIS/OpenMRS, incluida la ubicación del identificador.
