# Dashboard NDv2 — Documento de Requerimientos

> **Última actualización:** 11 de Agosto de 2026  
> **Estado:** Requerimientos — pendiente diseño UI  
> **Referencia:** [`arquitectura-ndv2.md`](../../notificaciones-digitales/docs/arquitectura-ndv2.md) (sección 7 — Dashboard Operacional)

---

## 1. Descripción General

La aplicación **"Notificaciones Digitales"** es un dashboard operacional para monitorear, configurar y gestionar las tres verticales de comunicaciones digitales: **Campañas**, **Genéricos** y **Negocio**.

Es la herramienta principal del equipo de operaciones. Debe permitir saber en todo momento qué está pasando, qué falló, qué está pendiente, y actuar cuando sea necesario.

---

## 2. Autenticación y Autorización

| # | Requerimiento |
|---|---------------|
| 2.1 | La aplicación usa **Easy Auth (Entra ID)** como mecanismo de autenticación. El usuario no ingresa credenciales en la app — la plataforma maneja el login. |
| 2.2 | Debe mostrarse en la UI quién está logueado (nombre, email). |
| 2.3 | El perfil del usuario debe mostrar los **roles asignados** en Entra ID. |
| 2.4 | Los roles definen qué secciones y acciones están disponibles (el diseño de roles queda fuera de este documento, pero la UI debe contemplar la existencia de roles). |

---

## 3. Navegación General

| # | Requerimiento |
|---|---------------|
| 3.1 | La aplicación tiene **tres verticales fijas**: Campañas, Genéricos, Negocio. |
| 3.2 | Debe existir navegación principal entre las secciones: Home, cada Vertical, Colas, DLQ Manager, Health, Configuración, Scheduler. |
| 3.3 | El usuario debe identificar en todo momento en qué sección y vertical se encuentra. Usar **breadcrumbs** debajo del header que reflejan la sección activa y el filtro aplicado (ej: `Home > Genéricos`, `DLQ Manager > nd-genericos`). Los breadcrumbs reflejan el contexto, no sub-rutas — el DLQ Manager es una sola vista con filtros. |

### Mapa de Rutas

| Ruta | Sección | Descripción |
|------|---------|-------------|
| `/` | 4. Home | Resumen cross-vertical + tabs por vertical |
| `/colas` | 5. Colas | Estado de Service Bus |
| `/dlq` | 6. DLQ Manager | Gestión de dead-letter queues |
| `/health` | 7. Health | Estado de infraestructura |
| `/config` | 8. Configuración | CRUD de procesos por vertical |
| `/scheduler` | 9. Scheduler | Gestión de jobs |
| `/genericos` | — | Vista detallada Genéricos (fuera del prototipo, ver sección 11) |
| `/negocio` | — | Vista detallada Negocio (fuera del prototipo) |
| `/campanas` | — | Vista detallada Campañas (fuera del prototipo) |

---

## 4. Home — Estado Actual

La home es la **vista de lo que está pasando ahora**. La fecha por defecto es **hoy**, pero el usuario puede seleccionar otra fecha o rango.

### 4.1 Genéricos

| # | Requerimiento |
|---|---------------|
| 4.1.1 | Mostrar contadores del día por estado: **Creadas, Enviadas, Entregadas, Rebotadas, Abiertas, Clickeadas, Descartadas** — desglosados **por tipo de comunicación y canal (email/SMS)** y un **total general**. |
| 4.1.2 | La DLQ de genéricos es **general** (una sola cola `nd-genericos`), no por tipo. Mostrar el contador de DLQ como un valor global. |
| 4.1.3 | Los tipos de comunicación son dinámicos (recupero-clave, validación-email, trámite, etc.) — vienen de la configuración. |

### 4.2 Negocio

