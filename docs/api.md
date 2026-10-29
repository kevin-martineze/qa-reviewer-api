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
| Listas       | Un filtro con varios valores se repite: `?status=open&status=in_review`. Un solo valor también sirve.                                               |
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
| Organización    | `GET /organization`, `GET /users`, `PATCH /users/:id`, `GET·POST /invitations`, `DELETE /invitations/:id`, `GET /audit`                                                                                                                    | Implementado    |
| Proyectos       | `GET·POST /projects`, `GET·PATCH /projects/:id`, `GET·POST /projects/:id/members`, `PATCH·DELETE /projects/:id/members/:userId`                                                                                                            | Implementado    |
| Revisiones      | `GET /reviews`, `GET·PATCH /reviews/:id`, `GET /reviews/:id/activity`, `PUT /reviews/:id/assignees`, `POST /reviews/:id/reopen`                                                                                                            | Implementado    |
| Skill           | `POST /reviews`, `POST /reviews/:id/publish`, `POST /reviews/:id/rounds`, `GET /reviews/:id/feedback`                                                                                                                                      | En construcción |
| Feedback        | `PUT /reviews/:id/screens/:key/verdict`, `POST /reviews/:id/submit`, `GET /reviews/:id/comments`, `GET·POST /reviews/:id/screens/:key/comments`, `POST /comments/:id/replies`, `PATCH·DELETE /comments/:id`, `PUT /comments/:id/follow-up` | En construcción |
| Notificaciones  | `GET /notifications`, `GET /notifications/unread-count`, `POST /notifications/:id/read`, `POST /notifications/read-all`, `GET·PUT /me/notification-prefs`                                                                                  | En construcción |
| Tokens          | `GET·POST /tokens`, `DELETE /tokens/:id`                                                                                                                                                                                                   | En construcción |
| Métricas        | `GET /reports/overview`                                                                                                                                                                                                                    | En construcción |
| Integraciones   | `POST /integrations/github/webhook`                                                                                                                                                                                                        | En construcción |

## Catálogo de claves de error

| Clave                                               | Status    | Cuándo                                                                      |
| --------------------------------------------------- | --------- | --------------------------------------------------------------------------- |
| `common.validation`                                 | 400       | Body, query o params no cumplen el esquema                                  |
| `common.bad_request`                                | 400       | JSON mal formado u otro error de forma que detecta Fastify                  |
| `common.not_found`                                  | 404       | Ruta inexistente                                                            |
| `common.method_not_allowed`                         | 405       | Método no soportado en la ruta                                              |
| `common.payload_too_large`                          | 413       | Cuerpo sobre el límite (10 MB para imágenes)                                |
| `common.unsupported_media`                          | 415       | `Content-Type` no aceptado                                                  |
| `common.rate_limited`                               | 429       | Límite de peticiones superado                                               |
| `common.error`                                      | otro      | Error HTTP sin clave propia                                                 |
| `common.internal`                                   | 500       | Error inesperado (el detalle queda en el log)                               |
| `auth.required`                                     | 401       | Falta el header `Authorization`                                             |
| `auth.session_expired`                              | 401       | Sesión vencida, revocada o de un usuario inactivo                           |
| `auth.invalid_token`                                | 401       | Token de la skill inválido o revocado                                       |
| `auth.token_not_allowed`                            | 401       | Token de la skill en un endpoint que exige sesión                           |
| `auth.invalid`                                      | 401       | Login con correo o contraseña incorrectos (o cuenta inactiva)               |
| `auth.forbidden`                                    | 403       | Falta el permiso (`details.permission`)                                     |
| `auth.wrong_password` · `auth.same_password`        | 400       | Cambio de contraseña                                                        |
| `recovery.not_found` · `recovery.gone`              | 404 · 410 | Enlace de recuperación inexistente o vencido/usado                          |
| `invite.not_found`                                  | 404       | Invitación inexistente                                                      |
| `invite.expired` · `invite.used` · `invite.revoked` | 410       | Invitación que ya no sirve                                                  |
| `users.exists`                                      | 409       | Ya hay una cuenta con ese correo                                            |
| `users.not_found`                                   | 404       | La persona no existe (o la cuenta de la sesión ya no existe)                |
| `users.self`                                        | 409       | Cambiar el estado o el rol de la propia cuenta                              |
| `users.owner`                                       | 409       | Desactivar al owner                                                         |
| `users.changed`                                     | 409       | La cuenta cambió entre la lectura y la escritura                            |
| `users.inactive`                                    | 409       | Agregar a un proyecto una cuenta desactivada                                |
| `organization.not_found`                            | 404       | La instalación no tiene organización (falta el bootstrap)                   |
| `invite.pending`                                    | 409       | Ya hay una invitación vigente para ese correo                               |
| `invite.invalid_projects`                           | 400       | La invitación nombra proyectos que no existen                               |
| `projects.not_found`                                | 404       | Proyecto inexistente o que la persona no puede ver                          |
| `projects.exists`                                   | 409       | Ya hay un proyecto con ese slug                                             |
| `projects.invalid_rules`                            | 400       | Regla por módulo hacia alguien que no es miembro (`details.userIds`)        |
| `members.not_found` · `members.exists`              | 404 · 409 | La persona no es miembro, o ya lo es                                        |
| `members.self`                                      | 409       | Quitarse a uno mismo del proyecto                                           |
| `reviews.not_found`                                 | 404       | Revisión inexistente, sin publicar o que la persona no ve                   |
| `reviews.stale_status`                              | 409       | El estado no permite el comando o cambió entre medio                        |
| `reviews.invalid_assignees`                         | 400       | Asignados que no son diseñadores activos o son el autor (`details.userIds`) |
| `storage.invalid_signature` · `storage.mismatch`    | 403 · 422 | URL firmada vencida o archivo distinto de lo declarado                      |
| `storage.not_found` · `storage.empty`               | 404 · 422 | Objeto inexistente o subida sin cuerpo                                      |
| `health.unavailable`                                | 503       | Mongo o el storage no responden                                             |

