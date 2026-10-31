# Skill `/design-review`

Skill de Claude Code que captura las pantallas de una feature y las sube a QA Reviewer. El flujo completo está en [`SKILL.md`](SKILL.md).

## Instalación

```bash
# 1. Copiar (o enlazar) la skill donde Claude Code la encuentra
ln -s "$(pwd)" ~/.claude/skills/design-review

# 2. Dependencias: Playwright con Chromium y pngjs
pnpm install
pnpm exec playwright install chromium

# 3. Credenciales (en el shell del dev, nunca en el repo)
export QA_REVIEWER_API_URL=https://…
export QA_REVIEWER_TOKEN=qa_pat_…   # QA Reviewer → Cuenta → Tokens, uno por proyecto
```

En el repo del producto, agrega `.design-review/` al `.gitignore`: guarda la sesión del navegador y las capturas.

## Scripts

| Script                       | Qué hace                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------- |
| `scripts/capture.mjs login`  | Abre un navegador para iniciar sesión a mano y guarda la sesión para las capturas.          |
| `scripts/capture.mjs run`    | Captura las pantallas del plan, tapa lo sensible, mide componentes y compara con la ronda anterior. |
| `scripts/capture.mjs keep`   | Guarda las capturas publicadas como ronda anterior.                                         |
| `scripts/client.mjs`         | Habla con el API: configuración del proyecto, publicar y traer el feedback.                 |

`pnpm test` corre las pruebas de `scripts/lib/` (validación del plan y zonas de cambio).
