#!/usr/bin/env node
// Cliente del API de QA Reviewer para la skill /design-review. Sin dependencias: Node 22.
//
//   node client.mjs login                     entrar con el navegador (device flow)
//   node client.mjs whoami                    cuenta y proyecto de las credenciales
//   node client.mjs logout                    olvidar las credenciales de este API
//   node client.mjs project                   configuración del proyecto (JSON)
//   node client.mjs submit <manifest.json> --captures <dir>
//   node client.mjs status [--pr <n> | --review <id>]
//
// Opciones: --api <url> (si no, QA_REVIEWER_API_URL; si no, http://localhost:3000),
// --wait <s> (login, por defecto 540). QA_REVIEWER_NO_BROWSER=1 no abre el navegador.
// Token: QA_REVIEWER_TOKEN (CI) o el guardado por `login` en ~/.config/qa-reviewer.
// Salida: JSON en stdout (project, submit, whoami), texto en status; mensajes en stderr.
// Códigos: 0 bien, 1 error del API o de los datos, 2 uso incorrecto, 3 skill desactualizada.
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { hostname } from 'node:os';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { ApiError, createApi, normalizeBaseUrl } from './lib/api.mjs';
import { credentialStore } from './lib/credentials.mjs';
import { currentPr, gitRepo } from './lib/git.mjs';
import { login } from './lib/login.mjs';
import { submit } from './lib/submit.mjs';
import { compareVersions, skillVersion } from './lib/version.mjs';

const say = (line) => process.stderr.write(`${line}\n`);
const print = (value) =>
  process.stdout.write(
    typeof value === 'string' ? `${value}\n` : `${JSON.stringify(value, null, 2)}\n`,
  );

class UsageError extends Error {}

const DEFAULT_API_URL = 'http://localhost:3000';

/** Abre la URL en el navegador; si no se puede, la persona la abre a mano (ya se imprimió). */
function openBrowser(url) {
  if (process.env.QA_REVIEWER_NO_BROWSER) return;
  const [cmd, args] =
    process.platform === 'darwin'
      ? ['open', [url]]
      : process.platform === 'win32'
        ? ['cmd', ['/c', 'start', '', url]]
        : ['xdg-open', [url]];
  try {
    const child = spawn(cmd, args, { detached: true, stdio: 'ignore' });
    child.on('error', () => {});
    child.unref();
  } catch {
    // Sin navegador (SSH, CI): basta con el enlace.
  }
}

