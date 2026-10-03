# WatchTower by ARX

**TRACK · WATCH · ENJOY**

WatchTower es un centro personal para seguir anime, series y películas. El ecosistema se compone de:

- **WatchTower Web/PWA** — biblioteca, progreso, calendario, actividad, descubrimiento, personalización y sincronización opcional.
- **WatchTower Companion** — extensión de navegador que conecta los servicios compatibles con el centro WatchTower.
- **Skipper** — motor integrado de reproducción, anteriormente AniFlow: AutoSkip, AutoNext, reanudación, continuidad y controles seguros.

## Arquitectura

La web puede funcionar únicamente con almacenamiento local. Para sincronización PC ↔ iPhone puede conectarse opcionalmente a Supabase usando `supabase/schema.sql`.

En servicios de streaming protegidos, Companion usa un modo conservador: Skipper interactúa solo con controles nativos visibles cuando están disponibles y no descarga vídeo, no elude DRM y no evita paywalls ni autenticación.

## GitHub Pages

El sitio está preparado para publicarse desde la rama `main`, carpeta `/(root)`.

Una vez activado GitHub Pages, la aplicación estará en:

`https://thepunisher7777.github.io/watchtower/`

Política de privacidad:

`https://thepunisher7777.github.io/watchtower/privacy.html`

## Estado

Versión inicial del ecosistema WatchTower by ARX. La compatibilidad de Companion/Skipper se valida por plataforma antes de trasladar cambios de la build DEV a la build pública de Chrome Web Store.