| # | Requerimiento |
|---|---------------|
| 4.2.1 | Mostrar los **lotes activos del día** con su proceso de negocio (aviso-deuda, aviso-corte, vto-factura, etc.). |
| 4.2.2 | Por cada lote: mostrar **Generadores despertados/terminados** (indica si los 10 particionados por dígito arrancaron y terminaron). |
| 4.2.3 | Por cada tipo de proceso de negocio: **Creadas, Enviadas, Entregadas, Rebotadas, Abiertas, Clickeadas, Descartadas**. |
| 4.2.4 | Mostrar convergencia del lote: barra de progreso `(Entregadas + Rebotadas) / Enviadas`. |
| 4.2.5 | La DLQ de negocio es **general** (una sola cola `nd-negocio`), no por tipo de proceso. Mostrar como valor global. |

### 4.3 Campañas

| # | Requerimiento |
|---|---------------|
| 4.3.1 | Mostrar campañas activas/ejecutándose con su nombre y estado (programada, ejecutando, finalizada). |
| 4.3.2 | Por cada campaña: contadores de **Creadas, Enviadas, Entregadas, Rebotadas, Abiertas, Clickeadas, Descartadas**. |
| 4.3.3 | Convergencia igual que negocio. |
| 4.3.4 | La DLQ de campañas es **general** (`nd-campanas`). |

### 4.4 General Home

| # | Requerimiento |
|---|---------------|
| 4.4.1 | La home debe mostrar un **resumen cross-vertical** con los totales del día. |
| 4.4.2 | Selector de fecha (default: hoy). Poder navegar a días anteriores. |
| 4.4.3 | Indicadores visuales de problemas: DLQ con mensajes, lotes estancados, workers caídos. |
| 4.4.4 | **Nota sobre "Descartadas":** este estado se calcula en el momento de generación cuando una comunicación se descarta por match con lista gris, email inválido, tope diario alcanzado, etc. El counter updater recibe un evento `ComunicacionDescartada` que incrementa el contador. |
| 4.4.5 | **Layout de la Home:** primero el resumen cross-vertical (4.4.1) en Counter Cards, seguido de **tres tabs** (Genéricos, Negocio, Campañas) con el detalle de cada vertical según 4.1-4.3. |

---

## 5. Vista de Colas — Service Bus

| # | Requerimiento |
|---|---------------|
| 5.1 | Mostrar estado de **todas las queues y subscriptions** de Service Bus: mensajes activos, DLQ, scheduled, transfer DLQ. |
| 5.2 | Refresh automático configurable (default cada 30 segundos). |
| 5.3 | Indicador visual de semáforo: verde (0 DLQ), amarillo (1-10 DLQ), rojo (>10 DLQ). |
| 5.4 | Click en el contador de DLQ debe navegar al DLQ Manager filtrado por esa cola. |
| 5.5 | Colas esperadas: `nd-genericos`, `nd-negocio-generadores`, `nd-negocio`, `nd-campanas-generadores`, `nd-campanas`, `nd-eventos-recoleccion`, topics con subscriptions. |

---

## 6. DLQ Manager

| # | Requerimiento |
|---|---------------|
| 6.1 | Vista consolidada de los mensajes en DLQ de **todas las colas y suscripciones de topics** del Service Bus. Cada cola y cada suscripción tiene su propia DLQ — la UI debe listarlas todas (colas de envío, colas de generadores, suscripciones de dashboard-events, etc.). |
| 6.2 | Filtro por cola, por DeadLetterReason, por fecha. |
| 6.3 | **Paginación:** los mensajes se muestran paginados, ordenados por fecha de ingreso (más recientes primero). Tamaño de página configurable (25/50/100). Mostrar indicador "Mostrando X-Y de Z". Al descartar mensajes de la página actual, la vista se refresca automáticamente. |
| 6.4 | Inspección del body completo y propiedades del mensaje (DeadLetterReason, DeadLetterErrorDescription, delivery count, fecha de ingreso). El body se muestra en un panel/modal legible (JSON formateado). |
| 6.5 | **Re-encolar tal cual:** clonar el mensaje y enviarlo a la cola original sin modificaciones. |
| 6.6 | **Editar y re-encolar:** abrir el body del mensaje en un editor, permitir modificar el contenido, y re-encolar con el body editado. |
| 6.7 | **Descartar:** completar el mensaje de la DLQ sin re-enviarlo (eliminación definitiva). |
| 6.8 | **Selección múltiple:** checkbox por mensaje + "Seleccionar todos" (de la página visible). |
| 6.9 | **Descarte masivo:** descartar todos los mensajes seleccionados en una sola acción con confirmación. |
| 6.10 | **Re-encolar masivo:** re-encolar todos los seleccionados (sin edición, tal cual están). |
| 6.11 | **Feedback de acciones:** toda operación (re-encolar, descartar, masivo) muestra toast de éxito o error. En caso de error, los mensajes afectados permanecen seleccionados y se indica cuáles fallaron. |
| 6.12 | Exportar listado a Excel para análisis offline. |

