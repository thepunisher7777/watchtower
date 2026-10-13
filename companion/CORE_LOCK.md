# Arquitectura protegida — Skipper 0.5.6 ICE

La antigua regla de “core congelado” se sustituye por fronteras de seguridad verificables:

1. `drm_safe.js` es el único content script cargado en servicios DRM.
2. `frame_player.js` y `frame_resume.js` solo actúan en frames cuyo contexto superior pertenece a una página de anime compatible y abortan ante cualquier host protegido.
3. `content.js` solo se inyecta en los dominios de anime declarados; nunca en Netflix/Disney+/Prime/Max/etc.
4. La build pública de Chrome Web Store se genera separada y no contiene `<all_urls>` ni el motor HTML5 universal.
