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

| Cliente         | Header                            | Dónde sirve                                                             |
| --------------- | --------------------------------- | ----------------------------------------------------------------------- |
| Web             | `Authorization: Bearer qa_sess_…` | Todo el API                                                             |
| Skill           | `Authorization: Bearer qa_pat_…`  | Solo endpoints marcados para la skill                                   |
| Skill sin token | Ninguno                           | `POST /skill/device` y `POST /skill/device/token` (login por navegador) |
| GitHub          | `X-Hub-Signature-256`             | `POST /v1/integrations/github/webhook`                                  |

## Endpoints por grupo

| Grupo             | Endpoints                                                                                                                                                                                                                                  | Estado          |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------- |
| Salud             | `GET /healthcheck`, `GET /healthcheck/readiness-probe`                                                                                                                                                                                     | Implementado    |
| Sesión y cuenta   | `POST /auth/login`, `/auth/logout`, `/auth/logout-all`, `/auth/recovery`, `GET·POST /auth/recovery/:token`, `GET /invitations/:token`, `POST /invitations/:token/accept`, `GET·PATCH /me`, `PUT /me/password`                              | Implementado    |
| Storage local     | `GET·PUT /storage/*` (URLs firmadas; solo con `STORAGE_DRIVER=local`)                                                                                                                                                                      | Implementado    |
| Organización      | `GET /organization`, `GET /users`, `PATCH /users/:id`, `GET·POST /invitations`, `DELETE /invitations/:id`, `GET /audit`                                                                                                                    | Implementado    |
| Proyectos         | `GET·POST /projects`, `GET·PATCH /projects/:id`, `GET·POST /projects/:id/members`, `PATCH·DELETE /projects/:id/members/:userId`                                                                                                            | Implementado    |
| Revisiones        | `GET /reviews`, `GET·PATCH /reviews/:id`, `GET /reviews/:id/activity`, `PUT /reviews/:id/assignees`, `POST /reviews/:id/reopen`                                                                                                            | Implementado    |
| Skill             | `POST /reviews`, `POST /reviews/:id/publish`, `POST /reviews/:id/rounds`, `GET /reviews/:id/feedback`                                                                                                                                      | Implementado    |
| Feedback          | `PUT /reviews/:id/screens/:key/verdict`, `POST /reviews/:id/submit`, `GET /reviews/:id/comments`, `GET·POST /reviews/:id/screens/:key/comments`, `POST /comments/:id/replies`, `PATCH·DELETE /comments/:id`, `PUT /comments/:id/follow-up` | Implementado    |
| Notificaciones    | `GET /notifications`, `GET /notifications/unread-count`, `POST /notifications/:id/read`, `POST /notifications/read-all`, `GET·PUT /me/notification-prefs`                                                                                  | Implementado    |
| Tokens            | `GET·POST /tokens`, `DELETE /tokens/:id`                                                                                                                                                                                                   | Implementado    |
| Login de la skill | `POST /skill/device`, `POST /skill/device/token` (públicos), `GET /device/:userCode`, `POST /device/:userCode/approve`, `POST /device/:userCode/deny`                                                                                      | Implementado    |
| Métricas          | `GET /reports/overview`                                                                                                                                                                                                                    | Implementado    |
| Integraciones     | `POST /integrations/github/webhook`                                                                                                                                                                                                        | En construcción |

## Catálogo de claves de error