---

## 7. Health — Estado de Infraestructura

| # | Requerimiento |
|---|---------------|
| 7.1 | Mostrar el estado de cada **Container App**: nombre, status, réplicas activas, máximo de réplicas, última revisión. |
| 7.2 | Mostrar el estado de cada **Container App Job**: nombre, tipo de trigger, expresión CRON, última ejecución (estado + fecha), ejecuciones corriendo. |
| 7.3 | Mostrar estado de **todas las colas y suscripciones** de Service Bus: mensajes activos, DLQ count. Incluye colas de envío, generadores, y **suscripciones del topic `nd-dashboard-events`** (es la fuente de datos del propio dashboard — su salud es crítica). |
| 7.4 | Mostrar estado de Cosmos DB (accesible sí/no). |
| 7.5 | Mostrar estado de SQL Server (accesible sí/no). |
| 7.6 | **Change Feed Processor:** documentos procesados hoy, errores del día, último documento procesado (timestamp), lag estimado. Es un indicador clave — si el Change Feed no procesa, el dashboard no se actualiza. |
| 7.7 | Refresh manual y automático. |
| 7.8 | Indicadores visuales: verde (healthy), amarillo (warning), rojo (error). |

---

## 8. Configuración de Procesos

Cada vertical tiene **múltiples tipos internos**, cada uno con su propia configuración almacenada en SQL Server. La UI debe permitir CRUD completo de estas entidades.

| # | Requerimiento |
|---|---------------|
| 8.1 | Sección de configuración **por vertical**. Al entrar se elige la vertical y se muestra la lista de sus tipos configurados. |
| 8.2 | **Genéricos** — CRUD de `TipoComunicacion`: nombre, template (HTML email o texto SMS), asunto, dominio de envío, canal (email/SMS), stored procedure de captura de datos, tag, parámetros requeridos del template. |
| 8.3 | **Negocio** — CRUD de `ProcesoNegocio`: nombre, template, stored procedure de cálculo (SP), tope diario, tabla de relación, sistemas asociados, particionado por dígito (configuración de cómo distribuir ejecución). |
| 8.4 | **Campañas** — Gestión de `Campania`: template, asunto, base de contactos (CSV upload o segmentación con parámetros), variables HTML, schedule (fecha/hora de generación y obtención), estado del lifecycle (borrador → programada → generando → lista → enviando → finalizada → cancelada). |
| 8.5 | En cada tipo, la UI debe mostrar claramente qué **stored procedure** ejecuta para capturar/calcular datos (genéricos y negocio). Este es un campo configurable — el operador define qué SP usar por tipo. |
| 8.6 | Configuración de **tabla de respuesta a eventos** (compartida o por vertical): qué hacer cuando llega un evento del proveedor (delivered → marcar entregado, bounced → invalidar email, opened → registrar apertura, etc.). CRUD de reglas evento→acción. |
| 8.7 | Gestión de **lista gris** (emails/teléfonos invalidados por bounce permanente, unsubscribe, complaint): ver listado paginado, buscar por contacto, agregar manualmente, quitar (rehabilitar). |
| 8.8 | **Búsqueda y filtro** en todas las listas de configuración: buscar por nombre, filtrar por estado (activo/inactivo). Las listas deben ser ordenables por columna (al menos nombre y fecha de última modificación). |
| 8.9 | **Validación de formularios:** errores inline debajo de cada campo con texto descriptivo y borde rojo (`error`). Los campos requeridos se marcan con asterisco. El botón de guardar se deshabilita si hay errores de validación. |
| 8.10 | **Eliminación de entidades:** borrar un tipo/proceso/campaña requiere confirmación con modal destructivo (13.8.6). Mencionar el nombre de la entidad en el texto de confirmación. |

