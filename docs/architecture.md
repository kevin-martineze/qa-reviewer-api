# Arquitectura

## Contexto

```
 Skill /design-review ──qa_pat_──┐                    ┌── GitHub (webhook firmado)
                                 ▼                    ▼
 Web (SvelteKit, server) ──qa_sess_──▶  qa-reviewer-api  ──▶ MongoDB (qa_*)
                                         │      │
                         URLs firmadas ◀─┘      └─ outbox worker ──▶ GitHub · Plane · correo
                                 │
 Navegador / skill ──PUT/GET──▶ Storage (S3 o disco local)
```

- La web y la skill nunca hablan entre sí: las dos usan el API.
- Las imágenes no pasan por el API (ADR 0004): el API firma, el cliente sube o lee directo.
- Lo externo sale por el outbox (ADR 0005): el comando escribe el evento en la misma transacción y un worker lo entrega.

## Capas

| Capa          | Dónde                           | Responsabilidad                                                                               | No hace                                |
| ------------- | ------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------- |
| Controller    | `modules/<m>/<m>.controller.ts` | Ruta, validación Joi (`JoiPipe`), documentación (`@Endpoint`), extraer el `Principal`         | Reglas de negocio, acceso a datos      |
| Service       | `modules/<m>/<m>.service.ts`    | Orquestar: permisos, lectura, reglas, escritura, eventos. Devuelve `{ messageKey, data }`     | Formato HTTP                           |
| Reglas puras  | `modules/<m>/domain/*.ts`       | Máquina de estados, diff de rondas, estrategias de asignación, cálculo de métricas            | I/O: reciben datos y devuelven valores |
| Mapper        | `modules/<m>/<m>.mapper.ts`     | Documento de Mongo → forma del contrato (ids, fechas ISO, URLs firmadas)                      | Consultas                              |
| Core (global) | `shared/`                       | Auth, permisos, errores, storage, correo, outbox, actividad, auditoría, notificaciones, reloj | Saber de un módulo en particular       |

Reglas de dependencia: un módulo puede usar `shared/` y los servicios exportados de otro módulo; `shared/` no importa módulos; las reglas puras no importan Nest ni Mongoose.

## Módulos

| Módulo          | Rutas                                                         | Notas                                                                 |
| --------------- | ------------------------------------------------------------- | --------------------------------------------------------------------- |
| `auth`          | `/auth/*`, `/me*`, `/invitations/:token*`                     | Login, sesiones, recuperación, perfil, contraseña, aceptar invitación |
| `directory`     | `/organization`, `/users*`, `/invitations*`, `/audit`         | Personas e invitaciones de la organización                            |
| `projects`      | `/projects*`                                                  | Proyectos, configuración y miembros                                   |
| `reviews`       | `/reviews*` (lectura, asignación, prioridad, reabrir, skill)  | Agregado principal; máquina de estados y rondas                       |
| `feedback`      | `/reviews/:id/screens/*`, `/reviews/:id/submit`, `/comments*` | Veredictos, envío, comentarios y menciones                            |
| `notifications` | `/notifications*`, `/me/notification-prefs`                   | Bandeja de avisos y preferencias de correo                            |
| `tokens`        | `/tokens*`                                                    | Tokens personales de la skill                                         |
| `reports`       | `/reports/overview`                                           | Métricas                                                              |
| `integrations`  | `/integrations/github/webhook`                                | Notificadores del outbox y webhook de GitHub                          |
| `jobs`          | —                                                             | Vencimiento de borradores, avisos de plazo y retención                |
| `health`        | `/healthcheck*`                                               | Vida y preparación                                                    |

## Un request de punta a punta

`PUT /v1/reviews/QR-0012/screens/a/verdict` con `{ "verdict": "approved" }`:

1. **Fastify** recibe; **`AuthGuard`** (global) lee `Bearer qa_sess_…`, busca el hash en `qa_sessions`, carga el usuario con sus membresías y deja el `Principal` en el request.
2. **Controller**: `JoiPipe` valida el body; el handler llama al servicio con el `Principal`.
3. **Service**: carga la revisión (404 si no existe o no la puede ver), valida `verdicts:set` en su proyecto, que no sea el autor y que la ronda esté abierta (reglas puras), y escribe con `findOneAndUpdate({ _id, status })`. Si el estado cambió entre medio, 409.
4. **Mapper** firma las URLs de lectura y devuelve la revisión con la forma del contrato.
5. **`AllExceptionsFilter`** da a cualquier error la forma `{ statusCode, messageKey, message, details? }`.

## Eventos

| Evento                | Lo publica                     | Lo consumen                                          |
| --------------------- | ------------------------------ | ---------------------------------------------------- |
| `ReviewOpened`        | publicar (ronda 1 o siguiente) | Comentario en el PR y la tarjeta; check `pending`    |
| `ReviewSubmitted`     | enviar                         | Comentario con el resumen; check `success`/`failure` |
| `ReviewReopened`      | reabrir                        | Check `pending`                                      |
| `ReviewClosed`        | webhook de GitHub              | — (métricas)                                         |
| `NotificationCreated` | toda notificación con correo   | Correo                                               |
| `InvitationCreated`   | invitar                        | Correo con el link                                   |
| `RecoveryRequested`   | pedir recuperación             | Correo con el link                                   |

Cada evento lleva su `eventId` y un snapshot con lo que el consumidor necesita: nadie vuelve a consultar la base para armar un comentario.

## Jobs

| Job           | Cada   | Qué hace                                                               |
| ------------- | ------ | ---------------------------------------------------------------------- |
| Outbox worker | 5 s    | Entrega eventos pendientes con reintentos                              |
| Plazos        | 15 min | Avisa «por vencer» (24 h) y «vencida» una vez por ronda                |
| Borradores    | 1 h    | `draft` con más de 24 h → `expired` y borra sus capturas               |
| Retención     | 1 día  | Borra las capturas de revisiones cerradas hace más de `RETENTION_DAYS` |

Los jobs se apagan con `JOBS_ENABLED=false` (pruebas, réplicas que solo atienden HTTP).

## Despliegue

Un proceso Node 22 sin estado (las sesiones están en Mongo), detrás de un balanceador con TLS. Variables en [operations.md](operations.md). Para varias réplicas, una sola corre los jobs o todas los corren: el outbox reclama eventos con `findOneAndUpdate` atómico y los avisos de plazo marcan la revisión antes de notificar.
