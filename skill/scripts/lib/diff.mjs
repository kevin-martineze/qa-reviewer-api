// Zonas que cambiaron entre dos capturas del mismo tamaño (ronda anterior y actual).
// Se compara por celdas: una celda cambió si tiene suficientes píxeles distintos. Las celdas
// cercanas que cambiaron se unen en un rectángulo. Sale en fracciones 0–1 de la captura,
// como `screens[].diff` del manifiesto.

const CELL = 16;
/** Diferencia mínima por píxel (suma de |ΔR|+|ΔG|+|ΔB|) para contarlo como distinto. */
const PIXEL_THRESHOLD = 48;
/** Píxeles distintos que necesita una celda para contar como cambiada (ignora antialias). */
const CELL_THRESHOLD = 4;
const MAX_REGIONS = 12;
/** Distancia en celdas para unir dos zonas cercanas. */
const GAP = 2;

/**
 * @param {{ width: number, height: number, data: Uint8Array }} a
 * @param {{ width: number, height: number, data: Uint8Array }} b
 * @returns {Array<{ x: number, y: number, w: number, h: number }> | null}
 *   null si los tamaños no coinciden (no se puede comparar).
 */
export function changedRegions(a, b) {
  if (a.width !== b.width || a.height !== b.height) return null;
  const { width, height } = a;
  const cols = Math.ceil(width / CELL);
  const rows = Math.ceil(height / CELL);
  const changed = new Uint16Array(cols * rows);

  for (let y = 0; y < height; y += 1) {
    const row = Math.floor(y / CELL) * cols;
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const delta =
        Math.abs(a.data[i] - b.data[i]) +
        Math.abs(a.data[i + 1] - b.data[i + 1]) +
        Math.abs(a.data[i + 2] - b.data[i + 2]);
      if (delta > PIXEL_THRESHOLD) changed[row + Math.floor(x / CELL)] += 1;
    }
  }

  const seen = new Uint8Array(cols * rows);
  const boxes = [];
  for (let start = 0; start < changed.length; start += 1) {
    if (changed[start] < CELL_THRESHOLD || seen[start]) continue;
    let minC = cols;
    let minR = rows;
    let maxC = -1;
    let maxR = -1;
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const cell = stack.pop();
      const c = cell % cols;
      const r = Math.floor(cell / cols);
      minC = Math.min(minC, c);
      maxC = Math.max(maxC, c);
      minR = Math.min(minR, r);
      maxR = Math.max(maxR, r);
      // Celdas a 2 o menos de distancia son la misma zona: un texto que cambió no se parte.
      for (let dr = -GAP; dr <= GAP; dr += 1) {
        for (let dc = -GAP; dc <= GAP; dc += 1) {
          const nc = c + dc;
          const nr = r + dr;
          if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
          const next = nr * cols + nc;
          if (!seen[next] && changed[next] >= CELL_THRESHOLD) {
            seen[next] = 1;
            stack.push(next);
          }
        }
      }
    }
    boxes.push({ minC, minR, maxC, maxR });
  }

  if (!boxes.length) return [];
  // Demasiadas zonas sueltas no ayudan a quien revisa: se resume en una sola.
  const merged =
    boxes.length > MAX_REGIONS
      ? [
          {
            minC: Math.min(...boxes.map((b2) => b2.minC)),
            minR: Math.min(...boxes.map((b2) => b2.minR)),
            maxC: Math.max(...boxes.map((b2) => b2.maxC)),
            maxR: Math.max(...boxes.map((b2) => b2.maxR)),
          },
        ]
      : boxes;

  const round = (n) => Math.round(n * 10_000) / 10_000;
  return merged.map(({ minC, minR, maxC, maxR }) => {
    const x = minC * CELL;
    const y = minR * CELL;
    const w = Math.min(width, (maxC + 1) * CELL) - x;
    const h = Math.min(height, (maxR + 1) * CELL) - y;
    return { x: round(x / width), y: round(y / height), w: round(w / width), h: round(h / height) };
  });
}
