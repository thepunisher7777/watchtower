# Investigación: señales de reproducción e integridad del historial

## Pregunta y objetivo autorizado

¿Cómo traducir señales de reproducción en un historial que no cuente dos veces el mismo episodio ni retroceda por eventos atrasados?

Referencia pública: npm `video.js@8.24.1`, repositorio https://github.com/videojs/video.js, Apache-2.0. Se descargó el paquete, sin ejecutarlo ni instalarlo en la aplicación. Para la operación ZIP de REA se empaquetaron **copias sin modificar** de `package.json`, `LICENSE` y `dist/video.cjs.js`; el ZIP es un contenedor de análisis creado aquí, no un archivo oficial distribuido por Video.js.

## Evidencia real de REA

- MCP: servidor `rea@6.4.0`, operaciones `open_binary` y `inspect_artifact`.
- Evidencia: `ev_b4e4f809cdcac65d648b2308de8e8561427581f32b42668f6ed35da55441ee3f`.
- SHA-256 del contenedor: `dced933cd1c98e06a1dafee80c7d82c57513b06f1096c9764b93516054c3ba59`.
- Resultado: inventario del directorio central ZIP y grafo de artefactos; límites de cobertura, hipótesis y próximos sondeos incluidos en el JSON adjunto.
- REA declara expresamente que esa inspección no ejecuta el objetivo ni establece semántica específica del formato. No produjo pseudocódigo del reproductor.
- `analyze_javascript_application` del árbol WatchTower falló por la inspección de procesos. Se conserva el error en `evidence/javascript-blocker.json`; no se cuenta ese intento como análisis de código completado.

## Hechos confirmados mediante lectura alternativa del paquete

En `video.js@8.24.1/dist/video.cjs.js`, líneas 22875–22885: el reproductor escucha `loadstart`, `ended`, `play`, `pause`, `durationchange` y otros eventos del Tech. En líneas 23510–23529, `Player.handleTechEnded_()` cambia clases, puede reiniciar si loop está activo, pausa cuando procede y dispara `ended`. Estas observaciones proceden de lectura directa del paquete publicado, **no de una decompilación REA**. No se ha copiado el código del reproductor a WatchTower.

La documentación pública HTMLMediaElement permite observar `play`/`playing`, `timeupdate`, `pause`, `ended`, `durationchange` y leer `currentTime`/`duration` sobre vídeo autorizado. Esas señales no identifican por sí solas serie, temporada y capítulo. Una extensión necesita un adaptador de metadatos visible/autorizado y debe declarar desconocido lo que no pueda identificar. No se ha probado Netflix, Prime Video ni otro portal.

## Inferencia y requisitos propios

Un evento `ended` no equivale a una nueva unidad de contenido: si WatchTower ya marcó visto por umbral, puede recibir otro evento con un ID distinto sobre el mismo episodio. Por tanto, deduplicar solo por ID de mensaje es insuficiente. La inferencia está reproducida con datos ficticios contra la implementación anterior.

Requisitos implementados:

1. Validar eventos y conservar ceros explícitos; rechazar NaN, negativos, identidades incompletas de nuevos episodios y acciones desconocidas.
2. Separar ID de mensaje de identidad de contenido: título + temporada + episodio + marcador de finalización.
3. Persistir marcador e identidad en la ficha, junto con temporada/episodio en el historial. Repeticiones de umbral/fin no vuelven a incrementar el episodio.
4. No aplicar episodios anteriores ni eventos con fecha anterior a la última señal comparable. No reducir el máximo observado por una señal atrasada.
5. Respetar `manualLock`. No fabricar duración cuando no se conoce; no inferir el próximo episodio de una señal sin identidad tras finalizar.
6. Recibir mensajes solo del mismo `window` y origen; los eventos cloud pasan por el mismo reconciliador.
7. La sincronización opcional existente transporta estos campos; no se han añadido servicios ni modificado bases de datos.

## Investigación pendiente

Falta el repositorio de Companion: no se puede verificar inicio/cambio de episodio en servicios externos. Tampoco puede demostrarse sincronización real entre dispositivos sin sesiones y un entorno de prueba autorizado. El receptor y la serialización sí están probados localmente. REA merece otra prueba en un host con procesos coherentes; para estos defectos con fuente disponible, las pruebas y el análisis directo son más útiles que la ingeniería inversa profunda.
