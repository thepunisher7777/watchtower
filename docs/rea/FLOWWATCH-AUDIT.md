# Auditoría WatchTower / FlowWatch

Fuente: `thepunisher7777/watchtower`, base `0f6bb58204f45a110d5a8caca3b7476a0b493fbb`. README identifica WatchTower Web, Companion y Skipper. Código accesible: web/PWA; no hay código fuente de la extensión en este repositorio. No había pruebas ni package.json en la base; no se encontraron issues abiertos al consultar GitHub.

## Arquitectura observada

JavaScript clásico, HTML y CSS; `app.js` carga 19 chunks en orden. Varias versiones redefinen funciones mediante parches. Estado local JSON en `flowwatch_v3_state`, BroadcastChannel entre pestañas, service worker de assets, integración Supabase REST/Auth opcional. Importador Streaming añade resultados de Mi lista/Seguir viendo y una cola de revisión; ajustes manuales pueden bloquear una ficha. El reproductor de la PWA se identifica explícitamente como simulación local.

El receptor `app-5.js` recibe `FLOWWATCH_EXTENSION`/`FLOWWATCH_ANIFLOW` y eventos cloud. La base solo deduplicaba ID de evento, aceptaba entradas sin validar, no comprobaba origen, ignoraba `manualLock` y podía volver a completar un episodio después de avanzar automáticamente. Los chunks `app-10.js` y `app-11.js` mezclaban `??` y `||` sin paréntesis: ambos fallaban en Node y en JavaScript estándar.

## Cambio implementado

`playback-core.js`: reconciliador puro, sin dependencias en producción; validación, idempotencia por contenido, progresión conservadora, temporada/episodio en historial, marcador persistente de finalización y respeto al bloqueo manual. Identidades de títulos Unicode se conservan.

Se integra antes de `app-5.js`; el receptor asigna el nuevo estado solo cuando existe una actualización válida. La cola cloud y el almacenamiento actuales se mantienen. Los receptores de reproducción y escaneo filtran `source` y `origin`. Se corrige la sintaxis del importador, se añade el asset al service worker y se cambia únicamente el namespace de caché en la rama de vista previa.

No hay despliegue. No cambia el almacenamiento de usuario, no hay migración destructiva, no se toca ninguna cuenta real y no se declara integración Netflix terminada.

## Pruebas reproducibles

`npm ci --ignore-scripts && npm run check && npm test`, Node 24. Se añade solo jsdom 30.1.2 como dependencia de desarrollo, fijada y con lockfile. La aplicación no carga npm ni jsdom.

Pruebas: umbral seguido de ended con IDs distintos; duplicación tras JSON/recarga y con AutoNext desactivado; episodio siguiente y eventos antiguos; cambio de temporada; bloqueo manual; entradas inválidas; duración desconocida; fecha atrasada; ausencia de identidad después de finalizar; película completada; cola acotada; títulos no latinos. Prueba DOM ejecuta todos los chunks reales, comprueba receptor, origen/source, persistencia y navegación. No es una prueba física de Safari, Chrome ni de un portal de streaming.

## Riesgos y siguientes pasos

- Antes de publicar, validar el protocolo real de Companion: el transporte conservador espera `window.postMessage` desde el mismo window/origen; no autoriza ventanas o iframes ajenos.
- Rewatch/retroceso deliberado debe ser una acción explícita que reinicie el marcador. Esta versión protege avance automático, no añade ese flujo.
- Títulos homónimos todavía se identifican por nombre; un próximo paso es usar IDs de metadatos y proveedor, con revisión humana para fusiones.
- El campo legacy `seen` no constituye un total exacto multitemporada; el nuevo historial sí conserva temporada/episodio. Hace falta un modelo por episodio antes de calcular totales globales.
- Merge cloud existente usa timestamps de fichas y snapshots completos. No demuestra resolución segura de eliminaciones ni concurrencia simultánea; implementar revisión/merge por entidad en un entorno de prueba separado.
- `commit()` oculta fallos de localStorage y el service worker devuelve HTML cuando falta cualquier asset. Ambos problemas quedan diagnosticados, sin mezclar cambios con esta misión de reproducción.

| Próxima acción | Impacto | Esfuerzo | Riesgo |
| --- | --- | --- | --- |
| Localizar Companion y probar señales en vídeo HTML propio | Alto | Medio | Bajo |
| Validar rama en navegadores reales antes de publicar | Alto | Bajo | Bajo |
| Avisar y conservar borrador cuando falla almacenamiento | Alto | Medio | Medio |
| Merge cloud por entidad, revisiones y tombstones | Alto | Alto | Alto |
| Modelo por episodio y rewatch explícito | Alto | Medio | Medio |
| Consolidar redefiniciones de chunks | Medio | Alto | Medio |
