# NEXO: diagnóstico de persistencia e integridad

13 de octubre de 2026. Snapshot del repositorio privado de Sites existente, base `6f8a67f6d4bc93ebd780a07294eea79a128ea066`. No hay un repositorio GitHub de NEXO entre los repositorios accesibles del propietario. Se trabaja en el worktree `docs/rea-storage-diagnostic`; no se ha desplegado ni leído la base real.

## Hechos confirmados en código

- Interfaz principal HTML/JavaScript (`app/brain-html.ts`, `public/nexo-*.js`) servida por Vinext/React en Cloudflare Workers. D1 guarda revisiones y referencias; R2 contiene snapshots y adjuntos privados.
- `lib/brain-state.ts`: todas las consultas pertenecen al usuario autenticado. Las escrituras comparan la revisión esperada; un conflicto devuelve 409 y elimina el snapshot huérfano. No existe merge automático por campo.
- `lib/backups.ts`: backups por usuario con SHA-256, lectura de verificación y validación del payload antes de restaurar. La restauración requiere confirmación y revisión; conserva un backup previo.
- Búsqueda UI en `public/nexo-core.js`: coincidencia de todos los términos, normalización de acentos, metadatos y etiquetas. Es un escaneo de registros en memoria, no búsqueda semántica ni índice. `brain_search` del MCP utiliza una implementación distinta basada en texto; existe una divergencia que conviene unificar.
- Memoria RAW/WIKI/OUTPUT, notas/tareas, calendario, estudio y lista de compra están representados en estructuras existentes; tests de núcleo y servidor validan casos relevantes.
- Offline: `public/nexo-sw.js` cachea assets, excluye API privada y devuelve 503 si un asset no está disponible. No cachea el documento autenticado para primer arranque ni guarda la colección privada en IndexedDB. La demo usa almacenamiento local, pero eso NO demuestra edición offline operativa del espacio privado real.
- Los formularios conservan borrador frente a fallo/conflicto en las pruebas. La colección privada exige conexión para editar; sincronización segura existe a nivel de revisión completa, no de edición colaborativa por campo.

## Validación de esta sesión

`node --test tests/*.test.mjs`: 42 pruebas aprobadas, 0 fallos. El worktree carecía inicialmente de dependencias; se reutilizaron las instaladas del checkout original, sin cambiar package.json ni lockfile. Pruebas con datos ficticios y mocks de almacenamiento: no se consultó ni modificó D1/R2 de producción. No se probó un iPhone físico ni una PWA instalada.

## Próximas acciones

| Acción | Impacto | Esfuerzo | Riesgo |
| --- | --- | --- | --- |
| Unificar búsqueda UI/MCP y documentar límites | Medio | Bajo | Bajo |
| Diseñar caché privada opt-in, cifrado y borradores offline | Alto | Alto | Alto |
| Conflictos por ficha con comparación y revisión explícita | Alto | Alto | Alto |
| Paginar backups y definir retención recuperable | Medio | Medio | Medio |
| Revisar contexto precargado de servidor y su exposición | Alto | Medio | Medio |

REA no mejora el análisis ordinario de este código disponible. Sería útil para comparar un artefacto publicado con el código, localizar un fallo en un bundle de terceros o estudiar un formato autorizado. No se ha afirmado análisis REA de los datos personales ni del backend real.
