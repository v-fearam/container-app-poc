# Dashboard NDv2 — Prototipo UI

Prototipo de UI para el dashboard operacional de Notificaciones Digitales v2.  
Datos 100% hardcodeados, sin APIs reales. Navegación completa entre secciones.

## Stack

- React + TypeScript
- Vite
- Tailwind CSS 4
- React Router 7
- Lucide React (íconos)
- Design System Camuzzi (variables CSS en `src/styles/variables.css`)

## Ejecutar localmente

```bash
cd src/prototype/dashboard
npm install
npm run dev
```

Abre http://localhost:5173

## Secciones implementadas

| Ruta | Página | Estado |
|------|--------|--------|
| `/` | Home — Resumen cross-vertical + tabs (Genéricos, Negocio, Campañas) | ✅ Completa |
| `/colas` | Estado de Service Bus (colas y suscripciones) | ✅ Completa |
| `/dlq` | DLQ Manager (selección múltiple, JSON viewer, acciones) | ✅ Completa |
| `/health` | Health (workers, Change Feed, Cosmos, SQL, colas) | ✅ Completa |
| `/config` | Configuración (placeholder CRUD por vertical) | ⚡ Mínima |
| `/scheduler` | Scheduler (jobs, historial expandible, detener/ejecutar) | ✅ Completa |
| `/genericos` | Detalle Genéricos | 🔜 Placeholder |
| `/negocio` | Detalle Negocio | 🔜 Placeholder |
| `/campanas` | Detalle Campañas | 🔜 Placeholder |

## Datos mock

Los datos hardcodeados están en `src/data/mockData.ts`. Incluyen:
- 4 tipos de comunicación genérica
- 3 lotes de negocio con convergencia
- 2 campañas
- 8 colas/suscripciones de Service Bus
- 10 workers con réplicas
- 6 jobs con schedule
- 4 mensajes DLQ con body JSON realista

## Requerimientos

Ver [`docs/dashboard-ndv2-requerimientos.md`](../../../docs/dashboard-ndv2-requerimientos.md) para el documento completo de requerimientos funcionales y de diseño.

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
