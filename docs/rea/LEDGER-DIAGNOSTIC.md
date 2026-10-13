# Ledger: diagnóstico de integridad, importación y privacidad

13 de octubre de 2026. Repositorio `thepunisher7777/ledger-app`, base `38d81f9bee421824200ab209219e321fe5f36236`, rama `docs/rea-integrity-diagnostic`. Esta rama añade solo documentación. No se modifica producción, credenciales ni bases reales.

## Arquitectura y capacidades observadas

Aplicación estática HTML/JavaScript en GitHub Pages, service worker y localStorage. El espacio Personal conserva `flowfi.public.v27`; no necesita Auth para funcionar. Los módulos `couple-core.js`, `couple-sync.js`, `couple-ui.js`, `couple-auth.js` y migraciones SQL implementan el espacio Pareja separado. La identidad usuario/contraseña sin correo se resuelve mediante una Edge Function; las claves administrativas no forman parte del cliente.

- Importación: validación y deduplicación de JSON/CSV en la aplicación. `portfolio-import.js` es un **preview local** de Portfolio Performance XML: admite cuentas EUR/USD y tipos definidos, rechaza DTD/entidades externas, referencia incompleta, fechas/importes inválidos y archivos mayores de 10 MB. No equivale a importación completa de valores, transferencias o todos los formatos XML.
- Monedas: `money.js` convierte EUR/USD; ausencia de cambio válido produce NaN para importes no nulos, no un 1:1 inventado. El estado personal usa tipo de cambio configurado. Pareja exige `fx_rate`, `fx_date` y `fx_source` para reproducir operaciones históricas; no debe extrapolarse esa garantía automáticamente a todas las operaciones personales.
- Copias: validación, snapshot de seguridad y rollback en restauración; pruebas de JSON round-trip, entradas inválidas y errores de escritura. Persistencia local no elimina el riesgo de pérdida por borrado del navegador.
- Estadísticas/gráficos: proyecciones JS del estado en memoria; sin índices de base de datos para Personal. Las pruebas cubren distintas monedas y aislamiento de espacio; no se ha medido rendimiento con grandes históricos.
- Pareja: tablas públicas con RLS, membresía de exactamente dos usuarios y sesión válida; entidades y registros de actividad pertenecen a un espacio. Funciones sensibles restringidas y privilegios definidos en las migraciones. El cliente utiliza solo configuración pública.
- Sincronización: caché diferenciada por proyecto/usuario/espacio, cola de operaciones UUID, revisiones y conflictos explícitos, validación del cache y limpieza al cerrar sesión/revocar acceso. No se sobrescriben conflictos silenciosamente en el cliente probado.

## Pruebas ejecutadas

`npm ci --ignore-scripts` y `npm test`, todo aprobado: auditoría de interfaz/finanzas en seis idiomas, multidivisa y XML, service worker, assets, invitaciones, dominio, SQL/RLS con PGlite, HTTP de pruebas, dos usuarios/dispositivos ficticios, recuperación y límites. Incluye 20 pruebas de dominio/sincronización/HTTP y 12 pruebas de aislamiento/interfaz, además de los demás scripts.

Los mensajes deliberados de fallo de escritura corresponden a las pruebas negativas. No se ejecutaron los scripts `*:hosted`, no se llamó a la base Supabase real ni se creó un usuario real. No se verificó manualmente Safari/iPhone.

## Prioridades

| Acción | Impacto | Esfuerzo | Riesgo |
| --- | --- | --- | --- |
| Medir importación y gráficos con históricos ficticios grandes | Medio | Medio | Bajo |
| Completar mapeo PP XML solo con especificación/fixtures válidos | Medio | Alto | Medio |
| Versionar tipos históricos también en operaciones personales | Alto | Alto | Alto |
| Probar RLS con usuarios ficticios en un backend de staging | Alto | Medio | Medio |
| Definir backup remoto privado y recuperación opt-in | Alto | Alto | Alto |

REA aporta más valor para estudiar paquetes públicos de contabilidad o formatos de exportación autorizados que para revisar funciones propias con fuente disponible. Para aislamiento y dinero, pruebas de autorización, invariantes y restauración ofrecen evidencia más directa. Esta auditoría del repositorio no sustituye una validación del esquema actualmente desplegado.
