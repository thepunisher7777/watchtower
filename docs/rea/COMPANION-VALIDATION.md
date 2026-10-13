# Companion original recuperado y validación DEV 0.9.3

Se encontró el archivo original `WatchTower_Companion_DEV_v0.9.2_NativeMatrix.zip` entre las entregas del proyecto. Se extrajeron 35 entradas después de comprobar rutas, tamaño y ausencia de symlinks. También se examinó `WatchTower_Companion_CWS_v0.7.0.zip`; no se modifica la build pública.

El código original DEV se conserva ahora en `companion/`, sin sustituir el motor ni sus opciones. Los hashes de los scripts de DRM, importer y frame resume, junto con los permisos originales, están registrados en `tests/fixtures/companion-baseline.json` y se verifican en tests. No se han añadido permisos ni motores para plataformas protegidas.

## Problemas confirmados y correcciones

1. `background.js` leía y escribía la cola para cada cambio de historial sin serializar; varios callbacks concurrentes podían perder entradas. Ahora las escrituras usan una cadena de promesas, generan IDs únicos, conservan las últimas 500 entradas y propagan fallos de persistencia. Una escritura fallida no bloquea las siguientes.
2. El puente solo emitía `progress`, sin temporada; el protocolo original anime se basaba en números absolutos de episodios. `tracking-protocol.js` valida duración/posición/identidad y documenta temporada 1 como namespace legacy de episodio absoluto, no como metadato de temporada TV verificado.
3. El content script registra `playing`, `pause`, `ended` y la salida de página, además de progreso periódico. El final se persiste antes de AutoNext. Para frames admitidos, el reproductor envía posición/duración y conserva la URL de la página que proporcionó la configuración. El padre descarta eventos de una URL anterior; no asigna el final de un iframe viejo al capítulo nuevo. Se registra el fin aunque AutoNext esté desactivado.
4. Un heartbeat podía enviar eventos antes de que la web estuviera lista; `lastPostedEventId` impedía repetirlos al pedirlos. `PULL_EVENTS` fuerza replay de la cola retenida. El reconciliador de la web deduplica las repeticiones.
5. El replay enviaba solo las últimas 120 entradas de una cola de 500. Se transmite la cola completa acotada y WatchTower reconcilia el lote con una única revisión/escritura/render. La prueba de 150 eventos comprueba esa única revisión.
6. Se limita también el receptor de estado/ajustes de la web al mismo window y origen; el puente de la extensión usa el origen concreto.

## Verificación y límites

19 pruebas aprobadas localmente, incluyendo código original del service worker, del puente y del content script. Los eventos de vídeo se disparan sobre un DOM ficticio; las APIs Chrome se simulan. Esto NO es una prueba de instalación de extensión en Chrome ni de una sesión real de streaming.

Se incluye un vídeo VP8 WebM de 12 segundos generado localmente con ffmpeg, verificado con ffprobe. En Opciones de Companion, «Prueba local con vídeo ficticio» abre `qa/fixture.html`. Esa página carga el motor original, desactiva solo en ese contexto las automatizaciones/búsquedas externas, conserva las preferencias del usuario y permite probar inicio, pausa, final y cambio de episodio. La página puede introducir un título explícitamente ficticio en el historial local; usar un perfil de prueba o exportar antes.

La build DEV 0.9.3 conserva `<all_urls>` del original. No es una build CWS ni se ha enviado a la tienda. Los mecanismos nativos de Netflix y otros servicios protegidos no cambian; no se afirma que su reproducción esté probada.

## Prueba manual reproducible

1. Exportar la biblioteca actual o utilizar un perfil Chrome de prueba.
2. Descargar el ZIP DEV 0.9.3 y descomprimirlo. Chrome → Extensiones → Modo desarrollador → Cargar descomprimida → carpeta que contiene `manifest.json`. No reemplaza automáticamente la versión de tienda.
3. Para probar la web corregida, clonar la rama `feature/rea-playback-integrity` y servir su raíz localmente con `python3 -m http.server 8080`; abrir `http://localhost:8080`. La web pública todavía no contiene estos cambios.
4. Abrir Opciones de Companion y pulsar «Prueba local con vídeo ficticio». No hace falta visitar un portal ni entrar en una cuenta de streaming.
5. Reproducir y pausar el vídeo. Ir cerca del final y dejarlo terminar. Volver a la web: un capítulo completado, no dos. Cambiar al episodio 2 en la fixture, esperar un segundo y reproducir otra vez.
6. Cerrar la web, reproducir en la fixture y reabrir el centro; verificar replay sin duplicación. Exportar JSON y comprobar marcador, temporada/episodio y progreso. No se ha ejecutado esta prueba manual en un Chrome real durante la sesión.

La sincronización de red y los conflictos entre dos dispositivos reales continúan pendientes de un backend de staging autorizado. No se han reutilizado tokens ni llamado a Supabase de producción.

## Evidencia adicional REA

La nueva build DEV ZIP se abrió e inspeccionó realmente por MCP `open_binary` + `inspect_artifact`. Evidencia `ev_ca4ec0541b3fe7dc0d274106351c9e0a39e1e2850ba9dff2a921d5e31aaba64c`, conservada en `evidence/companion-artifact-mcp.json`. Es inventario/grafo de artefactos; no constituye prueba de ejecución Chrome ni decompilación JS. `scripts/package-companion.py` genera y verifica el ZIP reproduciblemente.
