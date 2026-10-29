# Algoritmos del API

Los cálculos no triviales, con su complejidad y el porqué de cada decisión. «Estado» indica si ya está en el código.

## Recursión

Se usa recursión solo cuando la estructura es un árbol y su profundidad está acotada por el dominio. Donde la profundidad la decide quien envía los datos, se usa iteración o se limita antes de recorrer.

| Dónde                                            | Qué recorre                       | Por qué recursivo                                   | Cota de profundidad                                                | Estado          |
| ------------------------------------------------ | --------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------ | --------------- |
| `countFiles` (`shared/storage/local.storage.ts`) | Carpetas del storage local        | Un árbol de directorios es recursivo por definición | La ruta de una clave: 6 niveles                                    | Implementado    |
| `canonicalJson` (idempotencia)                   | El body del request               | JSON anidado; se ordenan las claves en cada nivel   | Joi rechaza el body antes si no cumple el esquema (máx. 4 niveles) | En construcción |
| `matchRoute` (asignación por módulo)             | Patrón y ruta segmento a segmento | `*` y `**` se resuelven probando sufijos            | Segmentos de una ruta (≤ 20) con memo                              | En construcción |
| `shiftDates` (`src/seed/shift-dates.ts`)         | El JSON de la demo                | Mueve todas las fechas sin conocer la forma         | Datos propios del repo                                             | Implementado    |

`countFiles`: O(n) en archivos. Se usa al borrar un prefijo para informar cuántas capturas se eliminaron.

`canonicalJson(value)`: si es arreglo, canoniza cada elemento; si es objeto, ordena las claves y canoniza cada valor; si no, `JSON.stringify`. Así dos bodies iguales con claves en otro orden producen el mismo hash. O(n log n) por el orden de claves.

`matchRoute(pattern, route)`: compara segmentos. `*` coincide con exactamente un segmento; `**` con cero o más, lo que obliga a probar cada sufijo restante (recursión). Con memo por par de índices es O(p × r).

## Rondas

### Diff de rondas (`round-diff`, en construcción)

Entrada: pantallas de la ronda anterior y del manifiesto nuevo. Para cada pantalla nueva:

- no existía → **cambió**, veredicto `pending`, se pide subir su captura;
- existía y su `after.sha256` es distinto → **cambió**, `pending`, `previous` = captura anterior;
- existía con el mismo hash → **heredada**: conserva captura, veredicto y `changedIn`; no se sube nada.

Las pantallas que ya no están en el manifiesto salen de la revisión (sus comentarios siguen en el historial). O(n) con un mapa por clave.

### Resultado del envío

Un recorrido cuenta aprobadas y con ajuste. Si queda alguna `pending` → 409 `reviews.pending_screens`. Resultado `approved` si `changes = 0`, si no `changes_requested`. Los veredictos se congelan en `rounds[n].verdicts`.

## Plazos

### Días hábiles (`addBusinessDays`, implementado)

Suma de a un día y descuenta solo lunes a viernes, conservando la hora. O(d) con d ≤ 15 (límite del SLA), así que no se justifica la fórmula cerrada.

### Vencimiento

Solo corre mientras diseño tiene la pelota (`open`, `in_review`). Vencida si `dueAt < ahora`; «por vencer» si faltan menos de 24 h. El job de plazos marca `dueSoonNotifiedAt` / `overdueNotifiedAt` con una escritura condicional antes de notificar, así cada aviso sale una vez por ronda aunque corran varias réplicas.

## Asignación (en construcción)

- **Round robin:** diseñadores activos del proyecto ordenados por id; se elige el siguiente después de `roundRobinLast` (circular). O(n).
- **Por módulo:** primera regla cuyo patrón coincide (`matchRoute`) con la ruta de alguna pantalla, en el orden en que están las reglas. Sin coincidencia, nadie.

## Menciones (en construcción)

El texto del comentario se normaliza (minúsculas, sin tildes). Se busca `@` seguido del nombre completo de un miembro del proyecto o de la parte local de su correo, probando primero los nombres más largos para que «@Ana María» no se quede en «@Ana». O(m × k) con m miembros y k menciones.

## Métricas (en construcción)

- **Medianas** de horas (primer envío, aprobación): se ordenan y se toma el centro (promedio de los dos centrales si es par). O(n log n).
- **Semanas:** seis ventanas de 7 días que terminan hoy; cada revisión cae en la ventana de su `publishedAt` y cada aprobación en la de su envío.
- **Ajustes por módulo:** suma de veredictos `changes_requested` de todas las rondas, agrupada por `module`.

## Reintentos del outbox (implementado)

Espera antes del intento n: `min(5 s × 2^(n−1), 30 min)` → 5 s, 10 s, 20 s, 40 s, 80 s… A los 8 intentos fallidos el evento queda `dead`.

## Seguridad

- **Tokens:** 32 bytes aleatorios en base64url; se guarda el SHA-256. Buscar por hash es una lectura por índice único; un token filtrado de la base no sirve.
- **Login en tiempo constante:** si el correo no existe se verifica contra un hash de relleno, así la latencia no revela qué correos están registrados.
- **URLs firmadas locales:** HMAC-SHA256 de `método, clave, vencimiento, tipo, tamaño`, comparado con `timingSafeEqual`.
