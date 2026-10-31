#!/usr/bin/env node
// Captura de pantallas para /design-review.
//
//   node capture.mjs login <url> [--state .design-review/auth.json]
//     Abre un navegador visible para iniciar sesión a mano. Al cerrar la pestaña guarda
//     la sesión (cookies y storage) para las capturas.
//
//   node capture.mjs run <plan.json> [--out <carpeta>] [--previous <carpeta>]
//     Abre cada pantalla del plan, tapa los selectores sensibles, toma la captura (y la de
//     la rama base si hay beforeBaseUrl), mide la caja de cada componente y compara con la
//     ronda anterior. Escribe <out>/captures/*.png y <out>/screens.json: las pantallas
//     parciales del manifiesto v1, sin los textos (los redacta Claude).
//
// Sale con código 1 y los errores en stderr si el plan no sirve o una pantalla falla.
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { chromium } from 'playwright';
import { PNG } from 'pngjs';

import { changedRegions } from './lib/diff.mjs';
import { fileInfo } from './lib/hash.mjs';
import { validatePlan } from './lib/plan.mjs';

/** Color con que se tapan los datos sensibles: gris neutro, visible para quien revisa. */
const MASK_COLOR = '#9CA3AF';
const NAV_TIMEOUT = 30_000;

function option(args, name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

async function login(url, statePath) {
  if (!url || !/^https?:\/\//.test(url)) fail('Uso: capture.mjs login <url> [--state archivo]');
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await page.goto(url);
  process.stdout.write('Inicia sesión en el navegador y cierra la pestaña cuando termines.\n');
  // La sesión se guarda en cada navegación: al cerrar la pestaña ya no hay contexto que leer.
  const save = () => context.storageState({ path: statePath }).catch(() => undefined);
  page.on('framenavigated', save);
  await page.waitForEvent('close', { timeout: 0 });
  await browser.close();
  if (!existsSync(statePath))
    fail('No se guardó la sesión: navega al menos una vez antes de cerrar.');
  process.stdout.write(`Sesión guardada en ${statePath}\n`);
}

async function runStep(page, step) {
  if ('click' in step) return page.locator(step.click).first().click();
  if ('hover' in step) return page.locator(step.hover).first().hover();
  if ('fill' in step) return page.locator(step.fill.selector).first().fill(step.fill.value);
  if ('press' in step) return page.locator(step.press.selector).first().press(step.press.key);
  if ('scroll' in step) return page.locator(step.scroll).first().scrollIntoViewIfNeeded();
  if ('wait' in step) return page.locator(step.wait).first().waitFor({ state: 'visible' });
  if ('waitMs' in step) return page.waitForTimeout(step.waitMs);
  return undefined;
}

/** Deja la página quieta: red en calma, fuentes cargadas y sin animaciones ni cursor. */
async function settle(page) {
  await page.waitForLoadState('networkidle', { timeout: NAV_TIMEOUT }).catch(() => undefined);
  await page.evaluate(() => document.fonts.ready);
}

async function shoot(page, plan, screen, path) {
  await page.setViewportSize(screen.viewport);
  const response = await page.goto(screen.url, { timeout: NAV_TIMEOUT });
  if (response && response.status() >= 400) {
    throw new Error(`${screen.url} respondió ${response.status()}`);
  }
  await settle(page);
  for (const step of screen.steps ?? []) await runStep(page, step);
  await settle(page);
  await page.screenshot({
    path,
    fullPage: Boolean(screen.fullPage),
    animations: 'disabled',
    caret: 'hide',
    mask: plan.maskSelectors.map((s) => page.locator(s)),
    maskColor: MASK_COLOR,
  });
}

/** Caja de cada componente en fracciones 0–1 de la captura. Los que no se ven se reportan. */
async function measure(page, screen, size, warnings) {
  const scroll = screen.fullPage
    ? await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }))
    : { x: 0, y: 0 };
  const out = [];
  for (const el of screen.elements ?? []) {
    const box = await page
      .locator(el.selector)
      .first()
      .boundingBox()
      .catch(() => null);
    if (!box || box.width === 0 || box.height === 0) {
      warnings.push(`${screen.key}: «${el.name}» (${el.selector}) no se ve en la captura.`);
      continue;
    }
    const x = Math.max(0, box.x + scroll.x);
    const y = Math.max(0, box.y + scroll.y);
    const w = Math.min(size.width - x, box.width);
    const h = Math.min(size.height - y, box.height);
    if (w <= 0 || h <= 0) {
      warnings.push(`${screen.key}: «${el.name}» queda fuera de la captura.`);
      continue;
    }
    const round = (n) => Math.round(n * 10_000) / 10_000;
    out.push({
      name: el.name,
      file: el.file,
      line: el.line,
      selector: el.selector,
      box: {
        x: round(x / size.width),
        y: round(y / size.height),
        w: round(w / size.width),
        h: round(h / size.height),
      },
    });
  }
  return out;
}

async function readPng(path) {
  return PNG.sync.read(await readFile(path));
}

async function capture(meta, path) {
  return { key: meta, contentType: 'image/png', ...(await fileInfo(path)) };
}