---

## 9. Scheduler — Gestión de Jobs

| # | Requerimiento |
|---|---------------|
| 9.1 | Listar todos los jobs programados (Hangfire) con su CRON, próxima ejecución, última ejecución. |
| 9.2 | Habilitar / deshabilitar un job. |
| 9.3 | Modificar la expresión CRON de un job. |
| 9.4 | Disparar manualmente un job ("Ejecutar ahora"). |
| 9.5 | Ver historial de ejecuciones de un job en un **panel expandible** dentro de la fila (accordion). Columnas: fecha inicio, duración, estado (éxito/error/detenido), mensaje de error (si aplica). Mostrar las últimas 10 ejecuciones. |
| 9.6 | **Detener ejecución en curso:** si un job está running, el usuario puede pararlo desde la UI con un botón de "Detener". Requiere confirmación antes de ejecutar. |

---

## 10. Requerimientos No Funcionales

| # | Requerimiento |
|---|---------------|
| 10.1 | La aplicación corre como Container App con Easy Auth (platform-managed auth). |
| 10.2 | Polling periódico para datos en tiempo real (configurable, default 30s). |
| 10.3 | Diseño responsive (se usa principalmente en desktop pero no debe romperse en tablet). |
| 10.4 | Accesibilidad básica (contraste, navegación por teclado). Shortcuts adicionales para power users: `R` refresh, `Esc` cerrar modales. |
| 10.5 | Los datos hardcodeados del prototipo deben ser realistas (nombres de procesos, volúmenes típicos, estados reales). |
| 10.6 | La UI debe contemplar estados vacíos (sin lotes activos, sin DLQ, sin errores). |
| 10.7 | Idioma: Español. |
| 10.8 | **Dark mode** queda fuera de alcance del prototipo. Solo modo claro. |
| 10.9 | **Principio general de feedback:** toda acción del usuario que modifique estado (guardar config, ejecutar job, detener job, re-encolar, descartar, etc.) debe mostrar feedback visible via toast. No debe haber acciones silenciosas. |

---

## 11. Fuera de Alcance (Prototipo)

- No se llaman APIs reales. Datos hardcodeados con navegación simulada.
- No se implementa lógica de roles (solo se muestra el concepto en el perfil).
- No se implementan exportaciones reales (Excel).
- No se configuran alertas automáticas.
- Drill-down por comunicación individual (timeline Creada → Enviada → Delivered) queda para iteración futura.
- **Vistas detalladas por vertical** (`/genericos`, `/negocio`, `/campanas`) — historial de lotes, drill-down por tipo/proceso, análisis de rango de fechas. En el prototipo, estas rutas muestran un placeholder "Próximamente" con link de regreso a Home. Los enlaces existen en el sidebar para validar la navegación.

---

## 12. Datos de Referencia para el Prototipo

### Tipos de comunicación genérica
- Recupero de clave
- Validación de email
- Trámite
- Aviso genérico

### Procesos de negocio
- Aviso de Deuda
- Aviso de Corte
- Vto. Factura

### Campañas (ejemplo)
- Campaña Factura Digital 2026
- Campaña Cobrabilidad Julio

### Colas de Service Bus
- `nd-genericos`
- `nd-negocio-generadores`
- `nd-negocio`
- `nd-campanas-generadores`
- `nd-campanas`
- `nd-eventos-recoleccion`
- `nd-dashboard-events` (topic)
- `nd-bloqueos` (topic)

### Workers
- Worker Genérico (1→50)
- Worker Generadores Negocio (0→10)
- Worker Negocio (0→30)
- Worker Generadores Campaña (0→10)
- Worker Campaña (0→30)
- Worker Eventos (0→6)
- Worker Bloqueos (0→2)
- Worker Change Feed × 3 verticales (1→N)

### Mensajes DLQ de ejemplo

