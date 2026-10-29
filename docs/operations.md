# Operación

## Requisitos

- Node 22 y pnpm 10.
- Nada más en desarrollo: Mongo corre en memoria (`mongodb-memory-server`), las capturas en disco y el correo en la consola.
- En producción: MongoDB 7 con replica set (las transacciones lo exigen), un bucket S3 o compatible y, si se quiere correo, una cuenta de Resend.

## Modos de arranque

| Comando                    | Para qué                                                                            |
| -------------------------- | ----------------------------------------------------------------------------------- |
| `pnpm demo`                | API en `:3000` con Mongo en memoria y la demo cargada. Se pierde todo al detenerlo. |
| `pnpm db`                  | Mongo local persistente en `.data/mongo` (replica set `rs0`, puerto 27017).         |
| `pnpm dev`                 | API con recarga, contra `MONGO_URI` (con `pnpm db` corriendo).                      |
| `pnpm seed`                | Borra la base de `MONGO_URI` y carga la demo.                                       |
| `pnpm build && pnpm start` | Producción.                                                                         |

## Variables de entorno

Se validan con Joi al arrancar (`src/config/env.ts`): si falta algo obligatorio, el proceso no levanta. Plantilla: `.env.example`.

| Variable                                                                                                        | Por defecto             | Notas                                                     |
| --------------------------------------------------------------------------------------------------------------- | ----------------------- | --------------------------------------------------------- |
| `NODE_ENV`                                                                                                      | `development`           | `production` prohíbe `MONGO_URI=memory` y `SEED`          |
| `PORT`                                                                                                          | `3000`                  |                                                           |
| `MONGO_URI`                                                                                                     | —                       | Obligatoria. `memory` = Mongo en memoria                  |
| `SEED`                                                                                                          | vacío                   | `demo` borra la base y carga la demo al arrancar          |
| `PUBLIC_WEB_URL`                                                                                                | `http://localhost:5173` | Links en correos, PR y tarjetas; origen CORS por defecto  |
| `PUBLIC_API_URL`                                                                                                | `http://localhost:3000` | Base de las URLs firmadas del storage local               |
| `CORS_ORIGINS`                                                                                                  | vacío                   | Orígenes extra separados por coma                         |
| `SESSION_TTL_DAYS`                                                                                              | `7`                     | Vencimiento deslizante de la sesión                       |
| `STORAGE_DRIVER`                                                                                                | `local`                 | `local` o `s3`                                            |
| `STORAGE_DIR` · `STORAGE_SECRET`                                                                                | `.data/storage` · dev   | Storage local; el secreto es obligatorio en producción    |
| `S3_BUCKET` · `S3_REGION` · `S3_ENDPOINT` · `S3_ACCESS_KEY_ID` · `S3_SECRET_ACCESS_KEY` · `S3_FORCE_PATH_STYLE` |                         | S3 o compatible (MinIO, R2 con `S3_ENDPOINT`)             |
| `MAIL_DRIVER` · `MAIL_FROM` · `RESEND_API_KEY`                                                                  | `log`                   | `resend` exige la API key                                 |
| `GITHUB_API_URL` · `GITHUB_TOKEN` · `GITHUB_WEBHOOK_SECRET`                                                     |                         | Sin token, no se comenta en el PR ni se publica el check  |
| `PLANE_API_URL` · `PLANE_TOKEN` · `PLANE_WORKSPACE`                                                             |                         | Sin token, no se comenta en la tarjeta                    |
| `OUTBOX_INTERVAL_MS`                                                                                            | `5000`                  | Frecuencia del worker                                     |
| `JOBS_ENABLED`                                                                                                  | `true`                  | `false` apaga worker y jobs (pruebas, réplicas solo HTTP) |
| `RETENTION_DAYS`                                                                                                | `90`                    | Días que se conservan las capturas de revisiones cerradas |

## Semilla de demo

`seed/demo/` trae los mismos datos que el mock de la web: `data.json` (forma del contrato) y `assets/` (capturas anonimizadas y escenas SVG). Se regenera desde la web con `pnpm seed:export` en `qa-reviewer`; así ambos modos muestran lo mismo y las e2e sirven contra los dos.

Al cargar (`SEED=demo` o `pnpm seed`), `src/seed/demo-seed.ts`:

1. Borra la base y las capturas bajo `projects/`.
2. Corre todas las fechas en `ahora − exportedAt` (`shiftDates`): «hace 2 h» y «vence mañana» siguen siendo ciertos.
3. Guarda las contraseñas con Argon2id y los tokens de invitación, recuperación y skill como SHA-256, igual que en producción.
4. Sube cada captura a su clave del storage y lleva el contador `QR-` hasta la revisión más alta.

| Dato de prueba                     | Valor                                                                                         |
| ---------------------------------- | --------------------------------------------------------------------------------------------- |
| Contraseña de todas las cuentas    | `demo1234`                                                                                    |
| Invitaciones                       | `/invite/invite-valid-0001`, `invite-expired-0001`, `invite-used-0001`, `invite-revoked-0001` |
| Recuperación                       | `/recover/recover-valid-0001`, `recover-expired-0001`, `recover-used-0001`                    |
| Token de la skill (Kevin, Lideris) | `qa_pat_7f3a_demo_t1`                                                                         |

`pnpm seed` no corre con `NODE_ENV=production` ni con `MONGO_URI=memory`.

## Primer arranque en producción

1. Configura las variables (al menos `MONGO_URI`, `PUBLIC_WEB_URL`, `PUBLIC_API_URL`, el storage y `STORAGE_SECRET` si es local).
2. `pnpm bootstrap --org "Mi organización" --owner tu@correo.com --name "Tu nombre"` crea la organización y el owner y muestra un enlace para definir la contraseña. _(En construcción.)_
3. Desde la web, el owner crea proyectos, invita personas y emite tokens para la skill.

## Salud y observabilidad

- `GET /healthcheck`: el proceso responde.
- `GET /healthcheck/readiness-probe`: Mongo y el storage responden; si no, 503.
- Logs de Nest en consola. Los errores inesperados se registran con su stack y responden 500 sin detalles.
- Eventos `dead` en `qa_outbox` (`status: 'dead'`, `lastError`) son los que no se pudieron entregar tras 8 intentos.

## Webhook de GitHub

En el repo: _Settings → Webhooks → Add webhook_, URL `https://<api>/v1/integrations/github/webhook`, tipo `application/json`, secreto = `GITHUB_WEBHOOK_SECRET`, evento _Pull requests_. _(En construcción.)_
