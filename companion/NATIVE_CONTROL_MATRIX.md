# Native Control Matrix · 0.9.2

## Objetivo
Skipper usa únicamente controles nativos visibles en servicios DRM. No lee ni modifica el elemento de vídeo protegido.

## Plataformas principales auditadas
- Netflix: intro, recap, seamless next.
- Prime Video: intro/recap compartidos diferenciados por texto; Next solo con evidencia de final.
- Disney+: intro/recap/next mediante data-testid/aria/texto.
- Max: intro/recap/next mediante data-testid/aria/texto.
- Apple TV+: intro/recap/next mediante aria/data-testid/texto.
- Paramount+, Hulu, Peacock, SkyShowtime, HIDIVE: matriz genérica + selectores data-testid.
- Movistar Plus+ y Filmin: matriz genérica + atributos accesibles.
- Crunchyroll: motor completo; selectores específicos para intro/recap/next y fallback textual.

## Guardarraíles
- Intro y recap son estados distintos.
- Una acción solo se dispara una vez por URL/episodio.
- AutoNext requiere estado real de final/cuenta atrás; nunca se ejecuta desde iframes.
- El usuario puede retroceder tras un salto sin que Skipper lo fuerce de nuevo.
- Si una plataforma cambia su DOM, el fallback por texto/aria intenta seguir funcionando; si no hay evidencia suficiente, no actúa.
