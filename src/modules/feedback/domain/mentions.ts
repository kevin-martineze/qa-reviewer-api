// Menciones `@persona` en comentarios y respuestas (docs/algorithms.md).

export interface Mentionable {
  id: string;
  name: string;
  email: string;
}

/** Minúsculas y sin tildes: «@Andrés» y «@andres» son la misma mención. */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

const WORD = /[\p{L}\p{N}_]/u;

/**
 * Ids de las personas mencionadas, sin repetir. Tras cada `@` se prueba el nombre completo o la
 * parte local del correo, de la más larga a la más corta, para que «@Ana María» no se quede en
 * «@Ana». La mención termina donde no sigue una letra o un número. O(m × k).
 */
export function findMentions(body: string, people: readonly Mentionable[]): string[] {
  const text = normalize(body);
  const handles = people
    .flatMap((p) => [
      { id: p.id, handle: normalize(p.name.trim()) },
      { id: p.id, handle: normalize(p.email.split('@')[0] ?? '') },
    ])
    .filter((h) => h.handle.length > 0)
    .sort((a, b) => b.handle.length - a.handle.length);

  const found = new Set<string>();
  for (let at = text.indexOf('@'); at !== -1; at = text.indexOf('@', at + 1)) {
    const rest = text.slice(at + 1);
    const hit = handles.find(
      (h) => rest.startsWith(h.handle) && !WORD.test(rest.charAt(h.handle.length)),
    );
    if (hit) found.add(hit.id);
  }
  return [...found];
}
