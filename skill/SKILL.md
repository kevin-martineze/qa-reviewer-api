---
name: design-review
description: Captura las pantallas que tocó la feature (antes y después), redacta qué mirar en cada una y las sube a QA Reviewer para que diseño las revise. Úsala cuando el dev pida /design-review o /qa-reviewer:design-review, «mandar a revisión de diseño» o subir una ronda nueva tras corregir. Con «status» trae el feedback de diseño a la sesión.
---

# /design-review

Sube a QA Reviewer las pantallas que cambió la feature para que diseño (UI/UX) las revise antes de producción. Cada vez que se corre sobre el mismo PR nace una ronda nueva, y solo se revisa lo que cambió.

- `/qa-reviewer:design-review`: captura, redacta y publica (ronda 1 o ronda siguiente).
- `/qa-reviewer:design-review status`: trae el feedback de la última ronda enviada.

La skill viene en el plugin `qa-reviewer`. Sus scripts están en `${CLAUDE_PLUGIN_ROOT}/scripts/`, y Claude Code instala sus dependencias (Playwright y pngjs) al instalar el plugin.

## Antes de empezar

1. **API:** `${user_config.api_url}`. Se configura al instalar el plugin (`/plugin configure qa-reviewer@qa-reviewer` la cambia), y la variable `QA_REVIEWER_API_URL` tiene prioridad.
2. **Cuenta:** no hace falta copiar ningún token. La primera vez, el cliente del API abre QA Reviewer en el navegador. El dev entra con su cuenta, elige el proyecto y aprueba. La skill guarda el token en `~/.config/qa-reviewer/credentials.json` (ver «API»). En CI, `QA_REVIEWER_TOKEN` lo reemplaza.
3. **`.gitignore`:** `.design-review/` va en el `.gitignore` del repo del producto, porque guarda la sesión del navegador (`auth.json`) y las capturas. Si no está, agrégalo antes de capturar.
4. **Chromium**, una vez por equipo: `node "${CLAUDE_PLUGIN_ROOT}/node_modules/playwright/cli.js" install chromium`. Si falta `node_modules` (plugin cargado con `--plugin-dir`), antes corre `cd "${CLAUDE_PLUGIN_ROOT}" && npm ci`.

## Flujo

### 1. Entender el cambio

- Lee el diff contra la rama base (`git diff <base>...HEAD`), la tarjeta (clave en el nombre de la rama, p. ej. `LIDER-628`) y el PR (`gh pr view --json number,url,title,baseRefName,headRefName,author,headRefOid`). Sin PR abierto, pide abrirlo: el manifiesto lo exige.
- Lista las pantallas que el cambio afecta de verdad: rutas cuyos componentes cambiaron. Por cada una, los estados que diseño necesita ver (vacío, con datos, edición, error, sin permiso). Un estado que no se puede reproducir con datos de prueba va a `notCaptured`, no se inventa.

### 2. Configuración del proyecto

- Pide al API los selectores a tapar, las reglas de diseño y los límites (ver «API»). Los `maskSelectors` del proyecto van siempre al plan; agrega los que veas en el diff que muestren datos de personas (nombres, documentos, correos, teléfonos, montos de clientes).
- La app debe correr con **datos de prueba**, nunca con datos reales. Si solo hay datos reales, detente y avisa.

### 3. Plan de captura

Escribe `.design-review/plan.json`:

```json
{
  "baseUrl": "http://localhost:5173",
  "beforeBaseUrl": "http://localhost:5174",
  "storageState": "auth.json",
  "maskSelectors": ["[data-sensitive]", ".patient-name"],
  "limits": { "maxScreens": 40, "viewport": { "min": 1024, "max": 1920 }, "maxBytes": 5242880 },
  "screens": [
    {
      "key": "edit-with-changes-1280",
      "route": "/preorders/[id]/products-services",
      "path": "/preorders/PRE-000118/products-services",
      "viewport": { "width": 1280, "height": 720 },
      "steps": [
        { "click": "button:has-text('Editar cantidades')" },
        { "fill": { "selector": "[data-qty-stepper] input >> nth=0", "value": "7" } }
      ],
      "elements": [
        {
          "name": "QuantityStepper",
          "file": "src/lib/components/QuantityStepper.svelte",
          "line": 42,
          "selector": "[data-qty-stepper]"
        }
      ]
    }
  ]
}
```

