// Manifiesto v1 de la skill `/design-review` (qa-reviewer/docs/architecture/domain.md).
// Joi valida la forma; aquí van los chequeos que dependen del proyecto y de la revisión.
import type { Box, ElementRef } from '../../../shared/contract';
import type { ProjectLimits } from '../../../shared/schemas';

export const SUPPORTED_VERSIONS: readonly number[] = [1];

export interface ManifestCapture {
  key: string;
  contentType: string;
  bytes: number;
  sha256: string;
}

export interface ManifestScreen {
  key: string;
  title: string;
  lead: string;
  route: string;
  viewport: { width: number; height: number };
  captures: { after: ManifestCapture; before: ManifestCapture | null };
  elements: Array<ElementRef & { box: Box }>;
  diff: Box[];
  note: string | null;
  changes: string[];
  questions: string[];
}

export interface Manifest {
  manifestVersion: number;
  project: string;
  card: { key: string; title: string };
  pr: {
    number: number;
    url: string;
    title: string;
    base: string;
    head: string;
    author: string;
    commit: string;
  };
  title: string;
  context: string;
  module: string;
  note: string | null;
  summary: { steps: Array<{ title: string; body: string }>; rules: string[] };
  screens: ManifestScreen[];
  notCaptured: Array<string | { title: string; body: string }>;
  privacy: { masked: boolean; dataset: string };
  generator: { name: string; version: string } | null;
}

export interface ManifestContext {
  limits: ProjectLimits;
  /** Proyecto del token de la skill; `null` con sesión de la web. */
  tokenProject: string | null;
  /** PR de la revisión existente, al subir una ronda. */
  reviewPr: number | null;
}

export interface ManifestProblem {
  status: 403 | 422;
  key: string;
  message: string;
  details?: Record<string, unknown>;
}

type Check = (m: Manifest, ctx: ManifestContext) => ManifestProblem | null;

const version: Check = (m) =>
  SUPPORTED_VERSIONS.includes(m.manifestVersion)
    ? null
    : {
        status: 422,
        key: 'manifest.version_unsupported',
        message: `Esta versión del manifiesto no se soporta. Actualiza la skill (versiones: ${SUPPORTED_VERSIONS.join(', ')}).`,
        details: { supported: SUPPORTED_VERSIONS },
      };

const privacy: Check = (m) =>
  m.privacy.masked
    ? null
    : {
        status: 422,
        key: 'manifest.privacy_required',
        message: 'Las capturas deben salir con los datos sensibles enmascarados (privacy.masked).',
      };

const tokenProject: Check = (m, ctx) =>
  ctx.tokenProject === null || ctx.tokenProject === m.project
    ? null
    : {
        status: 403,
        key: 'manifest.project_mismatch',
        message: 'El token de la skill es de otro proyecto.',
        details: { tokenProject: ctx.tokenProject },
      };

const screenCount: Check = (m, ctx) =>
  m.screens.length <= ctx.limits.maxScreens
    ? null
    : {
        status: 422,
        key: 'manifest.too_many_screens',
        message: `El proyecto admite hasta ${ctx.limits.maxScreens} pantallas por ronda.`,
        details: { max: ctx.limits.maxScreens },
      };

const captures: Check = (m, ctx) => {
  for (const screen of m.screens) {
    const { after, before } = screen.captures;
    for (const [kind, capture] of [
      ['after', after],
      ['before', before],
    ] as const) {
      if (!capture) continue;
      if (!ctx.limits.contentTypes.includes(capture.contentType)) {
        return {
          status: 422,
          key: 'manifest.invalid_capture',
          message: `Formato de imagen no admitido en «${screen.key}» (${ctx.limits.contentTypes.join(', ')}).`,
          details: { screen: screen.key, kind },
        };
      }
      if (capture.bytes > ctx.limits.maxBytes) {
        return {
          status: 422,
          key: 'manifest.invalid_capture',
          message: `La captura de «${screen.key}» supera el máximo de ${Math.round(ctx.limits.maxBytes / 1024 / 1024)} MB.`,
          details: { screen: screen.key, kind },
        };
      }
    }
  }
  return null;
};

const viewports: Check = (m, ctx) => {
  const out = m.screens.find(
    (s) => s.viewport.width < ctx.limits.viewportMin || s.viewport.width > ctx.limits.viewportMax,
  );
  return out
    ? {
        status: 422,
        key: 'manifest.viewport',
        message: `El ancho de «${out.key}» debe estar entre ${ctx.limits.viewportMin} y ${ctx.limits.viewportMax}.`,
        details: { screen: out.key },
      }
    : null;
};

const uniqueKeys: Check = (m) => {
  const seen = new Set<string>();
  for (const s of m.screens) {
    if (seen.has(s.key)) {
      return {
        status: 422,
        key: 'manifest.duplicate_screens',
        message: `La pantalla «${s.key}» está repetida.`,
        details: { screen: s.key },
      };
    }
    seen.add(s.key);
  }
  return null;
};

const samePr: Check = (m, ctx) =>
  ctx.reviewPr === null || ctx.reviewPr === m.pr.number
    ? null
    : {
        status: 422,
        key: 'manifest.pr_mismatch',
        message: `Esta revisión es del PR #${ctx.reviewPr}; el manifiesto trae el #${m.pr.number}.`,
      };

/** Chain of Responsibility: el primer chequeo que falla corta la cadena. */
export const MANIFEST_CHECKS: readonly Check[] = [
  version,
  privacy,
  tokenProject,
  screenCount,
  captures,
  viewports,
  uniqueKeys,
  samePr,
];

export function manifestProblem(m: Manifest, ctx: ManifestContext): ManifestProblem | null {
  for (const check of MANIFEST_CHECKS) {
    const problem = check(m, ctx);
    if (problem) return problem;
  }
  return null;
}

/** `module` explícito o el primer segmento de la ruta de la primera pantalla. */
export function moduleOf(m: Manifest): string {
  if (m.module.trim()) return m.module.trim();
  return m.screens[0]?.route.split('/').find(Boolean) ?? '';
}

/** Los estados no capturados se guardan como texto («título: cuerpo»). */
export function notCapturedText(m: Manifest): string[] {
  return m.notCaptured.map((n) => (typeof n === 'string' ? n : `${n.title}: ${n.body}`));
}
