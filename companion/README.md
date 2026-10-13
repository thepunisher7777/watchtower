# DEV 0.9.3 — Playback Integrity

Esta revisión parte de DEV 0.9.2 NativeMatrix y preserva sus funcionalidades y permisos. No es la build de Chrome Web Store. Pruebas y límites: `docs/rea/COMPANION-VALIDATION.md` en el repositorio WatchTower. Las pruebas Chrome/streaming reales siguen pendientes. Opciones incluye una prueba local con vídeo ficticio; no requiere cuentas ni consultas externas.

# WatchTower Companion DEV v0.9.0

Extensión privada de pruebas para WatchTower by ARX. Incluye Streaming Importer y Skipper.

Esta build introduce Cross-Platform Guard: captura conservadora de títulos canónicos, separación serie/episodio, rechazo de textos de interfaz y portadas verticales solamente.

No subir a Chrome Web Store: la build DEV usa permisos amplios para pruebas.


## v0.9.2
Mejora la detección de controles nativos como ‘Omitir resumen’ incluso cuando el reproductor los renderiza en un iframe.
