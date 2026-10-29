# Patrones de diseño del API

Qué patrón, qué problema resuelve aquí, dónde vive y cómo se extiende. La columna «Estado» dice si ya está en el código o si se está construyendo.

| Patrón                        | Dónde                                                | Estado                                             |
| ----------------------------- | ---------------------------------------------------- | -------------------------------------------------- |
| Módulos por dominio           | `src/modules/*`                                      | Implementado                                       |
| Ports and Adapters            | `shared/storage`, `shared/mail`                      | Implementado                                       |
| Guard + Principal             | `shared/auth/auth.guard.ts`                          | Implementado                                       |
| Policy (matriz de permisos)   | `shared/auth/permissions.ts`, `AccessService`        | Implementado                                       |
| Pipe de validación            | `shared/http/joi.pipe.ts`                            | Implementado                                       |
| Exception Filter              | `shared/http/exception.filter.ts`                    | Implementado                                       |
| Mapper (documento → contrato) | `shared/mappers.ts`, `modules/*/*.mapper.ts`         | Implementado                                       |
| Transactional Outbox          | `shared/outbox`                                      | Implementado                                       |
| Strategy (notificadores)      | `shared/outbox/notifier.ts`, `modules/integrations`  | Worker implementado; notificadores en construcción |
| State (tabla de transiciones) | `modules/reviews/domain/review-state.ts`             | Implementado                                       |
| Chain of Responsibility       | `modules/reviews/domain/manifest-checks.ts`          | En construcción                                    |
| Strategy (asignación)         | `modules/reviews/domain/assignment.ts`               | En construcción                                    |
| Idempotency Key               | `modules/reviews/idempotency.service.ts`             | En construcción                                    |
| Snapshot                      | `ReviewDoc.pr`, `ReviewDoc.card`, payload de eventos | Implementado (schema)                              |
| Optimistic concurrency        | `findOneAndUpdate({ _id, status })`                  | Implementado                                       |
| Clock inyectable              | `shared/util/clock.service.ts`                       | Implementado                                       |

## Módulos por dominio

Cada módulo de Nest agrupa controller, servicio, reglas puras y mapper de un dominio (`auth`, `reviews`, `feedback`…). `CoreModule` es global y da la infraestructura (modelos, auth, storage, correo, eventos). Un módulo nuevo se registra en `AppModule.forRoot` y no toca a los demás.

## Ports and Adapters

- **Storage** (`StoragePort`): `LocalStorage` (disco, URLs firmadas con HMAC y servidas por el API) y `S3Storage` (AWS S3, MinIO, R2). El driver se elige con `STORAGE_DRIVER`. Otro proveedor implementa las cinco operaciones del puerto (`presignPut`, `presignGet`, `head`, `put`, `deletePrefix`).
- **Correo** (`MailPort`): `LogMail` (desarrollo, escribe en consola) y `ResendMail`. Otro proveedor implementa `send`.

Los servicios dependen del token (`STORAGE`, `MAIL`), nunca de una clase concreta.

## Guard + Principal

`AuthGuard` es global: toda ruta exige autenticación salvo `@Public()`. Resuelve el `Bearer` a un `Principal`:

- `{ kind: 'session', user, sessionId }` para la web;
- `{ kind: 'token', user, tokenId, projectId }` para la skill, solo en rutas con `@AllowApiToken()`.

El handler lo recibe con `@CurrentPrincipal()`. El `user` ya trae sus membresías, así los permisos se resuelven sin otra consulta.

## Policy

`permissions.ts` es la matriz (permiso → roles) y funciones puras (`permissionsFor`, `can`, `canSeeProject`). `AccessService.assert(user, permiso, proyecto)` lanza 403 con `details.permission`. Las reglas que no caben en la matriz (el autor no da veredicto) viven en el servicio del dominio, junto a la acción.

## Pipe de validación y documentación desde el mismo esquema

`new JoiPipe(schema)` valida y normaliza (`convert`, `stripUnknown`); un error sale como 400 `common.validation` con `details.fields`. El mismo esquema se pasa a `@Endpoint({ body })`, que lo convierte a OpenAPI con `joi-to-swagger`. Documentación y validación no pueden divergir.

## Exception Filter

`AllExceptionsFilter` da a todo error la forma `{ statusCode, messageKey, message, details? }`: los `ApiError` propios, las excepciones de Nest (ruta inexistente → `common.not_found`), los errores de Fastify (JSON inválido, cuerpo grande) y lo inesperado (500 `common.internal`, con el stack solo en el log).

## Transactional Outbox + Strategy

1. El comando escribe su cambio y el evento en `qa_outbox` en la misma transacción (`OutboxService.publish(type, payload, session)`).
2. `OutboxWorker` reclama eventos con `findOneAndUpdate` atómico (varias réplicas no toman el mismo), y los pasa a cada `Notifier` del registro (`NOTIFIERS`) que lo `supports`.
3. Cada notificador entregado queda en `delivered[]`: un reintento no repite el comentario en GitHub si el que falló fue el correo.
4. Fallo → reintento con espera exponencial; a los 8 intentos, `dead`.

Agregar un canal (Slack) es una clase que implementa `Notifier` y una línea en el registro. El worker no cambia.

## State

Las transiciones de la revisión son una tabla `{ desde, comando, hacia, guarda }` en una función pura. El servicio pregunta a la tabla si el comando aplica y escribe con `findOneAndUpdate({ _id, status: desde })`. Si otro request cambió el estado entre medio, no actualiza y responde 409: no hay escrituras perdidas.

## Chain of Responsibility (en construcción)

El manifiesto pasa por una cadena de chequeos, cada uno con su clave de error: versión soportada → privacidad (`masked`) → proyecto del token → límites (pantallas, bytes, tipos) → viewports → claves únicas → PR coherente con la revisión existente. Un chequeo nuevo es una función más en la lista.

## Strategy de asignación (en construcción)

`manual` (nadie; asigna el líder), `round_robin` (siguiente diseñador activo después del último asignado) y `by_module` (primera regla cuyo patrón coincide con la ruta de una pantalla). Una estrategia es una función `(contexto) → asignados`; se elige por `project.strategy`.

## Idempotency Key (en construcción)

`POST /reviews` y `POST /reviews/:id/rounds` exigen `Idempotency-Key`. Se guarda `<usuario>:<clave>` con el hash canónico del body y la respuesta. Misma clave y mismo body → misma respuesta; misma clave y otro body → 422.

## Snapshot

La revisión copia el PR (número, título, ramas, autor, commit) y la tarjeta al crearse. Los eventos llevan lo que su consumidor necesita. Nadie consulta GitHub ni Plane para armar un texto.

## Clock inyectable

Ningún servicio llama `new Date()`: usa `ClockService.now()`. Las pruebas fijan la hora para probar vencimientos, plazos y retención sin esperar.
