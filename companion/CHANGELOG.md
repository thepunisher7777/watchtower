# WatchTower Companion · Changelog

## 0.9.3 — Playback Integrity DEV
- Eventos start/progress/pause/ended explícitos y duración validada.
- Cola de escrituras serializada para conservar actualizaciones simultáneas.
- Replay explícito al abrir la web y envío de hasta 500 eventos retenidos.
- Contexto de página en señales de iframe para rechazar eventos de episodios anteriores.
- Puente del centro limitado al mismo origen/window.
- Sin cambios en permisos, controles DRM ni build CWS. Validación automatizada con DOM/Chrome API simulados; navegadores y plataformas reales pendientes.

## 0.9.2 — Native Control Matrix
- Auditoría transversal de controles nativos en Netflix, Prime Video, Disney+, Max, Apple TV+, Paramount+, Hulu, Peacock, SkyShowtime, HIDIVE, Movistar+, Filmin y otros servicios protegidos.
- Detección por selectores específicos + texto visible + aria/title/data attributes + Shadow DOM + iframes.
- `Omitir resumen` y `Omitir intro` se tratan como acciones separadas y nunca se confunden.
- El helper de iframe reporta ahora la clave de plataforma correcta al HUD principal.
- Una acción de intro/recap se ejecuta una sola vez por episodio/URL; si el usuario retrocede, Skipper no vuelve a forzar el salto.
- AutoNext protegido por contexto de final y cooldown global de 90 s; los iframes nunca ejecutan AutoNext.
- Crunchyroll (motor completo) recibe selectores/phrases de recap mejorados y búsqueda de botones anidados.
- Controles deshabilitados o invisibles se ignoran.
