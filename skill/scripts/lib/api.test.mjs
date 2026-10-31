import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, test } from 'node:test';

import { ApiError, createApi, isRetryable, normalizeBaseUrl, withRetry } from './api.mjs';

/** Servidor que responde según `routes["METHOD /ruta"]` y guarda cada petición. */
let server;
let base;
const seen = [];
const routes = {};

before(async () => {
  server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    seen.push({ method: req.method, url: req.url, headers: req.headers, body });
    const handler = routes[`${req.method} ${req.url}`];
    const [status, json] = handler
      ? handler(body)
      : [404, { messageKey: 'http.not_found', message: 'No.' }];
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(json === undefined ? '' : JSON.stringify(json));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

test('normalizeBaseUrl quita la barra final y /v1', () => {
  assert.equal(normalizeBaseUrl('https://api.x.com/'), 'https://api.x.com');
  assert.equal(normalizeBaseUrl(' https://api.x.com/v1/ '), 'https://api.x.com');
  assert.equal(normalizeBaseUrl('http://localhost:3000'), 'http://localhost:3000');
});

test('desenvuelve data, manda el token y agrega /v1', async () => {
  routes['GET /v1/skill/project'] = () => [
    200,
    { messageKey: 'skill.project', data: { id: 'lideris' } },
  ];
  const api = createApi({
    baseUrl: `${base}/v1/`,
    token: 'qa_pat_x',
    userAgent: 'design-review/0.1.0',
  });
  assert.deepEqual(await api.project(), { id: 'lideris' });
  const req = seen.at(-1);
  assert.equal(req.headers.authorization, 'Bearer qa_pat_x');
  assert.equal(req.headers['user-agent'], 'design-review/0.1.0');
});

test('el device flow no manda el token', async () => {
  routes['POST /v1/skill/device'] = (body) => [201, { data: JSON.parse(body) }];
  const api = createApi({ baseUrl: base, token: 'qa_pat_x' });
  const echoed = await api.startDevice({ name: 'design-review' }, 'o/r');
  assert.deepEqual(echoed, { client: { name: 'design-review' }, repo: 'o/r' });
  assert.equal(seen.at(-1).headers.authorization, undefined);
});

test('create manda la Idempotency-Key', async () => {
  routes['POST /v1/reviews'] = () => [201, { data: { id: 'QR-0001' } }];
  await createApi({ baseUrl: base, token: 't' }).create(
    { project: 'p' },
    'design-review:create:1:abc',
  );
  assert.equal(seen.at(-1).headers['idempotency-key'], 'design-review:create:1:abc');
});

test('un error trae status, clave, mensaje y detalles', async () => {
  routes['POST /v1/reviews/QR-0001/publish'] = () => [
    422,
    {
      statusCode: 422,
      messageKey: 'reviews.missing_uploads',
      message: 'Faltan 1',
      details: { missing: ['a'] },
    },
  ];
  await assert.rejects(createApi({ baseUrl: base, token: 't' }).publish('QR-0001'), (error) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 422);
    assert.equal(error.key, 'reviews.missing_uploads');
    assert.deepEqual(error.details, { missing: ['a'] });
    return true;
  });
});

test('una respuesta sin JSON da http.<status>', async () => {
  routes['GET /v1/skill/reviews?pr=1'] = () => [502, undefined];
  await assert.rejects(createApi({ baseUrl: base, token: 't' }).reviewByPr(1), {
    key: 'http.502',
    status: 502,
  });
});

test('sin servidor es network.unreachable con status 0', async () => {
  await assert.rejects(createApi({ baseUrl: 'http://127.0.0.1:1' }).project(), {
    key: 'network.unreachable',
    status: 0,
  });
});

test('upload hace PUT a la URL firmada con sus cabeceras', async () => {
  routes['PUT /storage/x.png'] = () => [200, undefined];
  const api = createApi({ baseUrl: 'http://otro-host.invalid', token: 't' });
  await api.upload(
    { screenKey: 'a', url: `${base}/storage/x.png`, headers: { 'content-type': 'image/png' } },
    Buffer.from('png'),
  );
  const req = seen.at(-1);
  assert.equal(req.method, 'PUT');
  assert.equal(req.headers['content-type'], 'image/png');
  assert.equal(req.headers.authorization, undefined);
  assert.equal(req.body, 'png');
});

test('withRetry reintenta red y 5xx, nunca un 4xx', async () => {
  const waits = [];
  const sleep = async (ms) => waits.push(ms);
  let calls = 0;
  const flaky = async () => {
    calls += 1;
    if (calls < 3) throw new ApiError(503, 'http.503', 'caído');
    return 'ok';
  };
  assert.equal(await withRetry(flaky, { sleep }), 'ok');
  assert.deepEqual(waits, [500, 1000]);

  calls = 0;
  const conflict = async () => {
    calls += 1;
    throw new ApiError(409, 'reviews.exists', 'ya');
  };
  await assert.rejects(withRetry(conflict, { sleep }), { key: 'reviews.exists' });
  assert.equal(calls, 1);
  assert.equal(isRetryable(new ApiError(0, 'network.unreachable', '')), true);
  assert.equal(isRetryable(new Error('x')), false);
});
