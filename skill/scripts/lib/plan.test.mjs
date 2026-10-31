import assert from 'node:assert/strict';
import { test } from 'node:test';

import { validatePlan } from './plan.mjs';

const screen = {
  key: 'edit-1280',
  route: '/preorders/[id]',
  path: '/preorders/PRE-1',
  viewport: { width: 1280, height: 720 },
};
const plan = { baseUrl: 'http://localhost:5173', maskSelectors: [], screens: [screen] };

test('un plan mínimo sirve', () => {
  assert.deepEqual(validatePlan(plan), []);
});

test('keys repetidas o con mayúsculas', () => {
  const errors = validatePlan({ ...plan, screens: [screen, screen, { ...screen, key: 'Edit' }] });
  assert.equal(errors.length, 2);
  assert.match(errors[0], /repetida/);
  assert.match(errors[1], /minúsculas/);
});

test('el ancho respeta los límites del proyecto', () => {
  const narrow = { ...screen, viewport: { width: 800, height: 720 } };
  assert.match(validatePlan({ ...plan, screens: [narrow] })[0], /entre 1024 y 1920/);
  const limits = { viewport: { min: 768, max: 1440 } };
  assert.deepEqual(validatePlan({ ...plan, limits, screens: [narrow] }), []);
});

test('pasos con una sola acción y su forma', () => {
  const steps = [{ click: 'button' }, { fill: { selector: 'input' } }, { click: 'a', hover: 'b' }];
  const errors = validatePlan({ ...plan, screens: [{ ...screen, steps }] });
  assert.equal(errors.length, 2);
  assert.match(errors[0], /fill lleva/);
  assert.match(errors[1], /exactamente uno/);
});

test('maskSelectors es obligatorio aunque vaya vacío', () => {
  const { maskSelectors: _omit, ...rest } = plan;
  assert.match(validatePlan(rest)[0], /maskSelectors/);
});
