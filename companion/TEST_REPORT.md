# WatchTower Companion DEV 0.9.3 — Pruebas

Esta versión parte del archivo original DEV 0.9.2 NativeMatrix; la build CWS 0.7.0 no se modifica.

`npm run check` comprueba todos los scripts de la web y la extensión. `npm test` ejecuta pruebas del reconciliador, interfaz real, worker original, puente original y content script original con vídeo DOM ficticio. APIs Chrome simuladas; ninguna sesión de streaming real.

Se prueban escrituras simultáneas sin pérdidas, fallo de storage y siguiente escritura, replay inicial, schema legacy, inicio/pausa/fin aunque AutoNext esté apagado, rechazo de iframe atrasado, lotes con una sola revisión, idempotencia y bloqueo manual. Los hashes del baseline verifican que los scripts DRM y los permisos no cambiaron.

No se afirma Chromium empaquetado, Chrome Web Store publicado, Netflix probado ni compatibilidad iPhone. Es una build DEV para instalación manual y QA en navegador.
