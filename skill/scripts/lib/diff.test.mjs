import assert from 'node:assert/strict';
import { test } from 'node:test';

import { changedRegions } from './diff.mjs';

function image(width, height, paint = () => [255, 255, 255]) {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = paint(x, y);
      data.set([r, g, b, 255], (y * width + x) * 4);
    }
  }
  return { width, height, data };
}

test('sin cambios no hay zonas', () => {
  assert.deepEqual(changedRegions(image(64, 64), image(64, 64)), []);
});

test('tamaños distintos no se comparan', () => {
  assert.equal(changedRegions(image(64, 64), image(64, 32)), null);
});

test('un bloque cambiado sale en fracciones, alineado a la celda', () => {
  const after = image(128, 64, (x, y) =>
    x >= 32 && x < 64 && y < 16 ? [0, 0, 0] : [255, 255, 255],
  );
  assert.deepEqual(changedRegions(image(128, 64), after), [{ x: 0.25, y: 0, w: 0.25, h: 0.25 }]);
});

test('dos zonas separadas salen por aparte', () => {
  const after = image(128, 128, (x, y) =>
    (x < 16 && y < 16) || (x >= 96 && y >= 96) ? [0, 0, 0] : [255, 255, 255],
  );
  assert.equal(changedRegions(image(128, 128), after).length, 2);
});

test('el antialias de unos pocos píxeles se ignora', () => {
  const after = image(64, 64, (x, y) => (x === 5 && y === 5 ? [0, 0, 0] : [255, 255, 255]));
  assert.deepEqual(changedRegions(image(64, 64), after), []);
});
