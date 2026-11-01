import { orgSlug, parseBootstrapInput } from './domain';

describe('orgSlug', () => {
  it('quita tildes, signos y espacios', () => {
    expect(orgSlug('Estudio Norte S.A.S.')).toBe('estudio-norte-s-a-s');
    expect(orgSlug('  Diseño & Producción  ')).toBe('diseno-produccion');
  });

  it('corta en 40 sin dejar un guion al final', () => {
    const slug = orgSlug(`${'a'.repeat(39)} b`);
    expect(slug).toBe('a'.repeat(39));
  });

  it('sin letras ni números queda vacío', () => {
    expect(orgSlug('¡¿?!')).toBe('');
  });
});

describe('parseBootstrapInput', () => {
  it('normaliza el correo y deriva el id del nombre', () => {
    const res = parseBootstrapInput({
      org: 'Estudio Norte',
      owner: ' Kevin@Ejemplo.co ',
      name: 'Kevin Martínez',
    });
    expect(res.value).toEqual({
      org: 'Estudio Norte',
      orgId: 'estudio-norte',
      owner: 'kevin@ejemplo.co',
      name: 'Kevin Martínez',
    });
  });

  it('un --id explícito gana, pero tiene que ser un slug', () => {
    expect(
      parseBootstrapInput({ org: 'X Y', id: 'xy', owner: 'a@b.co', name: 'Ana' }).value?.orgId,
    ).toBe('xy');
    expect(
      parseBootstrapInput({ org: 'X Y', id: 'X Y', owner: 'a@b.co', name: 'Ana' }).errors,
    ).toHaveLength(1);
  });

  it('dice todo lo que falta', () => {
    const res = parseBootstrapInput({ owner: 'no-es-correo' });
    expect(res.errors?.length).toBeGreaterThanOrEqual(3);
  });
});
