import { describe, expect, it } from 'vitest';
import { draftNurture, NURTURE_AFTER_DAYS } from './message';
import { brtDow, digestText, shouldSendDigest } from './digest';

const sender = { name: 'Ana', companyLegalName: 'Muvens', companyAddress: 'Rua X' };
describe('nutrição de leads frios', () => {
  it('3 passos com texto próprio, sem promessa de resultado nem preço', () => {
    for (const st of [2, 3, 4] as const) {
      const d = draftNurture(st, { name: 'Carla Souza', services: ['redes_sociais'] }, sender, { qualify: 'https://x/qualificar/t' });
      expect(d.subject).toContain('Carla'); expect(d.body).toContain('Ana'); expect(/garant|R\$|100%/i.test(d.body)).toBe(false);
    }
    expect(draftNurture(2, { name: 'C', services: ['redes_sociais'] }, sender, { qualify: '' }).body).toContain('redes sociais');
    expect(draftNurture(3, { name: 'C' }, sender, { qualify: 'https://x/qualificar/t' }).body).toContain('https://x/qualificar/t');
    expect(NURTURE_AFTER_DAYS).toEqual({ 2: 15, 3: 45, 4: 90 });
  });
});

describe('resumo semanal por e-mail', () => {
  const mon = new Date('2026-10-12T14:00:00Z'), tue = new Date('2026-10-13T14:00:00Z');
  it('dia da semana em Brasília', () => { expect(brtDow(mon)).toBe(1); expect(brtDow(new Date('2026-10-12T01:00:00Z'))).toBe(0); });
  it('envia na segunda; não repete na mesma semana; recupera segunda perdida', () => {
    expect(shouldSendDigest(mon, null)).toBe(true); expect(shouldSendDigest(tue, null)).toBe(false);
    expect(shouldSendDigest(mon, new Date('2026-10-05T14:00:00Z'))).toBe(true); expect(shouldSendDigest(mon, new Date('2026-10-10T14:00:00Z'))).toBe(false);
    expect(shouldSendDigest(new Date('2026-10-14T14:00:00Z'), new Date('2026-10-05T14:00:00Z'))).toBe(true);   // 9 dias sem resumo
  });
  it('texto com números e variação', () => {
    const z = { novas: 10, analisadas: 8, prontas: 3, emailsEnviados: 5, falhas: 0, whatsappFeitos: 2, landingAbertas: 1, respostas: 1, leadsProspeccao: 2, leadsAnuncios: 4, qualificacoes: 3, quentes: 1, mornos: 1, frios: 1 };
    const t = digestText(z, { ...z, novas: 5 }, { rascunhos: 7, aprovados: 2, quentes: 1 }, 'https://app/');
    expect(t).toContain('Empresas novas: 10 (+100% vs. semana anterior)'); expect(t).toContain('Rascunhos de e-mail aguardando aprovação: 7'); expect(t).toContain('https://app/prospeccao?tab=resumo');
  });
});
