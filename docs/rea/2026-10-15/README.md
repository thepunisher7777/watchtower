# REA + Codex + Work: instalación y validación

Fecha: 15 de octubre de 2026. Rama `docs/rea-codex-work-20261015`, basada en `feature/rea-playback-integrity`. Solo herramientas de verificación y documentación; ninguna aplicación publicada ni base real se ha modificado.

## Estado comprobado

| Componente | Resultado |
| --- | --- |
| REA | **Instalado, 6.5.0**, en este contenedor remoto Linux x86_64 |
| Codex CLI | **Instalado, 0.162.1**; reconoce la configuración y descubre las 207 herramientas mediante su app-server |
| Llamada de análisis desde una sesión Codex | **Pendiente**: `thread/start` no respondió en la prueba; una configuración aislada también agotó el plazo durante `initialize`. No se atribuye una causa de autenticación sin evidencia |
| Servidor MCP | **Funcional**: inicialización, inventario, `binary_session`, `open_binary` e `inspect_artifact` comprobados |
| Work, ejecución mediante terminal/SDK | **Comprobada**: dos análisis reales por MCP stdio desde el entorno de esta conversación |
| Work, herramientas nativas en el chat | **No conectado**: no se ha añadido REA al catálogo de herramientas de Work |
| Motores nativos Ghidra/Hopper/IDA | No detectados ni instalados; descompilación nativa no comprobada |
| Análisis JavaScript avanzado | Bloqueado por `ps`: `fatal library error, lookup self`, durante la verificación de propiedad de procesos |

La instalación no está en el PC ni en el iPhone del usuario. Parte de la configuración anterior sobrevivió, mientras que ejecutables e instrucciones no estaban disponibles al comenzar. No existe garantía de persistencia del contenedor tras su reciclado. Los archivos de esta rama permiten reconstruir la instalación.

## Auditoría y procedencia

- Linux x86_64, usuario root; Node 24.19.0, npm 11.9.0, Python 3.12.14 y Git 2.51.1. Node ya cumple los requisitos y no se actualizó.
- Registro previo `npx -y rea-agents@6.4.0 mcp`; instrucciones oficiales ausentes. No se encontró `rea` ni `codex` en PATH inicial.
- Repositorio oficial: https://github.com/morluto/rea. Licencia MIT. El README enlaza `rea-agents`; el campo npm `repository` apunta a ese repositorio. La versión publicada consultada fue 6.5.0. Commit de mantenimiento observado: `d7651b6a0dde6cfe658144cc52794ae6aaf23306`, 15/10/2026.
- Se descargó el tarball con `npm pack --ignore-scripts`, se revisaron manifiesto, launcher y `prepare.mjs`, y se verificó SHA-512 frente a los metadatos npm. Esta comprobación de integridad no sustituye una auditoría exhaustiva de cada dependencia.
- El launcher despacha `mcp` al runtime stdio compilado. `prepare.mjs` solo intenta Husky cuando existen fuentes y dicha dependencia. Todos los scripts de instalación se deshabilitaron; no se ejecutó un instalador remoto descargado con curl.
- Codex procede de `@openai/codex@0.162.1`, repositorio oficial `openai/codex`, licencia Apache-2.0. Se revisaron su manifiesto y launcher: selecciona el ejecutable oficial de la plataforma mediante dependencias opcionales.

## Cambios y comandos ejecutados

Instalación en prefijo separado, sin sustituir Node ni herramientas del sistema:

```bash
npm install --global --prefix /root/.local rea-agents@6.5.0 @openai/codex@0.162.1 --ignore-scripts --no-audit --no-fund
/root/.local/bin/rea setup --client codex --dry-run --json
/root/.local/bin/rea setup --client codex --yes --json
/root/.local/bin/rea doctor --client codex --skill --json
/root/.local/bin/rea doctor --json
/root/.local/bin/rea mcp doctor --json
/root/.local/bin/codex mcp get rea --json
```

