# qa-reviewer-api · guía para escribir código

Para personas y asistentes de IA. Léela antes de tocar el código. La arquitectura está en [`docs/`](docs/README.md); el contrato con la web, en `src/shared/contract.ts` (espejo de `qa-reviewer/src/lib/api/types.ts`).

Stack: NestJS 11 sobre Fastify, TypeScript estricto, MongoDB con Mongoose, Joi, Swagger generado desde el código.

## 1. Principios

1. **El contrato manda.** Toda respuesta tiene la forma de `src/shared/contract.ts` y sale por un mapper. Si el contrato cambia, cambia también en la web (y en su mock) en el mismo PR.
2. **Controllers delgados.** Ruta, `JoiPipe`, `@Endpoint` y llamar al servicio. Nada de reglas.
3. **Reglas puras aparte.** Máquinas de estado, diffs, estrategias y cálculos viven en `modules/<m>/domain/` sin Nest ni Mongoose, con pruebas unitarias.
4. **Permisos en el servicio**, siempre en el proyecto del recurso (`AccessService.assert`). Sin permiso de lectura, el recurso «no existe» (404).
5. **Estado con guarda.** Un cambio de estado se escribe con `findOneAndUpdate({ _id, status })`; si no actualizó, 409 `reviews.stale_status`.
6. **Lo externo por el outbox.** Correo, GitHub y Plane nunca se llaman dentro de un request: se publica un evento en la misma transacción.

## 2. TypeScript

- Sin `any` (ESLint `no-explicit-any`), sin `@ts-ignore`, sin `console.log` (usa `Logger` de Nest).
- `as` solo en el borde con Fastify o con una librería sin tipos. Si hace falta en otro lado, el tipo de origen está mal.
- `import type` para tipos (ESLint lo corrige). Orden de imports con grupos y alfabético (ESLint).

## 3. HTTP

- Respuesta: `{ messageKey, data }` con `envelope(key, data)`. Comandos sin cuerpo: `@HttpCode(204)` y `void`.
- Errores: siempre `ApiError` con los helpers (`badRequest`, `notFound`, `conflict`, `gone`…): clave i18n estable (`reviews.stale_status`) y `message` en español para la persona, porque la web lo muestra tal cual.
- 403 lleva `details.permission` con el permiso que falta.
- Body, query y params se validan con `new JoiPipe(schema)`; el mismo esquema va en `@Endpoint({ body })` para que el OpenAPI diga exactamente lo que se valida.
- Toda ruta lleva `@Endpoint` con su `ok` (DTO de `shared/docs/contract.dto.ts`) y sus claves de error.
- Rutas públicas con `@Public()`; las que acepta la skill, con `@AllowApiToken()`.

## 4. Datos

- Un schema por colección en `src/shared/schemas`, registrado en `MODELS`. `_id` string: opaco por defecto, `QR-0001` en revisiones y el slug en proyectos (ADR 0010).
- Lecturas con `.lean()` y un mapper hacia el contrato (`iso()` para fechas, URLs firmadas para capturas).
- Escrituras que tocan más de un documento o publican eventos: `TransactionService.run`.
- Índices declarados en el schema y documentados en [`docs/data-model.md`](docs/data-model.md).
- Nunca se guarda un secreto en claro: tokens y enlaces se guardan como SHA-256; contraseñas con Argon2id.

## 5. Tiempo

- Nunca `new Date()` en un servicio: `ClockService.now()`. Las pruebas fijan el reloj.
- Fechas en Mongo como `Date`; en el contrato, ISO 8601 UTC.

## 6. Pruebas

- Unidad (`*.spec.ts` junto al archivo): reglas puras.
- Integración (`test/*.spec.ts`): la app completa contra Mongo en memoria con `fastify.inject`.
- Una regla nueva entra con su prueba. Un bug corregido entra con la prueba que lo reproduce.

## 7. Gates

`pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test` y `pnpm build` en verde antes de cada commit. Las e2e de la web en modo API (`E2E_SOURCE=api pnpm test:e2e` en `qa-reviewer`) antes de cerrar un módulo.

## 8. Documentación

Un cambio de comportamiento actualiza su doc en el mismo commit: endpoint → [`api.md`](docs/api.md); colección o índice → [`data-model.md`](docs/data-model.md); patrón o algoritmo nuevo → [`patterns.md`](docs/patterns.md) o [`algorithms.md`](docs/algorithms.md); variable de entorno → [`operations.md`](docs/operations.md) y `.env.example`.