Las claves de los módulos en construcción se agregan aquí con su endpoint.

## Reglas de organización y proyectos

- `PATCH /users/:id` lleva exactamente uno de `status` u `orgRole`. Nadie cambia su propia cuenta; el owner no se desactiva; dar o quitar el rol owner exige `org:manage`.
- Desactivar a una persona cierra sus sesiones y revoca sus tokens de la skill en la misma transacción. Reactivarla no los devuelve.
- Invitar como owner exige `org:manage`. Un correo con cuenta o con invitación vigente responde `409`; una invitación vencida no bloquea invitar de nuevo. El enlace llega por el outbox (`InvitationCreated`).
- Quien no ve un proyecto recibe `404` en el proyecto y en sus miembros, nunca `403`.
- Las reglas por módulo solo apuntan a miembros del proyecto. Quitar a un miembro quita también sus reglas.
- `reviewsCount` no cuenta borradores ni revisiones vencidas.

## Reglas de revisiones

- La web solo ve revisiones publicadas: `draft` y `expired` no salen en el listado ni en el detalle (404), aunque se filtren por estado.
- `GET /reviews`: `status` se repite; `overdue=true` es «en turno de diseño (`open`, `in_review`) con `dueAt` pasado»; `q` busca sin distinguir mayúsculas en id, título, tarjeta, número de PR y módulo. Orden `updated` (por defecto), `due` (sin plazo al final) o `priority`; al empate, lo más reciente primero.
- Asignar exige diseñadores o líderes de diseño activos del proyecto, nunca el autor. Avisa a quien entra y a quien sale.
- Asignar y cambiar la prioridad no aplican a revisiones cerradas (409).
- Reabrir solo aplica a `approved` o `changes_requested`: anula el envío de la última ronda, deja el check en `pending`, da un plazo nuevo según el SLA y publica `ReviewReopened`.
- Toda escritura de la revisión lleva guarda de estado: si cambió entre la lectura y la escritura, 409 `reviews.stale_status`.
- Crear un proyecto y cada cambio de personas, roles, miembros y configuración dejan una entrada en `GET /audit`.