| Clave                                                                          | Status    | Cuándo                                                                                                    |
| ------------------------------------------------------------------------------ | --------- | --------------------------------------------------------------------------------------------------------- |
| `common.validation`                                                            | 400       | Body, query o params no cumplen el esquema                                                                |
| `common.bad_request`                                                           | 400       | JSON mal formado u otro error de forma que detecta Fastify                                                |
| `common.not_found`                                                             | 404       | Ruta inexistente                                                                                          |
| `common.method_not_allowed`                                                    | 405       | Método no soportado en la ruta                                                                            |
| `common.payload_too_large`                                                     | 413       | Cuerpo sobre el límite (10 MB para imágenes)                                                              |
| `common.unsupported_media`                                                     | 415       | `Content-Type` no aceptado                                                                                |
| `common.rate_limited`                                                          | 429       | Límite de peticiones superado                                                                             |
| `common.error`                                                                 | otro      | Error HTTP sin clave propia                                                                               |
| `common.internal`                                                              | 500       | Error inesperado (el detalle queda en el log)                                                             |
| `auth.required`                                                                | 401       | Falta el header `Authorization`                                                                           |
| `auth.session_expired`                                                         | 401       | Sesión vencida, revocada o de un usuario inactivo                                                         |
| `auth.invalid_token`                                                           | 401       | Token de la skill inválido o revocado                                                                     |
| `auth.token_not_allowed`                                                       | 401       | Token de la skill en un endpoint que exige sesión                                                         |
| `auth.invalid`                                                                 | 401       | Login con correo o contraseña incorrectos (o cuenta inactiva)                                             |
| `auth.forbidden`                                                               | 403       | Falta el permiso (`details.permission`)                                                                   |
| `auth.wrong_password` · `auth.same_password`                                   | 400       | Cambio de contraseña                                                                                      |
| `recovery.not_found` · `recovery.gone`                                         | 404 · 410 | Enlace de recuperación inexistente o vencido/usado                                                        |
| `invite.not_found`                                                             | 404       | Invitación inexistente                                                                                    |
| `invite.expired` · `invite.used` · `invite.revoked`                            | 410       | Invitación que ya no sirve                                                                                |
| `users.exists`                                                                 | 409       | Ya hay una cuenta con ese correo                                                                          |
| `users.not_found`                                                              | 404       | La persona no existe (o la cuenta de la sesión ya no existe)                                              |
| `users.self`                                                                   | 409       | Cambiar el estado o el rol de la propia cuenta                                                            |
| `users.owner`                                                                  | 409       | Desactivar al owner                                                                                       |
| `users.changed`                                                                | 409       | La cuenta cambió entre la lectura y la escritura                                                          |
| `users.inactive`                                                               | 409       | Agregar a un proyecto una cuenta desactivada                                                              |
| `organization.not_found`                                                       | 404       | La instalación no tiene organización (falta el bootstrap)                                                 |
| `invite.pending`                                                               | 409       | Ya hay una invitación vigente para ese correo                                                             |
| `invite.invalid_projects`                                                      | 400       | La invitación nombra proyectos que no existen                                                             |
| `projects.not_found`                                                           | 404       | Proyecto inexistente o que la persona no puede ver                                                        |
| `projects.exists`                                                              | 409       | Ya hay un proyecto con ese slug                                                                           |
| `projects.invalid_rules`                                                       | 400       | Regla por módulo hacia alguien que no es miembro (`details.userIds`)                                      |
| `members.not_found` · `members.exists`                                         | 404 · 409 | La persona no es miembro, o ya lo es                                                                      |
| `members.self`                                                                 | 409       | Quitarse a uno mismo del proyecto                                                                         |
| `reviews.not_found`                                                            | 404       | Revisión inexistente, sin publicar o que la persona no ve                                                 |
| `reviews.stale_status`                                                         | 409       | El estado no permite el comando o cambió entre medio                                                      |
| `reviews.invalid_assignees`                                                    | 400       | Asignados que no son diseñadores activos o son el autor (`details.userIds`)                               |
| `reviews.exists`                                                               | 409       | El PR ya tiene una revisión publicada: subir una ronda nueva (`details.reviewId`)                         |
| `reviews.missing_uploads`                                                      | 422       | Al publicar, faltan capturas o no coinciden en tipo y tamaño (`details.missing`)                          |
| `idempotency.required`                                                         | 400       | Falta `Idempotency-Key` al crear una revisión o una ronda                                                 |
| `idempotency.mismatch` · `idempotency.in_progress`                             | 422 · 409 | Clave usada con otro body, o el primer intento sigue en curso                                             |
| `manifest.version_unsupported`                                                 | 422       | `manifestVersion` no soportada (`details.supported`)                                                      |
| `manifest.privacy_required`                                                    | 422       | `privacy.masked` no es `true`                                                                             |
| `manifest.project_mismatch`                                                    | 403       | El token de la skill es de otro proyecto                                                                  |
| `manifest.too_many_screens` · `manifest.invalid_capture` · `manifest.viewport` | 422       | Fuera de los límites del proyecto (`details.screen`)                                                      |
| `manifest.duplicate_screens`                                                   | 422       | Dos pantallas con la misma `key`                                                                          |
| `manifest.pr_mismatch` · `manifest.review_mismatch`                            | 422       | La ronda trae otro PR u otro proyecto que la revisión                                                     |
| `manifest.no_changes`                                                          | 422       | Ronda nueva sin pantallas nuevas ni recapturadas                                                          |
| `storage.invalid_signature` · `storage.mismatch`                               | 403 · 422 | URL firmada vencida o archivo distinto de lo declarado                                                    |
| `storage.not_found` · `storage.empty`                                          | 404 · 422 | Objeto inexistente o subida sin cuerpo                                                                    |
| `verdicts.author_forbidden`                                                    | 403       | El autor da veredicto o envía su propia revisión                                                          |
| `reviews.already_submitted`                                                    | 409       | La ronda ya se envió: hay que reabrirla o esperar una ronda nueva                                         |
| `reviews.pending_screens`                                                      | 409       | Enviar con pantallas sin veredicto (`details.screens`)                                                    |
| `screens.not_found`                                                            | 404       | La revisión no tiene esa pantalla                                                                         |
| `comments.not_found`                                                           | 404       | Comentario inexistente o de una revisión que la persona no ve                                             |
| `comments.forbidden`                                                           | 403       | Resolver o borrar un comentario ajeno sin `comments:resolve` o `comments:moderate` (`details.permission`) |
| `comments.not_previous_round`                                                  | 409       | Seguimiento de un comentario de la ronda actual                                                           |
| `notifications.not_found`                                                      | 404       | Notificación inexistente o de otra persona                                                                |
| `tokens.not_found`                                                             | 404       | Token inexistente, revocado o de otra persona                                                             |
| `device.not_found`                                                             | 404       | Código de usuario o `deviceCode` inexistente                                                              |
| `device.pending`                                                               | 400       | La persona todavía no aprueba: seguir sondeando                                                           |
| `device.slow_down`                                                             | 429       | Sondeo antes de `interval`: sumar 5 s a la espera                                                         |
| `device.denied`                                                                | 403       | La persona rechazó el acceso, o perdió `tokens:own` antes del sondeo                                      |
| `device.expired`                                                               | 410       | Pasaron los 10 minutos                                                                                    |
| `device.used`                                                                  | 409       | El token ya se entregó, o la solicitud ya se aprobó o rechazó                                             |
| `device.rate_limited`                                                          | 429       | Más de 10 solicitudes por minuto por IP, o 20 códigos inexistentes en 10 minutos                          |
| `health.unavailable`                                                           | 503       | Mongo o el storage no responden                                                                           |

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

