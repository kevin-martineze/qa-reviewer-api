import { readFile } from 'node:fs/promises';

import { OPENAPI_FILE, renderOpenApi, sortKeys } from '../src/shared/docs/openapi-file';

describe('openapi.json', () => {
  it('está al día con el código (si falla: pnpm openapi)', async () => {
    const committed = await readFile(OPENAPI_FILE, 'utf8');
    expect(await renderOpenApi()).toBe(committed);
  });

  it('ordena las claves en todos los niveles y deja los arreglos igual', () => {
    expect(JSON.stringify(sortKeys({ b: 1, a: { d: [3, 1], c: null } }))).toBe(
      '{"a":{"c":null,"d":[3,1]},"b":1}',
    );
  });
});
