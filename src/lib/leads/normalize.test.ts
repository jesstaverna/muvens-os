import { describe, expect, it } from 'vitest';
import { normalizeLead } from './normalize';

describe('normalizeLead', () => {
  it('formato do Meta (field_data)', () => {
    const l = normalizeLead({ field_data: [{ name: 'full_name', values: ['Ana Souza'] }, { name: 'email', values: ['ANA@Loja.com'] }, { name: 'phone_number', values: ['+55 41 99999-8888'] }, { name: 'company_name', values: ['Loja X'] }, { name: 'site_da_empresa', values: ['lojax.com.br'] }, { name: 'qual_o_seu_maior_desafio', values: ['vender mais'] }], platform: 'ig', campaign_name: 'Black' });
    expect(l).toMatchObject({ name: 'Ana Souza', email: 'ana@loja.com', company: 'Loja X', website: 'https://lojax.com.br', source: 'Instagram Ads', campaign: 'Black' });
    expect(l!.extra.qual_o_seu_maior_desafio).toBe('vender mais');
  });
  it('campos soltos em português', () => {
    expect(normalizeLead({ nome: 'João', telefone: '(41) 99111-2222', empresa: 'JJ' })).toMatchObject({ name: 'João', phone: '(41) 99111-2222', company: 'JJ', email: null });
  });
  it('rejeita sem nome e sem contato; ignora e-mail e site inválidos', () => {
    expect(normalizeLead({})).toBeNull(); expect(normalizeLead('x')).toBeNull(); expect(normalizeLead({ company: 'X' })).toBeNull();
    const l = normalizeLead({ nome: 'A', email: 'nao-email', phone: '12', site: 'meu site' })!; expect(l.email).toBeNull(); expect(l.phone).toBeNull(); expect(l.website).toBeNull();
  });
});