```json
// Mensaje 1 — MaxDeliveryCountExceeded (error transitorio que agotó reintentos)
{
  "comunicacionId": "com-8f3a-4b2c-9d1e",
  "tipoProceso": "recupero-clave",
  "canal": "email",
  "contacto": "usuario@ejemplo.com",
  "template": "recupero-clave-v2",
  "parametros": { "nombre": "Juan Pérez", "token": "abc123" }
}
// DeadLetterReason: MaxDeliveryCountExceeded
// DeadLetterErrorDescription: "Receiver side - delivery count exceeded: 10"
// DeliveryCount: 10
// EnqueuedTime: 2026-08-11T08:30:15Z

// Mensaje 2 — Error de procesamiento (schema inválido)
{
  "comunicacionId": "com-1a2b-3c4d-5e6f",
  "tipoProceso": "aviso-deuda",
  "loteId": "lote-2026-08-11-aviso-deuda",
  "contacto": "cliente@empresa.com",
  "parametros": { "monto": null, "vencimiento": "2026-09-01" }
}
// DeadLetterReason: ProcessingError
// DeadLetterErrorDescription: "Campo 'monto' es requerido para template aviso-deuda-v3"
// DeliveryCount: 1
// EnqueuedTime: 2026-08-11T09:15:42Z

// Mensaje 3 — Error de proveedor (Mailgun timeout)
{
  "comunicacionId": "com-7g8h-9i0j-1k2l",
  "tipoProceso": "vto-factura",
  "loteId": "lote-2026-08-11-vto-factura",
  "canal": "email",
  "contacto": "admin@corp.com",
  "template": "vto-factura-v1"
}
// DeadLetterReason: MaxDeliveryCountExceeded
// DeadLetterErrorDescription: "Mailgun API timeout after 30s — HttpRequestException"
// DeliveryCount: 10
// EnqueuedTime: 2026-08-11T10:02:08Z
```

---

## 13. Diseño Visual y Sistema de Diseño

### 13.1 Fuente de Verdad: Camuzzi Design System

El prototipo debe construirse usando los tokens del **Camuzzi Design System** (`tokens.json`). Todas las variables CSS se generan desde estos tokens — no se hardcodean colores ni tipografía fuera del sistema.

**Skills de referencia:**
- `camuzzi-ui-skill` — Tokens, variables CSS, clases base (`.cam-btn`, `.cam-card`, `.cam-header`)
- `ui-ux-pro-max` — Guidelines de UX, accesibilidad, interacción, layout

### 13.2 Paleta de Colores

Los colores provienen de `tokens.json` y se consumen vía variables CSS:

| Token | Variable CSS | Hex | Uso |
|-------|-------------|-----|-----|
| `brand.primary` | `--color-brand-primary` | `#0066B3` | Acciones principales, sidebar activo, links, botones primarios |
| `brand.secondary` | `--color-brand-secondary` | `#00AEEF` | Acentos, hover, elementos secundarios |
| `brand.light` | `--color-brand-light` | `#00B5FF` | Highlights, badges informativos |
| `brand.dark` | `--color-brand-dark` | `#1E3462` | Sidebar background, headers, texto de alto impacto |
| `brand.darker` | `--color-brand-darker` | `#00335D` | Fondo del sidebar, elementos de máximo contraste |
| `brand.accent` | `--color-brand-accent` | `#50FFD4` | Call-to-action destacados, indicadores activos |
| `neutral.white` | `--color-neutral-white` | `#FFFFFF` | Fondo de contenido, cards |
| `neutral.text` | `--color-neutral-text` | `#333333` | Texto principal del body |
| `neutral.textStrong` | `--color-neutral-textStrong` | `#1E3462` | Títulos, headings (coincide con brand.dark) |
| `neutral.muted` | `--color-neutral-muted` | `#64748B` | Texto secundario, labels, timestamps (ajustado para contraste 4.5:1 sobre fondos claros) |
| `neutral.border` | `--color-neutral-border` | `#E0E0E0` | Bordes de cards, separadores, dividers |

**Colores semánticos** (definir para el prototipo):

