# Modelo de datos

MongoDB, una base por instalación. Todas las colecciones empiezan con `qa_`. Los schemas están en `src/shared/schemas/`.

## Ids

| Entidad  | `_id`                                | Por qué                                 |
| -------- | ------------------------------------ | --------------------------------------- |
| Revisión | `QR-0001` (serial de `qa_counters`)  | Va en la URL y se dicta (ADR 0010)      |
| Proyecto | slug: `lideris`                      | Va en la URL de ajustes; no cambia      |
| Resto    | hex de ObjectId guardado como string | Opaco y ordenable por fecha de creación |

## Colecciones

| Colección          | Contenido                                                                                        | Índices                                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `qa_organizations` | Nombre de la organización (una por instalación)                                                  | —                                                                                                                 |
| `qa_users`         | Nombre, correo, rol de organización, estado, avatar, último acceso, preferencias de correo       | `email` único                                                                                                     |
| `qa_credentials`   | Hash Argon2id de la contraseña; `_id` = id del usuario                                           | —                                                                                                                 |
| `qa_sessions`      | Hash del token, usuario, último uso, vencimiento, revocación                                     | `tokenHash` único · `userId` · TTL sobre `expiresAt` (+1 día)                                                     |
| `qa_api_tokens`    | Hash del token de la skill, prefijo visible, etiqueta, usuario, proyecto, último uso, revocación | `hash` único · `userId`                                                                                           |
| `qa_projects`      | Configuración del proyecto, límites de captura y cursor del round robin                          | —                                                                                                                 |
| `qa_members`       | `projectId`, `userId`, rol                                                                       | `projectId + userId` único · `userId`                                                                             |
| `qa_invitations`   | Hash del token, correo, rol, proyectos iniciales, quién invitó, vencimiento, uso, revocación     | `tokenHash` único · `email`                                                                                       |
| `qa_recoveries`    | Hash del token, usuario, vencimiento (1 h), uso                                                  | `tokenHash` único                                                                                                 |
| `qa_reviews`       | La revisión con pantallas, rondas, envíos y la ronda pendiente de publicar (ver abajo)           | `projectId + pr.number` único **solo entre revisiones activas** · `projectId` · `status` · `author` · `updatedAt` |
| `qa_counters`      | Seriales (`reviews` → `QR-`)                                                                     | —                                                                                                                 |
| `qa_comments`      | Comentario con ancla, componente, ronda, estado, seguimiento y respuestas embebidas              | `reviewId + screenKey + createdAt`                                                                                |
| `qa_notifications` | Aviso in-app por persona                                                                         | `userId + createdAt`                                                                                              |
| `qa_activity`      | Línea de tiempo de cada revisión                                                                 | `review + createdAt`                                                                                              |
| `qa_audit`         | Registro de la organización                                                                      | `createdAt`                                                                                                       |
| `qa_outbox`        | Eventos por entregar: estado, intentos, próximo intento, notificadores que ya lo recibieron      | `status + nextAttemptAt`                                                                                          |
| `qa_idempotency`   | `<usuario>:<Idempotency-Key>` → hash del request y respuesta                                     | TTL 24 h sobre `createdAt`                                                                                        |

## La revisión por dentro

```
qa_reviews
├── _id, projectId, title, context, module, card{key,title}, pr{number,url,title,base,head,author,state,check,commit}
├── author, assignees[], status, round, priority, dueAt
├── summary{steps[],rules[]}, notCaptured[]
├── screens[]          estado actual de cada pantalla
│   ├── key, title, lead, route, viewport{width,height}
│   ├── after / before / previous   {key, contentType, bytes, sha256}   ← claves del storage, no URLs
│   ├── changedIn, inherited, roundNote, diff[], elements[], changes[], questions[]
│   └── verdict
├── rounds[]           historia: n, by, createdAt, note, changed[], verdicts{key→verdict}, submission
├── pending            ronda subida por la skill que espera publish (con sus uploads)
└── createdAt, updatedAt, publishedAt, closedAt, dueSoonNotifiedAt, overdueNotifiedAt, assetsPurgedAt
```

Por qué embebido: pantallas, rondas y veredictos siempre se leen y cambian con la revisión, y están acotados (40 pantallas por ronda). Los comentarios crecen sin límite y se consultan por pantalla: van aparte.

Las capturas se guardan como **clave** del storage; el mapper firma una URL de lectura (15 min) en cada respuesta.

## Estados de la revisión

```
draft ──publish──▶ open ──primer veredicto──▶ in_review ──submit──▶ approved | changes_requested
  │                  ▲                                                      │
  │ 24 h             └──────────────── nueva ronda (publish) ───────────────┘
  ▼                                                     reopen: approved | changes_requested → in_review
expired                         webhook (PR cerrado o fusionado): cualquiera activo → closed
```

`draft` y `expired` no se ven en la web: el listado y el detalle solo muestran revisiones publicadas.

## Ciclo de vida

| Dato                                          | Vive                                                     |
| --------------------------------------------- | -------------------------------------------------------- |
| Sesión                                        | 7 días desde el último uso; Mongo la borra 1 día después |
| Enlace de recuperación                        | 1 hora, un uso                                           |
| Invitación                                    | 7 días, un uso                                           |
| Borrador sin publicar                         | 24 h; luego `expired` y se borran sus capturas           |
| Capturas de revisión cerrada                  | `RETENTION_DAYS` (90 por defecto)                        |
| Entrada de idempotencia                       | 24 h                                                     |
| Comentarios, veredictos, actividad, auditoría | Siempre                                                  |

## Rutas de objetos en el storage

`projects/<projectId>/reviews/<reviewId>/r<ronda>/<screenKey>/<after|before>.<png|webp>`

Borrar una revisión (vencida o por retención) es borrar el prefijo `projects/<projectId>/reviews/<reviewId>/`.
