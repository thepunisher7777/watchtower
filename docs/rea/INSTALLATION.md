# REA: instalación y verificación, 13 de octubre de 2026

Estado: instalado y configurado en el contenedor remoto; MCP stdio verificado. Capacidad JavaScript profunda parcialmente bloqueada por el entorno. No se ha instalado nada en el PC ni en el iPhone del propietario.

## Procedencia y revisión

Repositorio oficial: https://github.com/morluto/rea. npm `rea-agents@6.4.0` declara ese mismo repositorio, licencia MIT y Node `^22.19.0 || ^24.11.0 || >=26.0.0`. Se descargó mediante `npm pack --ignore-scripts`, se verificó SHA-512 contra la integridad publicada y se inspeccionaron el despachador, las dependencias, `prepare.mjs` y el plan de setup antes de ejecutar. La preparación opcional solo instala Husky cuando existe el árbol de desarrollo; todos los scripts de instalación se deshabilitaron. No se instaló Hopper ni software de pago. No se ejecutaron los objetivos analizados.

Entorno detectado: Linux x86_64, Ubuntu 24.04, Node 24.19.0, npm 11.9.0. `file` y `objdump` disponibles; Ghidra, Hopper, IDA, rizin/radare2 y los CLI de otros agentes no detectados.

## Operaciones realizadas

1. Paquete publicado extraído e instalado con `npm install --omit=dev --ignore-scripts` en un directorio aislado, ajeno a las aplicaciones.
2. Copia privada de la configuración existente fuera de los repositorios, en `/root/.rea/config-backups/`, además del backup oficial `.rea.backup`.
3. Plan oficial de solo lectura: `npm_config_ignore_scripts=true npx -y rea-agents@6.4.0 setup --client codex --dry-run --json`.
4. Tras revisar rutas y alcance: mismo comando con `--yes` en lugar de `--dry-run`.
5. Registro Codex fijado a `npx -y rea-agents@6.4.0 mcp`, timeout de inicio 30 segundos; skill oficial instalada en `/root/.agents/skills/reverse-engineer-anything`.
6. Diagnóstico solicitado: `npx -y rea-agents@latest doctor --json`, ejecutado con scripts npm deshabilitados. El diagnóstico general NO está saludable por ausencia de motores nativos. `doctor --client codex --skill --json` sí está saludable.
7. `rea mcp doctor --json`: inicialización, protocolo 2025-11-25, catálogo de 170 herramientas y 6 prompts, identidad y operación `binary_session` correctos.
8. Cliente SDK real: `open_binary` sobre ZIP seguro y `inspect_artifact` sobre la misma sesión; evidencia conservada en `evidence/videojs-artifact-mcp.json`. El script reproducible está en `scripts/rea-mcp-probe.mjs`.

Se verificó que las opciones Codex ajenas a REA no cambiaron. No se han escrito credenciales ni configuraciones privadas en Git.

## Limitación real del contenedor

`analyze_javascript_application` falla antes de analizar módulos: el hijo `ps` devuelve `fatal library error, lookup self`. En una comprobación independiente, Node ve PID 5 mientras `/proc/self` apunta a 1672. La inspección de propiedad de procesos de REA requiere identificadores coherentes y se cierra de forma segura. No se parcheó REA, no se falseó `ps` y no se omitieron sus comprobaciones. La recuperación de JavaScript también requiere un motor Wakaru externo no disponible; no se instaló un segundo motor para intentar eludir el problema.

La apertura ZIP y el grafo seguro de artefactos funcionan sin esos procesos. Esto verifica una operación MCP de análisis real, pero NO demuestra decompilación nativa ni trazado profundo de JavaScript. El registro nuevo no inyecta herramientas en la conversación ya iniciada: hace falta reiniciar un cliente Codex para que lea la configuración. Aquí se verificó la conexión directamente con el SDK oficial.

## Persistencia y siguientes sesiones

La instalación y los backups son locales al contenedor. No se puede garantizar que `/root` ni la caché npm sobrevivan a su recreación. La skill no se ha guardado en la página de Skills de la cuenta; no se ha afirmado persistencia entre chats. La documentación, scripts y evidencias sí quedan en la rama del proyecto.

En un PC autorizado con Node compatible, repetir primero el plan de solo lectura y revisar el backup; aplicar setup únicamente al cliente elegido y ejecutar doctor. Reiniciar Codex y probar un objetivo público. No instalar motores de pago ni cambiar configuraciones de otros agentes por defecto. Para análisis nativo, evaluar Ghidra y Java en un equipo con procesos y `/proc` coherentes, según la documentación oficial de la versión.