| Semántico | Hex propuesto | Uso |
|-----------|--------------|-----|
| `success` | `#22C55E` | Health OK, enviados, entregados, jobs exitosos |
| `warning` | `#F59E0B` | DLQ 1-10, lotes parciales, replicas bajas |
| `error` | `#EF4444` | DLQ >10, workers caídos, errores, jobs fallidos |
| `info` | `#3B82F6` | Contadores neutros, tooltips, información |

### 13.3 Tipografía

| Token | Variable CSS | Valor |
|-------|-------------|-------|
| Font family | `--font-family-brand` | `Roboto, Arial, Tahoma, system-ui, sans-serif` |
| H1 | `--font-size-h1` | `32px` — título de sección principal |
| H2 | `--font-size-h2` | `24px` — título de sub-sección/vertical |
| H3 | `--font-size-h3` | `20px` — título de card/grupo |
| H4 | `--font-size-h4` | `16px` — label de widget |
| Body | `--font-size-body` | `14px` — texto general, tablas |
| Body Large | `--font-size-bodyLg` | `16px` — botones, texto destacado |

**Guidelines tipográficas (ui-ux-pro-max):**
- Line-height: `1.5` para body text (mínimo para legibilidad)
- Longitud de línea: máximo 75 caracteres por línea
- Font-weight: `400` regular para body, `500` medium para labels, `600` semibold para subtítulos, `700` bold para headings

### 13.4 Espaciado y Bordes

| Token | Variable CSS | Valor |
|-------|-------------|-------|
| `spacing.base` | — | `8px` (unidad base) |
| `spacing.1` | `--space-1` | `8px` — gap mínimo |
| `spacing.2` | `--space-2` | `16px` — gap estándar entre elementos |
| `spacing.3` | `--space-3` | `24px` — padding de cards, secciones |
| `spacing.4` | `--space-4` | `32px` — separación entre secciones |
| `spacing.5` | `--space-5` | `40px` — margen vertical entre bloques |
| `radius.sm` | `--radius-sm` | `4px` — badges, chips, inputs |
| `radius.md` | `--radius-md` | `8px` — botones, dropdowns |
| `radius.lg` | `--radius-lg` | `16px` — cards, modales |

**Sombras:**
- `--shadow-sm`: `0 1px 2px rgba(0,0,0,0.08)` — cards en reposo
- `--shadow-md`: `0 4px 12px rgba(0,0,0,0.12)` — cards en hover, modales, dropdowns

### 13.5 Layout General

| # | Directiva |
|---|-----------|
| 13.5.1 | **Sidebar fija** a la izquierda con fondo `brand.darker` (`#00335D`). Ancho: 240px colapsada a 64px en modo compacto. Texto e íconos en blanco. |
| 13.5.2 | **Header horizontal** superior (64px de alto) con fondo blanco, borde inferior sutil (`neutral.border`). Muestra: título de la sección actual, usuario logueado a la derecha. La selección de vertical dentro de Home se maneja con tabs en el contenido (4.4.5), no en el header. |
| 13.5.3 | **Área de contenido** con fondo `neutral.background` (`#F8FAFC` — gris muy claro, no blanco puro) para diferenciar del fondo de cards. Padding: `--space-3` (24px). Este color se agrega como `--color-neutral-background` al generar variables. |
| 13.5.4 | **Cards** (`.cam-card`) como contenedores principales de datos: fondo blanco, borde-radius `--radius-lg` (16px), sombra `--shadow-sm`. |
| 13.5.5 | **Max-width:** el área de contenido tiene un máximo de `1440px` (pantallas ultra-wide). Dentro, el wrapper `.cam-container` (1200px) centra el contenido principal. En secciones con tablas anchas (DLQ, Config), el contenido puede extenderse hasta los 1440px. |
| 13.5.6 | **Breakpoints**: Desktop (≥1024px — uso principal), Tablet (768px-1023px — sidebar colapsada), Mobile (≤767px — sidebar oculta, hamburger menu). |
| 13.5.7 | **Tablas en pantallas pequeñas:** en tablet, las tablas mantienen scroll horizontal dentro de su card. No se ocultan columnas ni se transforman a cards — el uso principal es desktop. |

