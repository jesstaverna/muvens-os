import { describe, expect, it } from 'vitest';
import { matchesContact, parseFilters, reachRank, type FilterRow } from './filters';

const full: FilterRow = { email: 'a@x.com', phone: '(41) 99999-8888', linkedin: 'https://linkedin.com/company/x', people: [{ role: 'compras', title: 'Gerente de Compras' }], contacts: [{ email: 'compras@x.com', kind: 'compras' }] };
const fixo: FilterRow = { phone: '(41) 3027-2736' };
const none: FilterRow = {};
describe('filtros de contato', () => {
  it('E entre filtros', () => {
    expect(matchesContact(full, ['email', 'wa', 'decisor', 'linkedin', 'emailcom', 'cel'])).toBe(true);
    expect(matchesContact(fixo, ['tel'])).toBe(true); expect(matchesContact(fixo, ['wa'])).toBe(false); expect(matchesContact(fixo, ['email'])).toBe(false);
    expect(matchesContact(none, [])).toBe(true); expect(matchesContact(none, ['tel'])).toBe(false);
  });
  it('WhatsApp publicado no site conta mesmo com telefone fixo', () => { expect(matchesContact({ phone: '(41) 3027-2736', site_numbers: ['5541999998888'] }, ['wa'])).toBe(true); });
  it('ranking de alcance', () => { expect(reachRank(full)).toBeGreaterThan(reachRank(fixo)); expect(reachRank(fixo)).toBeGreaterThan(reachRank(none)); });
  it('parseFilters aceita lista e ignora desconhecidos', () => { expect(parseFilters(['email', 'x', 'wa'])).toEqual(['email', 'wa']); expect(parseFilters('email,decisor')).toEqual(['email', 'decisor']); expect(parseFilters(undefined)).toEqual([]); });
});
