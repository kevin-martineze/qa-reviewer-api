# qa-reviewer-api

API de **QA Reviewer**: el dev sube con una skill de Claude Code las pantallas que tocó su feature, diseño las revisa en la web y el feedback vuelve al PR, a la tarjeta y a la sesión del dev.

- Web: [`qa-reviewer`](https://github.com/kevin-martineze/qa-reviewer)
- Documentación: [`docs/`](docs/README.md)

## Arrancar en local

```bash
pnpm install
pnpm demo          # Mongo en memoria + datos de demo, en http://localhost:3000
```

La documentación interactiva queda en `http://localhost:3000/docs` y el contrato OpenAPI en `/docs-json`.

Para desarrollar con datos que sobreviven entre reinicios:

```bash
pnpm db            # terminal 1: Mongo local en .data/mongo
cp .env.example .env
pnpm seed          # carga la demo (una vez)
pnpm dev           # terminal 2: API con recarga
```
