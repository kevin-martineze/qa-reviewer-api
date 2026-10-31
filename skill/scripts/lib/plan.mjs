// Validación del plan de captura (.design-review/plan.json). Devuelve la lista de errores
// en español para que Claude los corrija antes de abrir el navegador.

const KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const STEP_KINDS = ['click', 'fill', 'hover', 'press', 'scroll', 'wait', 'waitMs'];

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function checkStep(step, where, errors) {
  if (!isObject(step)) return errors.push(`${where}: cada paso es un objeto.`);
  const kinds = Object.keys(step).filter((k) => STEP_KINDS.includes(k));
  if (kinds.length !== 1) {
    return errors.push(`${where}: usa exactamente uno de ${STEP_KINDS.join(', ')}.`);
  }
  const [kind] = kinds;
  const value = step[kind];
  if (kind === 'waitMs') {
    if (!Number.isInteger(value) || value < 0 || value > 10_000) {
      errors.push(`${where}: waitMs va entre 0 y 10000.`);
    }
  } else if (kind === 'fill' || kind === 'press') {
    const field = kind === 'fill' ? 'value' : 'key';
    if (!isObject(value) || typeof value.selector !== 'string' || typeof value[field] !== 'string') {
      errors.push(`${where}: ${kind} lleva { selector, ${field} }.`);
    }
  } else if (typeof value !== 'string' || !value.trim()) {
    errors.push(`${where}: ${kind} lleva un selector.`);
  }
}

/**
 * @param {unknown} plan
 * @returns {string[]} errores; vacío si el plan sirve.
 */
export function validatePlan(plan) {
  const errors = [];
  if (!isObject(plan)) return ['El plan debe ser un objeto JSON.'];

  if (typeof plan.baseUrl !== 'string' || !/^https?:\/\//.test(plan.baseUrl)) {
    errors.push('baseUrl: URL de la app con la rama de la feature (http://…).');
  }
  if (plan.beforeBaseUrl != null && !/^https?:\/\//.test(String(plan.beforeBaseUrl))) {
    errors.push('beforeBaseUrl: URL de la app en la rama base, o null.');
  }
  if (!Array.isArray(plan.maskSelectors) || plan.maskSelectors.some((s) => typeof s !== 'string')) {
    errors.push('maskSelectors: lista de selectores a tapar (puede ir vacía).');
  }

  const limits = isObject(plan.limits) ? plan.limits : {};
  const min = limits.viewport?.min ?? 1024;
  const max = limits.viewport?.max ?? 1920;
  const maxScreens = limits.maxScreens ?? 40;

  if (!Array.isArray(plan.screens) || plan.screens.length === 0) {
    errors.push('screens: al menos una pantalla.');
    return errors;
  }
  if (plan.screens.length > maxScreens) {
    errors.push(`screens: máximo ${maxScreens} por ronda.`);
  }

  const seen = new Set();
  plan.screens.forEach((screen, i) => {
    const where = `screens[${i}]`;
    if (!isObject(screen)) return errors.push(`${where}: debe ser un objeto.`);
    if (typeof screen.key !== 'string' || !KEY.test(screen.key)) {
      errors.push(`${where}.key: minúsculas, números y guiones (estable entre rondas).`);
    } else if (seen.has(screen.key)) {
      errors.push(`${where}.key: «${screen.key}» está repetida.`);
    } else {
      seen.add(screen.key);
    }
    if (typeof screen.route !== 'string' || !screen.route.startsWith('/')) {
      errors.push(`${where}.route: patrón de la ruta, p. ej. /preorders/[id].`);
    }
    if (typeof screen.path !== 'string' || !screen.path.startsWith('/')) {
      errors.push(`${where}.path: ruta real a abrir, p. ej. /preorders/PRE-1.`);
    }
    const vp = screen.viewport;
    if (!isObject(vp) || !Number.isInteger(vp.width) || !Number.isInteger(vp.height)) {
      errors.push(`${where}.viewport: { width, height } en píxeles.`);
    } else if (vp.width < min || vp.width > max) {
      errors.push(`${where}.viewport.width: entre ${min} y ${max}.`);
    } else if (vp.height < 480 || vp.height > 2160) {
      errors.push(`${where}.viewport.height: entre 480 y 2160.`);
    }
    if (screen.steps !== undefined) {
      if (!Array.isArray(screen.steps)) errors.push(`${where}.steps: lista de pasos.`);
      else screen.steps.forEach((step, j) => checkStep(step, `${where}.steps[${j}]`, errors));
    }
    if (screen.elements !== undefined) {
      if (!Array.isArray(screen.elements)) {
        errors.push(`${where}.elements: lista de componentes.`);
      } else {
        screen.elements.forEach((el, j) => {
          if (!isObject(el) || typeof el.name !== 'string' || typeof el.selector !== 'string') {
            errors.push(`${where}.elements[${j}]: lleva al menos { name, selector }.`);
          }
        });
      }
    }
  });
  return errors;
}
