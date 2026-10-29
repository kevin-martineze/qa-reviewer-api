# PRD — qa-reviewer-api

Qué tiene que hacer el API para que la plataforma cumpla su PRD ([`qa-reviewer/docs/product/prd.md`](https://github.com/kevin-martineze/qa-reviewer/blob/main/docs/product/prd.md)). Aquí no se repiten las pantallas: se fijan las capacidades, las reglas que el servidor garantiza y cómo se comporta bajo carga, fallos y abuso.

## 1. Clientes

| Cliente                     | Cómo se autentica                     | Para qué                                               |
| --------------------------- | ------------------------------------- | ------------------------------------------------------ |
| Web (servidor de SvelteKit) | `Bearer qa_sess_…` (sesión, ADR 0009) | Todo lo que hace una persona en la plataforma          |
| Skill `/design-review`      | `Bearer qa_pat_…` (token personal)    | Crear revisiones y rondas, publicar y leer el feedback |
| GitHub                      | Firma `X-Hub-Signature-256`           | Avisar que un PR se fusionó o se cerró                 |

El navegador nunca llama al API, salvo para leer y subir capturas con URLs firmadas.

## 2. Capacidades

### C1. Identidad y acceso

- Login con correo y contraseña (Argon2id). Respuesta idéntica para correo inexistente, contraseña mala o usuario inactivo.
- Sesiones con vencimiento deslizante de 7 días; cerrar esta sesión o todas; cambiar la contraseña cierra las demás.
- Invitaciones de un solo uso (7 días) con rol de organización y proyectos iniciales; aceptarla crea la cuenta y abre sesión.
- Recuperación de contraseña de un solo uso (1 hora); pedirla responde 204 exista o no el correo.
- Desactivar a alguien revoca al instante sus sesiones y sus tokens.

### C2. Organización y proyectos

- Usuarios, invitaciones, roles de organización y auditoría (quién invitó, desactivó, cambió roles, creó o revocó tokens, configuró proyectos).
- Proyectos con slug fijo, SLA, estrategia de asignación, reglas por módulo, integraciones, reglas de diseño, selectores a enmascarar y límites de captura.
- Miembros por proyecto con un rol cada uno.

### C3. Revisiones

- Crear desde un manifiesto versionado; responder con una URL firmada por captura; publicar solo si todas las capturas existen con el tipo y tamaño declarados.
- Una revisión activa por PR. Volver a correr la skill abre la ronda siguiente: solo se suben las pantallas que cambiaron (por hash) y las demás heredan su veredicto.
- Asignación automática al publicar según la estrategia del proyecto; plazo (`dueAt`) en días hábiles desde la publicación, recalculado en cada ronda.
- Listado con filtros, búsqueda, orden y paginación; detalle con URLs de lectura firmadas (15 min); actividad.

### C4. Feedback

- Veredicto por pantalla (no el autor; nunca después del envío); envío que exige cero pendientes y fija el resultado; reabrir un envío con motivo.
- Comentarios anclados (punto 0–1 y componente opcional), respuestas, resolver, seguimiento en la ronda siguiente, borrar (propio o con moderación). Menciones `@persona`.
- Texto de estado para la sesión del dev (`GET /reviews/:id/feedback`).

### C5. Avisos

- Notificaciones in-app por asignación, ronda nueva, envío, mención, respuesta, por vencer (24 h) y vencida. Correo según las preferencias de cada persona.
- Comentario en el PR y en la tarjeta de Plane al publicar y al enviar; estado del check en GitHub (`pending`, `success`, `failure`).
- Cierre automático de la revisión cuando el PR se fusiona o se cierra.

### C6. Métricas

- Por proyecto y periodo: abiertas, vencidas, medianas de horas hasta el primer envío y hasta la aprobación, tasa de aprobación en primera ronda, rondas promedio, abiertas y aprobadas por semana, pendientes por diseñador y ajustes por módulo.

## 3. Reglas que el servidor garantiza

1. Toda acción valida el permiso en el proyecto de la revisión (matriz de `users-and-roles.md`). Sin permiso de lectura, una revisión «no existe» (404, no 403).
2. El autor de una revisión no da veredicto ni la envía.
3. Un cambio de estado se aplica solo si el estado no cambió entre la lectura y la escritura; si cambió, 409.
4. Un manifiesto sin `privacy.masked = true` se rechaza.
5. Los efectos externos (correo, GitHub, Plane) nunca bloquean ni revierten el comando que los origina.
6. Reintentar la creación de una revisión o ronda con la misma `Idempotency-Key` devuelve la misma respuesta durante 24 h.

## 4. Requisitos no funcionales

| Área           | Requisito                                                                                                 |
| -------------- | --------------------------------------------------------------------------------------------------------- |
| Latencia       | Lecturas de la web por debajo de 150 ms p95 con 10 000 revisiones (índices de `data-model.md`)            |
| Disponibilidad | Healthcheck de vida y de preparación (Mongo + storage) para el balanceador                                |
| Seguridad      | Solo hashes de tokens; contraseñas con Argon2id; bucket privado; URLs firmadas de 15 min; CORS a la web   |
| Abuso          | 30 revisiones por hora por token; 40 pantallas y 5 MB por imagen (configurable por proyecto)              |
| Retención      | Capturas de revisiones cerradas: 90 días (configurable). Comentarios, veredictos y auditoría se conservan |
| Entrega        | Eventos al menos una vez, con reintentos exponenciales; tras 8 fallos quedan `dead` para revisarlos       |
| Contrato       | OpenAPI generado del código; cada body se documenta con el mismo esquema que lo valida                    |
| Desarrollo     | Arranca sin servicios externos: Mongo en memoria, storage en disco y correo en consola                    |

## 5. Fuera de alcance de la v1

Tiempo real (SSE), SSO, diff píxel a píxel, bloqueo de merge, varias organizaciones por instalación.
