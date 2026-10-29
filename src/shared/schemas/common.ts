import { newId } from '../util/ids';

/** `_id` string: ids opacos por defecto; revisiones y proyectos ponen el suyo (ADR 0010). */
export const idProp = { type: String, default: newId } as const;
export const nowProp = { type: Date, default: () => new Date() } as const;