async function run(planPath, outDir, previousDir) {
  let plan;
  try {
    plan = JSON.parse(await readFile(planPath, 'utf8'));
  } catch (error) {
    fail(`No pude leer el plan ${planPath}: ${error.message}`);
  }
  const errors = validatePlan(plan);
  if (errors.length) fail(`El plan tiene errores:\n- ${errors.join('\n- ')}`);

  const state = plan.storageState ? resolve(dirname(planPath), plan.storageState) : null;
  if (state && !existsSync(state)) {
    fail(`No existe la sesión ${state}. Créala con: capture.mjs login <url> --state ${state}`);
  }

  const capturesDir = join(outDir, 'captures');
  await rm(outDir, { recursive: true, force: true });
  await mkdir(capturesDir, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    storageState: state ?? undefined,
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
    locale: plan.locale ?? 'es-CO',
    timezoneId: plan.timezoneId ?? 'America/Bogota',
  });
  const page = await context.newPage();

  const screens = [];
  const warnings = [];
  const failures = [];
  const maxBytes = plan.limits?.maxBytes ?? 5 * 1024 * 1024;

  for (const screen of plan.screens) {
    const afterKey = `${screen.key}.png`;
    const afterPath = join(capturesDir, afterKey);
    try {
      await shoot(
        page,
        plan,
        { ...screen, url: new URL(screen.path, plan.baseUrl).href },
        afterPath,
      );
      const png = await readPng(afterPath);
      const elements = await measure(page, screen, png, warnings);

      let before = null;
      if (plan.beforeBaseUrl && screen.before !== false) {
        const beforeKey = `${screen.key}.before.png`;
        const beforePath = join(capturesDir, beforeKey);
        try {
          const url = new URL(screen.beforePath ?? screen.path, plan.beforeBaseUrl).href;
          await shoot(page, plan, { ...screen, url }, beforePath);
          before = await capture(beforeKey, beforePath);
        } catch (error) {
          // La pantalla puede no existir en la rama base: es nueva. Se sigue sin «antes».
          warnings.push(`${screen.key}: sin captura base (${error.message.split('\n')[0]}).`);
          await rm(beforePath, { force: true });
        }
      }

      let diff = null;
      const previous = previousDir ? join(previousDir, afterKey) : null;
      if (previous && existsSync(previous)) {
        diff = changedRegions(await readPng(previous), png);
        if (diff === null) warnings.push(`${screen.key}: cambió de tamaño; sin zonas de cambio.`);
      }

      const after = await capture(afterKey, afterPath);
      if (after.bytes > maxBytes) {
        failures.push(`${screen.key}: la captura pesa ${after.bytes} bytes (máximo ${maxBytes}).`);
      }
      screens.push({
        key: screen.key,
        route: screen.route,
        viewport: {
          width: png.width,
          height: screen.fullPage ? png.height : screen.viewport.height,
        },
        captures: { after, before },
        elements,
        ...(diff ? { diff } : {}),
      });
      process.stdout.write(`✓ ${screen.key}\n`);
    } catch (error) {
      failures.push(`${screen.key}: ${error.message.split('\n')[0]}`);
      process.stdout.write(`✗ ${screen.key}\n`);
    }
  }
  await browser.close();

  await writeFile(
    join(outDir, 'screens.json'),
    `${JSON.stringify({ masked: true, maskSelectors: plan.maskSelectors, screens, warnings }, null, 2)}\n`,
  );
  for (const w of warnings) process.stdout.write(`! ${w}\n`);
  if (failures.length) fail(`Fallaron ${failures.length} pantallas:\n- ${failures.join('\n- ')}`);
  process.stdout.write(`${screens.length} pantallas en ${outDir}\n`);
}

/** Guarda las capturas publicadas como «ronda anterior» para calcular el diff de la próxima. */
async function keep(outDir, previousDir) {
  const data = JSON.parse(await readFile(join(outDir, 'screens.json'), 'utf8'));
  await rm(previousDir, { recursive: true, force: true });
  await mkdir(previousDir, { recursive: true });
  for (const screen of data.screens) {
    const key = screen.captures.after.key;
    await copyFile(join(outDir, 'captures', key), join(previousDir, key));
  }
  process.stdout.write(`${data.screens.length} capturas guardadas en ${previousDir}\n`);
}

const [command, target, ...rest] = process.argv.slice(2);
const args = [target, ...rest].filter(Boolean);

if (command === 'login') {
  await login(target, resolve(option(args, '--state', '.design-review/auth.json')));
} else if (command === 'run' && target) {
  const planPath = resolve(target);
  const base = dirname(planPath);
  await run(
    planPath,
    resolve(option(args, '--out', join(base, 'out'))),
    resolve(option(args, '--previous', join(base, 'last'))),
  );
} else if (command === 'keep') {
  const base = resolve(target ?? '.design-review');
  await keep(join(base, 'out'), join(base, 'last'));
} else {
  fail(
    'Uso:\n  capture.mjs login <url> [--state archivo]\n  capture.mjs run <plan.json> [--out carpeta] [--previous carpeta]\n  capture.mjs keep [.design-review]',
  );
}
