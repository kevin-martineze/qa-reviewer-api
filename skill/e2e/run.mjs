#!/usr/bin/env node
// Prueba de punta a punta de /design-review: login por navegador, captura, publicación de
// dos rondas, veredictos de diseño y `status`. El «producto» que se captura es la web de
// qa-reviewer en modo mock (datos sintéticos, nunca reales).
//
// Necesita corriendo (ver e2e/README.md):
//   - el API con la semilla de demo, recién arrancado:  PORT=3100 pnpm demo
//   - la web de qa-reviewer en modo mock:               REVIEWS_SOURCE=mock pnpm exec vite dev --port 5199
//
//   QA_REVIEWER_API_URL (http://localhost:3100) · PRODUCT_URL (http://localhost:5199)
//
// Sale con 0 si todo se cumple; con 1 y el paso que falló si no.
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const SKILL = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const API_URL = (process.env.QA_REVIEWER_API_URL ?? 'http://localhost:3100').replace(/\/$/, '');
const PRODUCT_URL = (process.env.PRODUCT_URL ?? 'http://localhost:5199').replace(/\/$/, '');
const PASSWORD = 'demo1234';
const DEV = 'kevin@ejemplo.co'; // developer en lideris
const DESIGNER = 'laura.rios@ejemplo.co'; // design_lead en lideris
const PROJECT = 'lideris';
// Un PR por corrida: así se puede repetir sin reiniciar el API.
const PR = 9000 + (Date.now() % 1000);

const step = (text) => process.stdout.write(`\n▸ ${text}\n`);
const ok = (text) => process.stdout.write(`  ✓ ${text}\n`);

function check(condition, message) {
  if (!condition) throw new Error(message);
  ok(message);
}

/** Corre un script de la skill; devuelve stdout. `onStderr` recibe cada trozo de stderr. */
function run(script, args, { env = {}, cwd, onStderr } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [join(SKILL, 'scripts', script), ...args], {
      cwd,
      env: { ...process.env, ...env },
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => {
      err += d;
      onStderr?.(String(d));
    });
    child.on('close', (code) => {
      if (code === 0) resolvePromise(out);
      else reject(new Error(`${script} ${args[0]} salió con ${code}:\n${err || out}`));
    });
  });
}

async function api(method, path, { token, body } = {}) {
  const res = await fetch(`${API_URL}/v1${path}`, {
    method,
    headers: {
      accept: 'application/json',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text}`);
  return json?.data;
}

const session = async (email) =>
  (await api('POST', '/auth/login', { body: { email, password: PASSWORD } })).token;

/** Sesión del producto (la web en mock) para que la captura entre como el dev. */
async function productSession(statePath) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`${PRODUCT_URL}/login`);
  await page.getByLabel('Correo').fill(DEV);
  await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
  await page.context().storageState({ path: statePath });
  await browser.close();
}

function plan(project, round) {
  const profile = (width) => ({
    key: `perfil-${width}`,
    route: '/settings/profile',
    path: '/settings/profile',
    viewport: { width, height: 720 },
    // En la ronda 2 «el dev corrigió» el perfil: el nombre cambia y la captura también.
    steps: round === 2 ? [{ fill: { selector: '#name', value: 'Kevin Martínez (ronda 2)' } }] : [],
    elements: [
      {
        name: 'Campo Nombre',
        file: 'src/routes/(app)/settings/profile/+page.svelte',
        line: 52,
        selector: '#name',
      },
    ],
  });
  return {
    baseUrl: PRODUCT_URL,
    beforeBaseUrl: null,
    storageState: 'auth.json',
    // Los del proyecto más los que Claude agrega al ver el diff: aquí, el correo del perfil.
    maskSelectors: [...project.maskSelectors, '#email'],
    limits: project.limits,
    screens: [
      profile(1280),
      profile(1440),
      {
        key: 'notificaciones-1280',
        route: '/settings/notifications',
        path: '/settings/notifications',
        viewport: { width: 1280, height: 720 },
        elements: [
          {
            name: 'Preferencias de correo',
            file: 'src/routes/(app)/settings/notifications/+page.svelte',
            line: 49,
            selector: '[id^="pref-"]',
          },
        ],
      },
    ],
  };
}

/** Lo que Claude redacta en la skill real; aquí, textos fijos sobre lo medido. */
function manifest(screens, round) {
  return {
    manifestVersion: 1,
    project: PROJECT,
    card: { key: 'LIDER-900', title: 'Prueba de punta a punta de la skill' },
    pr: {
      number: PR,
      url: `https://github.com/estudio-norte/lideris-v2/pull/${PR}`,
      title: 'test(skill): prueba de punta a punta',
      base: 'develop',
      head: 'test/skill-e2e',
      author: 'kevin-martineze',
      commit: round === 1 ? 'e2e00001' : 'e2e00002',
    },
    title: 'Ajustes de la cuenta',
    context: 'Cuenta · perfil y notificaciones',
    module: 'Cuenta',
    note: round === 2 ? 'Se corrigió el nombre que mostraba el perfil.' : null,
    summary: {
      steps: [{ title: 'Abrir la cuenta', body: 'Desde el menú, Cuenta → Perfil.' }],
      rules: ['El correo lo cambia un admin.'],
    },
    screens: screens.map((s) => ({
      key: s.key,
      title: s.key.startsWith('perfil') ? `Perfil a ${s.viewport.width} px` : 'Notificaciones',
      lead: 'Cuenta de prueba del mock.',
      route: s.route,
      viewport: s.viewport,
      captures: s.captures,
      elements: s.elements,
      diff: s.diff ?? [],
      note: round === 2 && s.key.startsWith('perfil') ? 'Nombre corregido.' : null,
      changes: ['Campo de nombre más visible.'],
      questions: ['¿Se lee bien el correo deshabilitado?'],
    })),
    notCaptured: [{ title: 'Error al guardar', body: 'No se reproduce con el mock.' }],
    privacy: { masked: true, dataset: 'qa-reviewer-mock' },
    generator: { name: 'design-review-skill', version: '0.1.0' },
  };
}