- `key`: minúsculas y guiones, **estable entre rondas** (misma pantalla, misma key). El API la usa para saber qué se recapturó y qué hereda su veredicto.
- `route` es el patrón de la ruta; `path`, la URL real con datos de prueba.
- `beforeBaseUrl`: la app en la rama base, si la puedes levantar (p. ej. un worktree en otro puerto). Sin ella no hay «antes»; `null` es válido.
- `steps`: uno por objeto, de `click`, `fill`, `hover`, `press`, `scroll`, `wait` (selector visible) o `waitMs`.
- `elements`: los componentes que cambiaron, cada uno con `file` y `line` del diff (obligatorios). El visor ancla comentarios a ellos y el feedback para Claude Code cita su archivo. Un componente del que no sabes el archivo no va en la lista.
- Anchos dentro de `limits.viewport`. Cubre al menos 1280 × 720; agrega 1024 y 1440 si el cambio afecta el layout.

### 4. Sesión del navegador

Si la app pide login y no hay `.design-review/auth.json`:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/capture.mjs" login http://localhost:5173/login --state .design-review/auth.json
```

Se abre un navegador: el dev inicia sesión con un usuario de prueba y cierra la pestaña.

### 5. Capturar

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/capture.mjs" run .design-review/plan.json
```

Deja `.design-review/out/captures/*.png` y `.design-review/out/screens.json`: por pantalla, `key`, `route`, `viewport`, `captures` (archivo, bytes y SHA-256), `elements` con su caja y, si hay ronda anterior en `.design-review/last/`, `diff` con las zonas que cambiaron.

- Revisa los avisos (`!`): un componente que no se ve suele ser un selector mal escrito o un paso que falta.
- **Mira cada captura** (léela como imagen) antes de seguir: que muestre el estado pedido, que no haya datos reales sin tapar y que no salga un error o un spinner. Si algo está mal, corrige el plan y vuelve a capturar.

### 6. Redactar el manifiesto

Escribe `.design-review/manifest.json` (manifiesto v1). Toma de `screens.json` lo medido y redacta el resto:

- `title`: qué cambió, en una línea para quien diseña (no el título del commit).
- `context`: dónde está (módulo · pantalla). `module`: nombre del módulo para listas y métricas.
- `summary.steps`: el recorrido del usuario en 2 a 5 pasos `{ title, body }`. `summary.rules`: reglas de negocio que explican lo que se ve.
- Por pantalla: `title`, `lead` (qué se ve y con qué datos), `changes` (qué cambió, concreto y visible), `questions` (lo que quieres que diseño decida). Sin jerga de código.
- Ronda 2 en adelante: `note` explica la ronda y `screens[].note` qué se corrigió en esa pantalla, respondiendo a los comentarios del feedback.
- `notCaptured`: estados que no se capturaron, con `{ title, body }`.
- `privacy`: `{ "masked": true, "dataset": "<nombre de los datos de prueba>" }`. Solo `true` si revisaste las capturas en el paso 5.
- `generator`: `{ "name": "design-review-skill", "version": "0.1.0" }`.
- Respeta las reglas de diseño del proyecto: si una pantalla rompe alguna, dilo en `questions` en lugar de esconderlo.

### 7. Publicar

Ver «API». Si la publicación salió bien, guarda las capturas como ronda anterior:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/capture.mjs" keep .design-review
```

Muestra al dev el enlace de la revisión, la ronda y cuántas pantallas cambiaron.

## /qa-reviewer:design-review status

Ver «API». Muestra el texto tal cual y propone el plan de corrección por pantalla, con archivo y línea. No corrijas sin que el dev lo pida.

## API

<!-- Sección a cargo del cliente del API (scripts/client.mjs): comandos project, submit y status, errores y reintentos. -->

_Pendiente: la escribe quien implementa `scripts/client.mjs`._