async function main(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      api: { type: 'string' },
      captures: { type: 'string' },
      pr: { type: 'string' },
      review: { type: 'string' },
      wait: { type: 'string' },
    },
  });
  const [command, ...rest] = positionals;
  if (!command)
    throw new UsageError('Falta el comando: login, whoami, logout, project, submit o status.');

  const apiUrl = normalizeBaseUrl(values.api || process.env.QA_REVIEWER_API_URL || DEFAULT_API_URL);
  const version = await skillVersion();
  const userAgent = `design-review/${version} (node ${process.versions.node})`;
  const store = credentialStore();
  const envToken = process.env.QA_REVIEWER_TOKEN || null;

  const doLogin = async () => {
    const wait = values.wait ? Number.parseInt(values.wait, 10) : undefined;
    return login({
      api: createApi({ baseUrl: apiUrl, userAgent }),
      store,
      apiUrl,
      client: { name: 'design-review', version, hostname: hostname() },
      repo: await gitRepo(),
      open: openBrowser,
      say,
      waitSeconds: Number.isInteger(wait) && wait > 0 ? wait : undefined,
    });
  };

  /** Corre `fn` con un cliente autenticado; sin credenciales o con un token revocado, entra primero. */
  const authed = async (fn) => {
    if (envToken) return fn(createApi({ baseUrl: apiUrl, token: envToken, userAgent }));
    let creds = await store.get(apiUrl);
    if (!creds) {
      say('Sin credenciales para este API: entra con el navegador.');
      creds = await doLogin();
    }
    try {
      return await fn(createApi({ baseUrl: apiUrl, token: creds.token, userAgent }));
    } catch (error) {
      if (!(error instanceof ApiError) || error.key !== 'auth.invalid_token') throw error;
      say('El token guardado ya no sirve (revocado o vencido): entra otra vez.');
      await store.remove(apiUrl);
      creds = await doLogin();
      return fn(createApi({ baseUrl: apiUrl, token: creds.token, userAgent }));
    }
  };

  /** Configuración del proyecto; corta si la skill está más vieja de lo que el API admite. */
  const projectOf = async (api) => {
    const project = await api.project();
    if (compareVersions(version, project.minSkillVersion) < 0) {
      const error = new ApiError(
        426,
        'skill.outdated',
        `La skill es ${version} y el API pide ${project.minSkillVersion} o más: corre /plugin update qa-reviewer.`,
      );
      error.exitCode = 3;
      throw error;
    }
    return project;
  };

  switch (command) {
    case 'login': {
      if (envToken)
        say('Aviso: QA_REVIEWER_TOKEN está definido y tiene prioridad sobre este login.');
      const creds = await doLogin();
      say(`Listo: ${creds.user.name} en ${creds.project.name}.`);
      print({ apiUrl, project: creds.project, user: creds.user });
      return;
    }
    case 'logout': {
      const creds = await store.get(apiUrl);
      await store.remove(apiUrl);
      await store.clearPending(apiUrl);
      say(
        creds
          ? 'Credenciales borradas de este equipo. El token sigue vigente hasta que lo revoques en QA Reviewer → Cuenta → Tokens.'
          : 'No había credenciales para este API.',
      );
      return;
    }
    case 'whoami': {
      if (envToken) {
        const project = await authed(projectOf);
        print({
          apiUrl,
          source: 'QA_REVIEWER_TOKEN',
          project: { id: project.id, name: project.name },
        });
        return;
      }
      const creds = await store.get(apiUrl);
      if (!creds)
        throw new ApiError(401, 'auth.required', 'Sin credenciales para este API: corre login.');
      print({
        apiUrl,
        source: store.path,
        project: creds.project,
        user: creds.user,
        savedAt: creds.savedAt,
      });
      return;
    }
    case 'project': {
      print(await authed(projectOf));
      return;
    }
    case 'submit': {
      const [manifestPath] = rest;
      if (!manifestPath) throw new UsageError('Uso: submit <manifest.json> --captures <carpeta>');
      if (!values.captures)
        throw new UsageError('Falta --captures <carpeta> (p. ej. .design-review/out/captures).');
      let manifest;
      try {
        manifest = JSON.parse(await readFile(resolve(manifestPath), 'utf8'));
      } catch (error) {
        throw new UsageError(`No se pudo leer el manifiesto ${manifestPath}: ${error.message}`);
      }
      const result = await authed(async (api) => {
        const project = await projectOf(api);
        if (manifest.project && manifest.project !== project.id) {
          throw new ApiError(
            403,
            'manifest.project_mismatch',
            `El manifiesto es de «${manifest.project}» y el token, de «${project.id}».`,
          );
        }
        return submit({
          api,
          manifest: { ...manifest, project: project.id },
          capturesDir: resolve(values.captures),
          say,
        });
      });
      say(
        `${result.created ? 'Revisión creada' : 'Ronda nueva'}: ${result.id}, ronda ${result.round}, ${result.changed.length} pantallas cambiadas. ${result.url}`,
      );
      print(result);
      return;
    }
    case 'status': {
      const text = await authed(async (api) => {
        let reviewId = values.review ?? null;
        if (!reviewId) {
          const pr = values.pr ? Number.parseInt(values.pr, 10) : await currentPr();
          if (!pr)
            throw new UsageError(
              'No encontré el PR de esta rama: pasa --pr <número> o --review <id>.',
            );
          try {
            reviewId = (await api.reviewByPr(pr)).id;
          } catch (error) {
            if (error instanceof ApiError && error.key === 'reviews.not_found') {
              throw new ApiError(
                404,
                'reviews.not_found',
                `El PR #${pr} no tiene revisión en QA Reviewer.`,
              );
            }
            throw error;
          }
        }
        const feedback = await api.feedback(reviewId);
        const r = feedback.review;
        return `${r.id} · ronda ${r.round} · ${r.status}\n\n${feedback.text}`;
      });
      print(text);
      return;
    }
    default:
      throw new UsageError(`Comando desconocido: ${command}.`);
  }
}

main(process.argv.slice(2)).catch((error) => {
  if (error instanceof UsageError) {
    say(`✗ ${error.message}`);
    process.exit(2);
  }
  if (error instanceof ApiError) {
    say(`✗ ${error.key}: ${error.message}`);
    if (error.details) say(JSON.stringify(error.details));
    process.exit(error.exitCode ?? 1);
  }
  say(`✗ ${error?.stack ?? error}`);
  process.exit(1);
});
