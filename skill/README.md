# Skill `/design-review`

Skill de Claude Code que captura las pantallas de una feature y las sube a QA Reviewer. El flujo completo está en [`SKILL.md`](SKILL.md).

## Instalación

La skill se instala como plugin de Claude Code y corre con la suscripción de cada persona. No necesita API key ni tokens copiados a mano.

```text
/plugin install qa-reviewer --marketplace kevin-martineze/qa-reviewer-api
```

En versiones anteriores a Claude Code 2.1.275, en dos pasos:

```text
/plugin marketplace add kevin-martineze/qa-reviewer-api
/plugin install qa-reviewer@qa-reviewer
```

Al instalarlo, Claude Code pide la URL del API de QA Reviewer (`/plugin configure qa-reviewer@qa-reviewer` la cambia) e instala Playwright y pngjs desde `package-lock.json`. Chromium se descarga una vez por equipo; la skill lo indica la primera vez.

Uso: `/qa-reviewer:design-review`, o pedirle a Claude «manda esto a revisión de diseño».

La primera vez que publica, la skill abre QA Reviewer en el navegador. La persona entra con su cuenta, elige el proyecto y aprueba (`/device`). La skill recibe un token del proyecto y lo guarda en `~/.config/qa-reviewer/credentials.json`. Se revoca en QA Reviewer → Cuenta → Tokens.

En el repo del producto, agrega `.design-review/` al `.gitignore`: guarda la sesión del navegador y las capturas.

### Desarrollo de la skill

```bash
npm ci                                   # dependencias (el lockfile es de npm: Claude Code solo instala desde ese)
node node_modules/playwright/cli.js install chromium
claude --plugin-dir ./skill              # desde la raíz del repo: carga el plugin sin instalarlo
claude plugin validate ./skill           # y `claude plugin validate .` para el marketplace
```

## Scripts

| Script                       | Qué hace                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------- |
| `scripts/capture.mjs login`  | Abre un navegador para iniciar sesión a mano y guarda la sesión para las capturas.          |
| `scripts/capture.mjs run`    | Captura las pantallas del plan, tapa lo sensible, mide componentes y compara con la ronda anterior. |
| `scripts/capture.mjs keep`   | Guarda las capturas publicadas como ronda anterior.                                         |
| `scripts/client.mjs`         | Habla con el API: configuración del proyecto, publicar y traer el feedback.                 |

`npm test` corre las pruebas de `scripts/lib/` (validación del plan y zonas de cambio).
