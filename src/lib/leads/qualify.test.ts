import { describe, expect, it } from 'vitest';
import { parseAnswers, scoreAnswers } from './qualify';

const base = { dificuldade: 'Não consigo clientes novos pelo Instagram', precisa: 'Um site e anúncios que tragam contatos', areas: ['site_institucional', 'trafego_pago', 'x-invalida'], prazo: 'agora', invest: '1a5k', decisor: 'sim', contato: 'whatsapp' };
describe('qualificação', () => {
  it('valida e limpa as respostas', () => {
    const r = parseAnswers(base); expect(r.ok).toBe(true); if (r.ok) expect(r.answers.areas).toEqual(['site_institucional', 'trafego_pago']);
    expect(parseAnswers({ ...base, dificuldade: '' }).ok).toBe(false); expect(parseAnswers({ ...base, prazo: 'zzz' }).ok).toBe(false);
  });
  it('lead quente x frio', () => {
    const q = parseAnswers(base); if (!q.ok) throw new Error(); const hot = scoreAnswers(q.answers);
    expect(hot.fit).toBe('quente'); expect(hot.services).toEqual(['site_institucional', 'trafego_pago']);
    const f = parseAnswers({ ...base, areas: [], prazo: 'pesquisando', invest: 'nenhum', decisor: 'nao', dificuldade: 'nada por enquanto', precisa: 'nada ainda mesmo' }); if (!f.ok) throw new Error();
    expect(scoreAnswers(f.answers).fit).toBe('frio');
  });
});
