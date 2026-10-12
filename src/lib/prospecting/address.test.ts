import { describe, expect, it } from 'vitest';
import { normalizeAddress } from './address';
describe('normalizeAddress', () => {
  it('aceita e-mail e "Nome <e-mail>"', () => { expect(normalizeAddress(' a@b.com ')).toBe('a@b.com'); expect(normalizeAddress('Muvens <a@b.com.br>')).toBe('Muvens <a@b.com.br>'); });
  it('ignora valores inválidos', () => { for (const v of ['', '   ', null, undefined, 'Muvens Agência', 'a@b', 'a b@c.com', '@x.com']) expect(normalizeAddress(v)).toBeUndefined(); });
});
