# Privacidad — Skipper 0.5.6 ICE

Skipper no vende datos personales ni los utiliza para publicidad.

## Datos locales
La extensión puede guardar en `chrome.storage.sync` preferencias/perfiles y en `chrome.storage.local` historial, favoritos, estadísticas, diagnóstico técnico y aprendizaje de Smart Skip. La exportación de configuración solo se produce cuando el usuario pulsa “Exportar”.

## Servicios externos
En Full HTML5 Mode, Skipper puede consultar:
- **Jikan:** título visible del anime para resolver un MAL ID.
- **AniSkip:** MAL ID, número de episodio y duración aproximada para obtener intervalos de opening/ending/recap.

No se envían contraseñas, cookies de autenticación, tokens de sesión, información de pago ni el contenido del vídeo.

## Plataformas DRM
Safe DRM Mode no accede al elemento `<video>` ni a EME/DRM. Solo observa botones/controles visibles del DOM y puede ejecutar el mismo click que podría realizar el usuario.

Skipper no descarga contenido ni evita DRM, paywalls o autenticación.
