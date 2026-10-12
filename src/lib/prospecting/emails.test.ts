import { describe, expect, it } from 'vitest';
import { classifyEmail, extractEmails, pickBestEmail } from './emails';

describe('extractEmails', () => {
  it('lê mailto e texto, em minúsculas, sem duplicar', () => {
    const html = `<a href="mailto:Contato@ClinicaBela.com.br">x</a> fale: contato@clinicabela.com.br ou vendas&#64;clinicabela.com.br`;
    expect(extractEmails(html)).toEqual(['contato@clinicabela.com.br', 'vendas@clinicabela.com.br']);
  });
  it('ignora lixo comum de sites (imagens, placeholders, serviços)', () => {
    const html = `logo@2x.png noreply@empresa.com seu@email.com abc123@sentry.io user@example.com a@wixpress.com img-1@3x.jpg`;
    expect(extractEmails(html)).toEqual([]);
  });
});

describe('pickBestEmail', () => {
  it('prefere o domínio do site e nomes comerciais', () => {
    expect(pickBestEmail(['pessoa@gmail.com', 'financeiro@bela.com.br', 'contato@bela.com.br'], 'bela.com.br')).toBe('contato@bela.com.br');
    expect(pickBestEmail(['x@gmail.com', 'y@outlook.com'], 'bela.com.br')).toBeTruthy();
    expect(pickBestEmail([], 'a.com')).toBeNull();
  });
});

describe('classifyEmail e preferência comercial', () => {
  it('rotula por área', () => {
    expect(classifyEmail('compras@a.com')).toBe('compras');
    expect(classifyEmail('vendas@a.com')).toBe('comercial'); expect(classifyEmail('diretoria@a.com')).toBe('diretoria');
    expect(classifyEmail('contato@a.com')).toBe('geral'); expect(classifyEmail('joao.silva@a.com')).toBe('pessoal');
  });
  it('prefere comercial/compras a contato geral', () => {
    expect(pickBestEmail(['contato@a.com.br', 'compras@a.com.br'], 'a.com.br')).toBe('compras@a.com.br');
    expect(pickBestEmail(['contato@a.com.br', 'comercial@a.com.br'], 'a.com.br')).toBe('comercial@a.com.br');
  });
});
