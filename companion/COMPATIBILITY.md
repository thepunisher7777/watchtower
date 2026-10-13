# COMPATIBILITY — DEV v0.9.0

## Objetivo del importer
Prioridad: precisión > cantidad. Si WatchTower no puede demostrar cuál es el título canónico de una serie/película, la tarjeta queda fuera o se manda a revisión.

## Principales plataformas
- Netflix: Mi lista / Seguir viendo / página actual. Modo DRM seguro.
- Disney+: Watchlist / Seguir viendo / páginas de serie, película y vídeo. Modo DRM seguro.
- Prime Video: captura estricta de `/detail/`, CTA rechazados, Prime Guard en AutoNext.
- Crunchyroll: `/watch/` requiere serie padre; motor completo de Skipper.
- Max: show/movie/video con resolución de padre cuando hay episodio.
- Apple TV+: `/episode/` requiere serie padre; show/movie importables.
- HIDIVE, Paramount+, Hulu, Peacock, SkyShowtime, Movistar Plus+, Filmin: selectores específicos + guardarraíles comunes.
- MUBI, Rakuten TV, Plex, Discovery+, BritBox, AMC+, Atresplayer, RTVE Play: soporte DEV conservador.

## Regla de seguridad de datos
No se accede a historial oculto, DRM, contenido de vídeo protegido, contraseñas, cookies de autenticación ni tokens de sesión.
