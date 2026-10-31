# Prueba de punta a punta de la skill

`run.mjs` recorre `/design-review` completo contra un API real:

1. **Login por navegador:** `client.mjs login` pide un código y la prueba lo aprueba como el dev en `/device/:code/approve`.
2. **Ronda 1:** captura tres pantallas, redacta el manifiesto, publica con `client.mjs submit` y guarda la ronda con `capture.mjs keep`.
3. **Diseño:** la líder de diseño aprueba una pantalla, pide ajustes en dos, comenta anclado a un componente y envía.
4. **`status`:** el texto para la sesión del dev trae el comentario con su archivo.
5. **Ronda 2:** solo cambia el perfil. La captura marca sus zonas de cambio, se suben solo esas dos capturas y la tercera hereda «aprobada».

El «producto» que se captura es la web de qa-reviewer en modo mock: datos sintéticos, nunca reales. El correo del perfil se tapa con `#email`, como lo agregaría Claude al ver el diff.

## Correrla

En tres terminales:

```bash
# 1. API recién arrancado (cada corrida usa un PR nuevo, pero la semilla debe estar intacta)
PORT=3100 pnpm demo                                        # en qa-reviewer-api

# 2. El producto: la web en modo mock
REVIEWS_SOURCE=mock pnpm exec vite dev --port 5199         # en qa-reviewer

# 3. La prueba
npm run e2e                                                # en qa-reviewer-api/skill
```

Variables: `QA_REVIEWER_API_URL` (por defecto `http://localhost:3100`) y `PRODUCT_URL` (por defecto `http://localhost:5199`). Las credenciales van a una carpeta temporal (`XDG_CONFIG_HOME`), nunca a `~/.config/qa-reviewer`.

Para ver el resultado en la web, levántala contra el mismo API (`REVIEWS_SOURCE=api API_URL=http://localhost:3100`) y abre la URL que imprime la prueba.