## Reglas de feedback

- Dar veredicto y enviar exige `verdicts:set` y no ser el autor. Solo en `open` o `in_review`: una ronda enviada responde 409 `reviews.already_submitted`; una revisión cerrada, 409 `reviews.stale_status`.
- El primer veredicto pasa la revisión de `open` a `in_review`. Un veredicto dado en la ronda reemplaza al heredado (`inherited: false`).
- Enviar desde `open` también vale: pasa cuando los veredictos heredados ya cubren todas las pantallas.
- El envío fija el resultado (`approved` si no hay ajustes, si no `changes_requested`), el check del PR (`success` o `failure`), los veredictos y el envío de la ronda. Avisa al autor y publica `ReviewSubmitted` en la misma transacción.
- Comentar y responder no aplican a revisiones cerradas. El comentario queda en la ronda actual.
- `@nombre` o `@usuario-del-correo` en un comentario o respuesta notifica (`mention`) a esa persona si es miembro activo del proyecto, owner o admin. Ver [algorithms.md](algorithms.md#menciones-implementado).
- Comentar avisa al autor de la revisión (`reply`); responder avisa al autor del comentario. Quien ya recibió la mención no recibe además el `reply`. Nadie se notifica a sí mismo.
- Resolver: el autor del comentario o quien tenga `comments:resolve`. Borrar: el autor o quien tenga `comments:moderate`.
- Seguimiento (`PUT /comments/:id/follow-up`) solo sobre comentarios de rondas anteriores y con `verdicts:set`: `resolved` lo resuelve, `still` lo deja abierto.
- Un comentario de una revisión que la persona no ve responde 404 `comments.not_found`.

## Reglas de notificaciones y tokens

- `GET /notifications` no se pagina: trae las 200 más recientes. `GET /notifications/unread-count` devuelve un número suelto en `data`.
- Marcar como leída otra vez no cambia `readAt`. Una notificación de otra persona responde 404.
- `PUT /me/notification-prefs` recibe el objeto completo, con todos los tipos. Sin preferencias guardadas, valen las de fábrica.
- `POST /tokens` exige `tokens:own` en el proyecto; un proyecto que la persona no ve responde 404. El secreto (`qa_pat_` y 32 hex) se entrega una sola vez y se guarda su SHA-256.
- Cada persona lista y revoca solo sus tokens. Crear y revocar quedan en `GET /audit` (`token_created`, `token_revoked`).
- Los tokens se administran con sesión: un `qa_pat_` en `/tokens` responde 401 `auth.token_not_allowed`.

## Reglas de métricas

- `GET /reports/overview` con `project` exige `reports:view` en ese proyecto; un proyecto que la persona no ve responde 404. Sin `project`, solo owner y admin, sobre todos los proyectos.
- Cuentan las revisiones publicadas. `from` y `to` (instantes ISO 8601) filtran por la fecha en que la revisión quedó `open`.
- Las horas se miden desde que la revisión quedó `open`. Ver [algorithms.md](algorithms.md#métricas-implementado).

## Login de la skill por navegador

Device flow del RFC 8628: la persona no copia ningún token.

1. La skill llama `POST /skill/device` (público) con `{ client: { name, version, hostname }, repo }` y recibe `deviceCode`, `userCode` (`ABCD-EFGH`, sin 0/O/1/I), `verificationUriComplete` (`<PUBLIC_WEB_URL>/device?code=…`), `expiresIn: 600` e `interval: 5`.
2. Abre la URL. La persona inicia sesión, ve el equipo y el repo, elige el proyecto (`suggestedProjectId`: el que tiene ese repo y donde puede publicar) y aprueba con `POST /device/:userCode/approve`. Exige `tokens:own` en el proyecto.
3. La skill sondea `POST /skill/device/token` cada `interval` segundos. Mientras tanto recibe `device.pending`; si sondea antes de tiempo, `device.slow_down`.
4. En el primer sondeo después de aprobar se crea el token (misma lógica y auditoría que `POST /tokens`) y se entrega una sola vez: `{ secret, token, project, user }`. Crearlo recién ahí evita guardar el secreto en claro.

Del `deviceCode` y del `userCode` se guarda solo el SHA-256. Aprobar o rechazar no cambia una vez hecho (409 `device.used`). Ver [algorithms.md](algorithms.md#login-de-la-skill).

## Flujo de la skill

1. `POST /reviews` con el manifiesto v1 e `Idempotency-Key` → borrador (`draft`) con `uploads[]`: una URL `PUT` firmada (15 min, tipo y tamaño fijos) por captura. Si el PR ya tiene un borrador de la misma persona, se reemplaza; si tiene una revisión publicada, 409 `reviews.exists`.
2. La skill sube cada captura a su URL.
3. `POST /reviews/:id/publish` verifica con `HEAD` que cada captura exista con el tipo y tamaño declarados, asigna según la estrategia del proyecto (solo en la ronda 1, o si no hay asignados), fija `dueAt` en días hábiles, avisa y publica `ReviewOpened`. Repetirlo no tiene efectos.
4. Tras un envío de diseño, `POST /reviews/:id/rounds` (con su propia `Idempotency-Key`) calcula el diff de rondas: pide subir solo las pantallas nuevas o con otro `sha256`; las demás heredan captura y veredicto. Se publica igual que la ronda 1.
5. `GET /reviews/:id/feedback` devuelve la revisión, los comentarios abiertos de la última ronda enviada y un texto listo para la sesión de Claude Code.

El token de la skill (`qa_pat_…`) solo sirve en estos cuatro endpoints y en el proyecto para el que se creó.

- Crear un proyecto y cada cambio de personas, roles, miembros y configuración dejan una entrada en `GET /audit`.
