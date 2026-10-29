# Documentación de qa-reviewer-api

| Documento                          | Qué cuenta                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------------- |
| [prd.md](prd.md)                   | Qué le pide el producto al API: capacidades, reglas y requisitos no funcionales |
| [architecture.md](architecture.md) | Módulos, capas, flujo de un request, eventos y despliegue                       |
| [patterns.md](patterns.md)         | Patrones de diseño: dónde viven y cómo se extienden                             |
| [algorithms.md](algorithms.md)     | Algoritmos, complejidad y dónde se usa recursión                                |
| [data-model.md](data-model.md)     | Colecciones de MongoDB, índices y ciclo de vida de los datos                    |
| [api.md](api.md)                   | Convenciones del contrato HTTP, autenticación y catálogo de errores             |
| [operations.md](operations.md)     | Configuración, arranque local, semilla, jobs y puesta en producción             |

El contrato exacto (rutas, cuerpos y respuestas) lo genera el código en `/docs-json`; la UI interactiva está en `/docs`. Las decisiones de arquitectura compartidas con la web están en los ADR de [`qa-reviewer/docs/adr`](https://github.com/kevin-martineze/qa-reviewer/tree/main/docs/adr).