async function captureRound(work, project, round) {
  const planPath = join(work, 'plan.json');
  await writeFile(planPath, JSON.stringify(plan(project, round), null, 2));
  await run('capture.mjs', ['run', planPath]);
  const screens = JSON.parse(await readFile(join(work, 'out', 'screens.json'), 'utf8'));
  const manifestPath = join(work, `manifest-${round}.json`);
  await writeFile(manifestPath, JSON.stringify(manifest(screens.screens, round), null, 2));
  return { screens, manifestPath };
}

async function main() {
  const work = await mkdtemp(join(tmpdir(), 'design-review-e2e-'));
  const env = {
    QA_REVIEWER_API_URL: API_URL,
    QA_REVIEWER_NO_BROWSER: '1',
    XDG_CONFIG_HOME: join(work, 'config'),
    QA_REVIEWER_TOKEN: '',
  };
  process.stdout.write(`API ${API_URL} · producto ${PRODUCT_URL} · PR ${PR} · ${work}\n`);

  step('Login por navegador: la skill pide un código y el dev lo aprueba en /device');
  const devSession = await session(DEV);
  let approved = false;
  const login = run('client.mjs', ['login', '--wait', '60'], {
    env,
    cwd: work,
    onStderr: (chunk) => {
      const code = /código ([A-Z0-9]{4}-[A-Z0-9]{4})/.exec(chunk)?.[1];
      if (!code || approved) return;
      approved = true;
      api('POST', `/device/${code}/approve`, {
        token: devSession,
        body: { projectId: PROJECT },
      }).catch((error) => process.stderr.write(`  ! ${error.message}\n`));
    },
  });
  const creds = JSON.parse(await login);
  check(creds.project.id === PROJECT, `credenciales guardadas para ${creds.project.name}`);
  const project = JSON.parse(await run('client.mjs', ['project'], { env, cwd: work }));
  check(project.maskSelectors.length > 0, `proyecto con ${project.maskSelectors.length} selectores a tapar`);

  step('Ronda 1: captura y publicación');
  await productSession(join(work, 'auth.json'));
  const r1 = await captureRound(work, project, 1);
  check(r1.screens.screens.length === 3, '3 pantallas capturadas');
  const pub1 = JSON.parse(
    await run('client.mjs', ['submit', r1.manifestPath, '--captures', join(work, 'out', 'captures')], {
      env,
      cwd: work,
    }),
  );
  check(pub1.created && pub1.round === 1, `revisión ${pub1.id} creada en la ronda 1`);
  check(pub1.uploaded === 3, 'se subieron las 3 capturas');
  check(r1.screens.maskSelectors.includes('#email'), 'la captura tapó el correo del perfil (#email)');
  await run('capture.mjs', ['keep', work]);

  step('Diseño revisa: aprueba notificaciones y pide ajustes en el perfil');
  const designer = await session(DESIGNER);
  const review1 = await api('GET', `/reviews/${pub1.id}`, { token: designer });
  check(review1.screens.length === 3, `${DESIGNER} ve la revisión con 3 pantallas`);
  await api('PUT', `/reviews/${pub1.id}/screens/notificaciones-1280/verdict`, {
    token: designer,
    body: { verdict: 'approved' },
  });
  for (const key of ['perfil-1280', 'perfil-1440']) {
    await api('PUT', `/reviews/${pub1.id}/screens/${key}/verdict`, {
      token: designer,
      body: { verdict: 'changes_requested' },
    });
  }
  const element = review1.screens.find((s) => s.key === 'perfil-1280')?.elements?.[0];
  check(Boolean(element), 'el perfil trae el componente medido por la captura');
  const anchorX = element.box ? element.box.x + element.box.w / 2 : 0.5;
  const anchorY = element.box ? element.box.y + element.box.h / 2 : 0.5;
  const commentBody = 'El nombre se corta: dale más ancho al campo.';
  await api('POST', `/reviews/${pub1.id}/screens/perfil-1280/comments`, {
    token: designer,
    body: {
      body: commentBody,
      anchor: { x: anchorX, y: anchorY },
      el: { name: element.name, file: element.file, line: element.line, selector: element.selector },
    },
  });
  const submitted = await api('POST', `/reviews/${pub1.id}/submit`, {
    token: designer,
    body: { body: 'Falta el ajuste del perfil.' },
  });
  check(submitted.status === 'changes_requested', 'envío con resultado «requiere ajustes»');

  step('status trae el feedback a la sesión del dev');
  const status1 = await run('client.mjs', ['status', '--review', pub1.id], { env, cwd: work });
  check(status1.includes(commentBody), 'el texto de status incluye el comentario');
  check(status1.includes('+page.svelte'), 'y cita el archivo del componente');

  step('Ronda 2: solo el perfil cambió');
  const r2 = await captureRound(work, project, 2);
  const changedLocally = r2.screens.screens.filter((s) => s.diff?.length).map((s) => s.key);
  check(
    changedLocally.length === 2 && changedLocally.every((k) => k.startsWith('perfil')),
    `la captura marca zonas de cambio solo en el perfil (${changedLocally.join(', ')})`,
  );
  const pub2 = JSON.parse(
    await run('client.mjs', ['submit', r2.manifestPath, '--captures', join(work, 'out', 'captures')], {
      env,
      cwd: work,
    }),
  );
  check(!pub2.created && pub2.id === pub1.id && pub2.round === 2, `ronda 2 de ${pub2.id}`);
  check(
    pub2.changed.length === 2 && pub2.changed.every((k) => k.startsWith('perfil')),
    `el API registró 2 pantallas cambiadas (${pub2.changed.join(', ')})`,
  );
  check(pub2.uploaded === 2, 'se subieron solo las 2 capturas nuevas');

  const review2 = await api('GET', `/reviews/${pub1.id}`, { token: designer });
  const byKey = Object.fromEntries(review2.screens.map((s) => [s.key, s]));
  check(
    byKey['notificaciones-1280'].inherited && byKey['notificaciones-1280'].verdict === 'approved',
    'notificaciones hereda «aprobada»',
  );
  check(
    byKey['perfil-1280'].verdict === 'pending' && byKey['perfil-1280'].changedIn === 2,
    'el perfil vuelve a pendiente y cambió en la ronda 2',
  );

  process.stdout.write(`\nTodo en orden. Revisión: ${pub2.url}\n`);
}

main().catch((error) => {
  process.stderr.write(`\n✗ ${error.message}\n`);
  process.exit(1);
});
