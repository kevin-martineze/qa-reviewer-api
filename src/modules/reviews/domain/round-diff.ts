// Diff de rondas (docs/algorithms.md): qué pantallas cambiaron, cuáles heredan su veredicto
// y qué capturas hay que subir. O(n) con un mapa por clave.
import type { ManifestCapture, ManifestScreen } from './manifest';
import type { PendingUpload, StoredCapture, StoredScreen } from '../../../shared/schemas';

export type CaptureKind = 'after' | 'before';

/** Clave del objeto en el storage para la captura de una pantalla en la ronda. */
export type CaptureKeyOf = (screenKey: string, kind: CaptureKind, contentType: string) => string;

export interface RoundDiff {
  screens: StoredScreen[];
  changed: string[];
  uploads: PendingUpload[];
}

function stored(
  capture: ManifestCapture,
  screenKey: string,
  kind: CaptureKind,
  keyOf: CaptureKeyOf,
): StoredCapture {
  return {
    key: keyOf(screenKey, kind, capture.contentType),
    contentType: capture.contentType,
    bytes: capture.bytes,
    sha256: capture.sha256.toLowerCase(),
  };
}

/**
 * Pantalla nueva o con otro hash en `after` → cambió: veredicto `pending`, se sube su captura
 * y `previous` apunta a la de la ronda anterior. Mismo hash → hereda captura, veredicto y
 * `changedIn`. Las que ya no vienen salen de la revisión.
 */
export function diffRound(
  previous: readonly StoredScreen[],
  incoming: readonly ManifestScreen[],
  round: number,
  keyOf: CaptureKeyOf,
): RoundDiff {
  const before = new Map(previous.map((s) => [s.key, s]));
  const screens: StoredScreen[] = [];
  const changed: string[] = [];
  const uploads: PendingUpload[] = [];

  for (const screen of incoming) {
    const prev = before.get(screen.key);
    const text = {
      key: screen.key,
      title: screen.title,
      lead: screen.lead,
      route: screen.route,
      viewport: { ...screen.viewport },
      elements: screen.elements.map((e) => ({ ...e, id: `${screen.key}:${e.name}:${e.line}` })),
      changes: [...screen.changes],
      questions: [...screen.questions],
    };

    const sameCapture =
      prev?.after && prev.after.sha256 === screen.captures.after.sha256.toLowerCase();
    if (prev && sameCapture) {
      screens.push({
        ...prev,
        ...text,
        inherited: true,
        previous: null,
        roundNote: null,
        diff: [],
      });
      continue;
    }

    const after = stored(screen.captures.after, screen.key, 'after', keyOf);
    const beforeCapture = screen.captures.before
      ? stored(screen.captures.before, screen.key, 'before', keyOf)
      : null;
    uploads.push({ screenKey: screen.key, kind: 'after', capture: after });
    if (beforeCapture)
      uploads.push({ screenKey: screen.key, kind: 'before', capture: beforeCapture });
    changed.push(screen.key);
    screens.push({
      ...text,
      after,
      before: beforeCapture,
      previous: prev?.after ?? null,
      changedIn: round,
      inherited: false,
      roundNote: round > 1 ? screen.note : null,
      diff: screen.diff.map((b) => ({ ...b })),
      verdict: 'pending',
    });
  }
  return { screens, changed, uploads };
}
