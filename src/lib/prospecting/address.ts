const EMAIL = /^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/;

/** Aceita "email@dominio.com" ou "Nome <email@dominio.com>". Qualquer outra coisa (texto solto, vazio) vira undefined. */
export function normalizeAddress(raw: string | null | undefined): string | undefined {
  const t = (raw ?? '').trim(); if (!t) return undefined;
  if (EMAIL.test(t)) return t;
  const m = t.match(/^(.{1,80}?)\s*<([^@\s<>]+@[^@\s<>]+\.[^@\s<>]+)>$/);
  return m ? `${m[1].replace(/["<>]/g, '').trim()} <${m[2]}>` : undefined;
}