### 13.6 Componentes Base (Camuzzi UI)

Usar las clases del design system:

| Componente | Clase | Uso en el dashboard |
|------------|-------|---------------------|
| Botón primario | `.cam-btn .cam-btn--primary` | Acciones principales: Re-encolar, Guardar, Ejecutar |
| Botón secundario | `.cam-btn .cam-btn--secondary` | Acciones secundarias: Filtrar, Exportar |
| Botón ghost | `.cam-btn .cam-btn--ghost` | Acciones terciarias: Cancelar, Limpiar filtros |
| Card | `.cam-card` | Cada widget, tabla, grupo de contadores |
| Header | `.cam-header` | Barra superior |
| Container | `.cam-container` | Wrapper de contenido (max-width 1200px) |
| Stack | `.cam-stack` | Layouts verticales (flex column, gap 16px) |
| Row | `.cam-row` | Layouts horizontales (flex row, gap 16px) |

**Componentes adicionales a definir** (no están en camuzzi-ui base):

| Componente | Descripción |
|------------|-------------|
| **Counter Card** | Número grande (h1) + label (body) + ícono. Variantes por color semántico. |
| **Status Badge** | Chip con color semántico: `success` (verde), `warning` (amarillo), `error` (rojo), `info` (azul). Border-radius `--radius-sm`. |
| **Data Table** | Tabla con headers sticky, filas alternas (zebra), hover en fila, checkboxes para selección múltiple. |
| **Sidebar Nav Item** | Ícono + texto, hover con fondo semi-transparente, activo con borde izquierdo `brand.accent`. |
| **Progress Bar** | Barra de convergencia con % y colores (verde ≥80%, amarillo 50-79%, rojo <50%). |
| **Semáforo** | Dot circular 12px con color semántico. Usado en colas y health. |
| **Modal/Dialog** | Overlay oscuro, card centrada, botones de acción abajo. Para confirmaciones y edición de mensajes. |
| **Toast / Notification** | Notificación breve que aparece arriba a la derecha, stackeable. **Success/warning:** auto-dismiss 5s. **Error:** persiste hasta dismiss manual (botón X) — el usuario necesita leer y actuar. Variantes por color semántico. |
| **Breadcrumb** | Ruta de navegación: `Home > DLQ Manager > nd-genericos`. Debajo del header, sobre el contenido. |
| **JSON Viewer** | Bloque monospace con syntax highlighting básico para inspección de mensajes DLQ (read-only). |
| **JSON Editor** | Textarea monospace editable para modificar el body de un mensaje DLQ antes de re-encolar. Validación de JSON válido antes de permitir el envío. |
| **Date Picker** | Input de fecha con ícono de calendario. Default: hoy. |
| **Tabs** | Para switching entre verticales dentro de una sección. Estilo underline con `brand.primary`. |

### 13.7 Iconografía

| # | Directiva |
|---|-----------|
| 13.7.1 | Usar **Lucide Icons** (SVG, consistente, 24×24 viewBox). No usar emojis como íconos de UI. |
| 13.7.2 | Íconos con `w-5 h-5` (20px) en sidebar y botones, `w-4 h-4` (16px) en inline/tablas. |
| 13.7.3 | Color de ícono hereda del texto (`currentColor`), excepto íconos semánticos (verde/rojo/amarillo). |

### 13.8 Interacción y Estados (ui-ux-pro-max)