Se instalaron 175 paquetes con la instalación conjunta; entre las dependencias de REA figuran MCP SDK 2.3.1, Babel parser 8.0.4 y playwright-core 1.58.2. No se descargaron navegadores ni motores de pago. npm avisó de `prebuild-install` obsoleto y de una opción heredada de proxy; no impidieron las pruebas realizadas. Las capacidades de dependencias nativas cuyos scripts se omitieron no se dan por verificadas.

Antes de escribir se guardó una copia privada con fecha en `/root/.rea/config-backups/`; setup conservó además su backup/recovery oficial. Se compararon los TOML antes/después, excluyendo solo `mcp_servers.rea`: **toda la configuración ajena permaneció idéntica**. No se publican esos archivos completos porque pueden contener configuración privada de otros servidores.

La configuración activa utiliza `/root/.local/bin/rea mcp`, timeout de arranque 30 s. Setup restauró el workflow oficial en `/root/.agents/skills/reverse-engineer-anything`, con referencias compatibles con 6.5.0. Instalar instrucciones no incorpora herramientas a una conversación ya iniciada. [Configuración portable sin secretos](codex-config.example.toml).

## Pruebas y evidencias

1. [Doctor MCP](evidence/mcp-doctor.json): `healthy=true`, protocolo `2025-11-25`, **207/207 herramientas y 6/6 prompts**, sin duplicados, diferencias de catálogo ni stderr. Petición real `binary_session` correcta.
2. [Doctor Codex + skill](evidence/scoped-doctor.json): `healthy=true`. El diagnóstico general no es saludable por la ausencia de proveedores; no implica un fallo del transporte MCP. [Resumen de motores](evidence/provider-summary.json).
3. [Descubrimiento real de Codex](evidence/codex-discovery.json): app-server conecta con REA 6.5.0 y devuelve 207 herramientas. [Inventario completo de nombres](TOOLS.md). Esto acredita descubrimiento, no ejecución de todas las operaciones ni uso desde un turno del modelo.
4. [Paquete público Video.js](evidence/videojs-mcp.json): `open_binary` y `inspect_artifact` ejecutados en la misma conexión SDK. ZIP de tres archivos sin modificar de `video.js@8.24.1` (manifiesto, licencia y bundle), SHA-256 `dced933cd1c98e06a1dafee80c7d82c57513b06f1096c9764b93516054c3ba59`. Evidencia `ev_8175e216dd9a751f6d2c7ead761e71fae56b83f0517ba77e660104bd0edf49cd`. **Se comprobó estructura de paquete; no se descompiló ni se ejecutó Video.js.**
5. [Fixture sintética reproducible](evidence/synthetic-mcp.json): manifiesto, función JS de suma y README sin datos personales. Evidencia `ev_097b8aa55fdb270f0f359b27828ddf07ffed2c1ff55bb02f4bafe5ff753bac5f`. Es una demostración identificada como tal, no un proyecto del usuario ni un resultado de mercado.
6. [Fallo JavaScript](evidence/javascript-blocker.json): el análisis llegó al inventario pero no completó el parseo. El `ps` existente falla al invocarlo desde el supervisor de Node. La documentación exige procps compatible. No se falsificó la lista de procesos ni se omitieron las protecciones. Requiere un host con proceso/procfs compatible; instalar Ghidra no resuelve este requisito.
7. Regresión de esta rama: `npm run check` correcto, `npm test` **19/19**, compilación sintáctica de ambos scripts Python correcta. No se ejecutaron pruebas hosted ni operaciones sobre datos reales.

## Uso futuro

