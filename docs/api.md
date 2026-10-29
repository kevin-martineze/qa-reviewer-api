# Contrato HTTP

La fuente de verdad es el OpenAPI que genera el código: `GET /docs-json` (UI en `/docs`). Este documento fija las convenciones y el estado de cada grupo de endpoints. El detalle funcional por endpoint está en [`qa-reviewer/docs/architecture/api.md`](https://github.com/kevin-martineze/qa-reviewer/blob/main/docs/architecture/api.md).

## Convenciones

| Tema         | Regla                                                                                                                                               |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base         | `/v1`. Los healthchecks no llevan versión (`/healthcheck`).                                                                                         |
| Formato      | JSON en `camelCase`; fechas ISO 8601 UTC; ids string.                                                                                               |
| Éxito        | `{ "messageKey": "reviews.assigned", "data": … }`. Comandos sin cuerpo: `204`.                                                                      |
| Error        | `{ "statusCode": 409, "messageKey": "reviews.stale_status", "message": "…", "details"?: … }`. `message` va en español y la web lo muestra tal cual. |
| Validación   | `400 common.validation` con `details.fields: { campo: mensaje }`.                                                                                   |
| Permisos     | `403 auth.forbidden` con `details.permission`. Un recurso que no se puede leer responde `404`.                                                      |
| Concurrencia | `409` si el estado cambió entre la lectura y la escritura.                                                                                          |
| Paginación   | `?page=1&limit=20` → `{ items, pagination: { page, limit, total } }`.                                                                               |
| Idempotencia | `Idempotency-Key` obligatorio al crear revisiones y rondas; 24 h.                                                                                   |

## Autenticación

| Cliente | Header                            | Dónde sirve                            |
| ------- | --------------------------------- | -------------------------------------- |
| Web     | `Authorization: Bearer qa_sess_…` | Todo el API                            |
| Skill   | `Authorization: Bearer qa_pat_…`  | Solo endpoints marcados para la skill  |
| GitHub  | `X-Hub-Signature-256`             | `POST /v1/integrations/github/webhook` |

## Endpoints por grupo

| Grupo           | Endpoints                                                                                                                                                                                                                                  | Estado          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------- |
| Salud           | `GET /healthcheck`, `GET /healthcheck/readiness-probe`                                                                                                                                                                                     | Implementado    |
| Sesión y cuenta | `POST /auth/login`, `/auth/logout`, `/auth/logout-all`, `/auth/recovery`, `GET·POST /auth/recovery/:token`, `GET /invitations/:token`, `POST /invitations/:token/accept`, `GET·PATCH /me`, `PUT /me/password`                              | Implementado    |
| Storage local   | `GET·PUT /storage/*` (URLs firmadas; solo con `STORAGE_DRIVER=local`)                                                                                                                                                                      | Implementado    |
| Organización    | `GET /organization`, `GET /users`, `PATCH /users/:id`, `GET·POST /invitations`, `DELETE /invitations/:id`, `GET /audit`                                                                                                                    | En construcción |
| Proyectos       | `GET·POST /projects`, `GET·PATCH /projects/:id`, `GET·POST /projects/:id/members`, `PATCH·DELETE /projects/:id/members/:userId`                                                                                                            | En construcción |
| Revisiones      | `GET /reviews`, `GET·PATCH /reviews/:id`, `GET /reviews/:id/activity`, `PUT /reviews/:id/assignees`, `POST /reviews/:id/reopen`                                                                                                            | En construcción |
| Skill           | `POST /reviews`, `POST /reviews/:id/publish`, `POST /reviews/:id/rounds`, `GET /reviews/:id/feedback`                                                                                                                                      | En construcción |
| Feedback        | `PUT /reviews/:id/screens/:key/verdict`, `POST /reviews/:id/submit`, `GET /reviews/:id/comments`, `GET·POST /reviews/:id/screens/:key/comments`, `POST /comments/:id/replies`, `PATCH·DELETE /comments/:id`, `PUT /comments/:id/follow-up` | En construcción |
| Notificaciones  | `GET /notifications`, `GET /notifications/unread-count`, `POST /notifications/:id/read`, `POST /notifications/read-all`, `GET·PUT /me/notification-prefs`                                                                                  | En construcción |
| Tokens          | `GET·POST /tokens`, `DELETE /tokens/:id`                                                                                                                                                                                                   | En construcción |
| Métricas        | `GET /reports/overview`                                                                                                                                                                                                                    | En construcción |
| Integraciones   | `POST /integrations/github/webhook`                                                                                                                                                                                                        | En construcción |

## Catálogo de claves de error

| Clave                                               | Status    | Cuándo                                                        |
| --------------------------------------------------- | --------- | ------------------------------------------------------------- |
| `common.validation`                                 | 400       | Body, query o params no cumplen el esquema                    |
| `common.bad_request`                                | 400       | JSON mal formado u otro error de forma que detecta Fastify    |
| `common.not_found`                                  | 404       | Ruta inexistente                                              |
| `common.method_not_allowed`                         | 405       | Método no soportado en la ruta                                |
| `common.payload_too_large`                          | 413       | Cuerpo sobre el límite (10 MB para imágenes)                  |
| `common.unsupported_media`                          | 415       | `Content-Type` no aceptado                                    |
| `common.rate_limited`                               | 429       | Límite de peticiones superado                                 |
| `common.error`                                      | otro      | Error HTTP sin clave propia                                   |
| `common.internal`                                   | 500       | Error inesperado (el detalle queda en el log)                 |
| `auth.required`                                     | 401       | Falta el header `Authorization`                               |
| `auth.session_expired`                              | 401       | Sesión vencida, revocada o de un usuario inactivo             |
| `auth.invalid_token`                                | 401       | Token de la skill inválido o revocado                         |
| `auth.token_not_allowed`                            | 401       | Token de la skill en un endpoint que exige sesión             |
| `auth.invalid`                                      | 401       | Login con correo o contraseña incorrectos (o cuenta inactiva) |
| `auth.forbidden`                                    | 403       | Falta el permiso (`details.permission`)                       |
| `auth.wrong_password` · `auth.same_password`        | 400       | Cambio de contraseña                                          |
| `recovery.not_found` · `recovery.gone`              | 404 · 410 | Enlace de recuperación inexistente o vencido/usado            |
| `invite.not_found`                                  | 404       | Invitación inexistente                                        |
| `invite.expired` · `invite.used` · `invite.revoked` | 410       | Invitación que ya no sirve                                    |
| `users.exists`                                      | 409       | Ya hay una cuenta con ese correo                              |
| `users.not_found`                                   | 404       | La cuenta de la sesión ya no existe                           |
| `storage.invalid_signature` · `storage.mismatch`    | 403 · 422 | URL firmada vencida o archivo distinto de lo declarado        |
| `storage.not_found` · `storage.empty`               | 404 · 422 | Objeto inexistente o subida sin cuerpo                        |
| `health.unavailable`                                | 503       | Mongo o el storage no responden                               |

Las claves de los módulos en construcción se agregan aquí con su endpoint.