| # | Directiva |
|---|-----------|
| 13.8.1 | **Hover:** todos los elementos clickeables deben tener `cursor: pointer` y feedback visual (cambio de color, sombra `--shadow-md`, o background sutil). |
| 13.8.2 | **Transiciones:** `transition: all 200ms ease` para micro-interacciones. No usar transiciones >300ms. |
| 13.8.3 | **Focus:** visible focus ring (`outline: 2px solid var(--color-brand-secondary)`, offset 2px) en todos los elementos interactivos para navegación por teclado. |
| 13.8.4 | **Loading:** skeleton screens para datos que están cargando (no spinners genéricos). Reservar espacio para evitar content jumping. |
| 13.8.5 | **Estados vacíos:** ilustración o ícono + mensaje descriptivo ("No hay mensajes en DLQ", "Sin lotes activos hoy"). No dejar secciones en blanco. |
| 13.8.6 | **Confirmación destructiva:** acciones de descarte (individual y masivo) requieren modal de confirmación con texto que indique cuántos mensajes se van a descartar. Botón de confirmar en rojo (`error`). |
| 13.8.7 | **Touch targets:** mínimo 44×44px para áreas clickeables (botones, checkboxes, ítems de menú). |
| 13.8.8 | **Disabled buttons:** durante operaciones async (re-encolar, descartar), el botón se deshabilita y muestra estado de carga. |
| 13.8.9 | **`prefers-reduced-motion`:** respetar la preferencia del usuario — desactivar transiciones si está activa. |

### 13.9 Accesibilidad (CRITICAL — ui-ux-pro-max)

| # | Directiva |
|---|-----------|
| 13.9.1 | **Contraste mínimo:** 4.5:1 para texto normal, 3:1 para texto grande (≥18px bold). Verificar combinaciones brand.primary sobre blanco (ratio 4.9:1 ✓). |
| 13.9.2 | **Color no es el único indicador:** los semáforos (verde/amarillo/rojo) deben tener también ícono o texto complementario. Un usuario daltónico debe poder distinguir estados. |
| 13.9.3 | **Labels en formularios:** todo input tiene `<label>` con atributo `for`. |
| 13.9.4 | **aria-label** en botones de solo ícono (ej: botón de refresh, cerrar modal, expandir sidebar). |
| 13.9.5 | **Tab order** sigue el orden visual de la página. |
| 13.9.6 | **Alt text** en imágenes significativas; decorativas con `alt=""`. |

### 13.10 Stack Técnico del Prototipo

| # | Directiva |
|---|-----------|
| 13.10.1 | **React + TypeScript + Vite** (mismo stack que el POC existente). |
| 13.10.2 | **Tailwind CSS** para utilities de layout y spacing, combinado con variables CSS del design system Camuzzi. |
| 13.10.3 | **shadcn/ui** como library de componentes base cuando un componente complejo lo justifique (Tabs, Dialog, DropdownMenu, Table). Estilizar con los tokens Camuzzi. |
| 13.10.4 | **Lucide React** para íconos. |
| 13.10.5 | **React Router** para navegación entre secciones. |
| 13.10.6 | Los datos son **100% hardcodeados** — no hay fetch, no hay APIs. Los datos viven en archivos `.ts` con tipos definidos. |
| 13.10.7 | Las clases base de Camuzzi (`.cam-btn`, `.cam-card`, `.cam-header`) se importan via `variables.css` + `base.css` generados por el skill. |

### 13.11 Navegación del Sidebar

El sidebar tiene los siguientes ítems agrupados:

| Grupo | Ítem | Ícono (Lucide) | Ruta |
|-------|------|-----------------|------|
| **Operación** | Home | `LayoutDashboard` | `/` |
| | Colas | `ListOrdered` | `/colas` |
| | DLQ Manager | `AlertTriangle` | `/dlq` |
| **Verticales** | Genéricos | `Mail` | `/genericos` |
| | Negocio | `Building2` | `/negocio` |
| | Campañas | `Megaphone` | `/campanas` |
| **Administración** | Health | `HeartPulse` | `/health` |
| | Configuración | `Settings` | `/config` |
| | Scheduler | `Clock` | `/scheduler` |

- Las rutas `/genericos`, `/negocio`, `/campanas` son **vistas detalladas** de cada vertical (historial de lotes, drill-down por tipo/proceso). En el prototipo muestran placeholder "Próximamente" (ver sección 11). La Home muestra el **resumen del día** con tabs.
- Los grupos tienen un label de texto en gris muted (`--color-neutral-muted`), separados por un divider sutil.
- El ítem activo tiene borde izquierdo de 3px en `brand.accent` (`#50FFD4`) y fondo semi-transparente.
- Al bottom del sidebar: avatar del usuario + nombre + rol principal.