En este contenedor: `/root/.local/bin/rea` y `/root/.local/bin/codex`. En un equipo propio compatible, revisar el plan de instalación y ejecutar los mismos paquetes con un prefijo del usuario, o utilizar la configuración portable fijada a 6.5.0. `rea setup --client codex --dry-run --json` muestra cambios; `--yes` aplica el alcance aprobado. Reiniciar Codex y consultar `/mcp`. Solicitud ejemplo: «Usa REA para inspeccionar estáticamente este ZIP autorizado, conserva el hash y explica sus límites». La ejecución desde un turno Codex sigue pendiente de validación aquí.

Prueba reproducible desde la raíz de este repositorio, cambiando las rutas según el equipo:

```bash
python scripts/rea-create-fixture.py /tmp/arx-rea-new-fixture.zip
node scripts/rea-mcp-probe.mjs /root/.local/lib/node_modules/rea-agents /tmp/arx-rea-new-fixture.zip /tmp/arx-rea-result.json
python scripts/rea-codex-probe.py /root/.local/bin/codex /tmp/arx-rea-new-fixture.zip /tmp/arx-codex-discovery.json
```

El último script comprueba descubrimiento sin pedir inferencia al modelo. `--call` intenta además crear un hilo efímero y ejecutar herramientas, y registra el fallo si no puede; esa variante **no pasó** en este entorno. Ambos clientes cierran sus procesos al terminar. No hay cron, automatizaciones, daemon configurado ni actividad periódica añadidos.

## Work y persistencia

La documentación oficial https://learn.chatgpt.com/docs/extend/mcp distingue el archivo local de Codex de los conectores de Work web: el chat alojado no lee automáticamente ese TOML. En esta sesión no hay un mecanismo expuesto para registrar arbitrariamente REA stdio como herramienta nativa. La búsqueda mediante Plugin Management no devolvió un plugin de REA identificable; no se instaló el resultado irrelevante.

Alternativa operativa comprobada: ejecutar REA por MCP SDK desde la terminal de Work. Una futura conexión nativa necesitaría un plugin/transporte soportado y su prueba desde el chat. No se abrió un puerto público ni se expuso el filesystem mediante un servidor sin autenticación. La app de escritorio en otro ordenador requerirá su propia instalación/configuración.

## Ecosistema ARX y siguientes aplicaciones

Localizados sin modificar: Ledger en `thepunisher7777/ledger-app`, checkout de diagnóstico; NEXO en el proyecto Sites `segundo-cerebro-angel`; RENTARX en Sites `rentarx`. No se atribuye un repositorio GitHub a los dos últimos sin evidencia. Revisión acotada de código/configuración local, no auditoría de sus despliegues actuales.

1. **Ledger — formatos de importación** (viabilidad alta, utilidad alta): estudiar snapshots/exportaciones ficticias autorizadas para validar estructura y compatibilidad. Se conserva la separación Personal/Pareja; para RLS, dinero y backups son preferibles pruebas de código e integridad. El checkout sigue usando almacenamiento personal local y módulos Pareja separados.
2. **NEXO — interoperabilidad de notas** (viabilidad alta, utilidad alta): examinar paquetes de exportación públicos o ficticios, diseñar mapeo Markdown/JSON/ICS y probar round-trip. En el código disponible D1/R2 usan revisiones y devuelven 409 ante escrituras en conflicto; REA no aporta más que la revisión de fuente para esa lógica.
3. **RENTARX — contratos de feeds autorizados** (viabilidad media, utilidad condicionada al permiso): inspeccionar ejemplos cedidos de JSON/XML y normalización. Su registro de conectores exige acuerdo vigente, hosts y cuota; no demuestra inventario de portales conectado. REA no concede licencias, acceso a APIs privadas ni permiso de extracción.

Coste incremental de lo ejecutado: sin servicio de pago contratado, sin llamadas a modelos ni claves nuevas, sin tareas programadas. El alojamiento/uso de Work existente y una futura máquina persistente se facturan según sus condiciones; no se promete coste total cero. Pendiente prioritario: validar un turno Codex completo en un host estable y compatible; después valorar Ghidra solo si existe una misión nativa concreta.
