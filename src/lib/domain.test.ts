import { describe, expect, it } from 'vitest';
import { fmtMinutes, parseDuration, elapsedFraction, goalProgress, monthRange, normEmail, normPhone, proposalTotals, splitInstallments, todayBR } from './domain';

describe('normalização (paridade com o SQL)', () => {
  it('telefones equivalentes viram a mesma chave', () => {
    const variants = ['(11) 98888-7777', '+55 11 98888-7777', '5511988887777', '11988887777'];
    expect(new Set(variants.map(normPhone)).size).toBe(1);
    expect(normPhone('11988887777')).toBe('11988887777');
  });
  it('vazio vira null', () => {
    expect(normPhone('')).toBeNull();
    expect(normPhone('abc')).toBeNull();
    expect(normEmail('  ')).toBeNull();
    expect(normEmail(' Maria@PaoBom.com ')).toBe('maria@paobom.com');
  });
});

describe('proposalTotals', () => {
  it('pontual + mensal×vigência − desconto (mesmo cenário do teste SQL)', () => {
    const t = proposalTotals([{ billing: 'pontual', quantity: 1, unit_price: 1500 }, { billing: 'mensal', quantity: 1, unit_price: 2000 }], 6, 500);
    expect(t).toMatchObject({ oneTime: 1500, monthly: 2000, gross: 13500, total: 13000 });
  });
  it('desconto nunca deixa o total negativo', () => {
    expect(proposalTotals([{ billing: 'pontual', quantity: 1, unit_price: 100 }], 1, 999).total).toBe(0);
  });
  it('arredonda por linha', () => {
    expect(proposalTotals([{ billing: 'pontual', quantity: 3, unit_price: 33.335 }], 1).oneTime).toBe(100.01);
  });
});

describe('splitInstallments', () => {
  it('a soma sempre fecha o total', () => {
    const parts = splitInstallments(1000, 3);
    expect(parts).toEqual([333.33, 333.33, 333.34]);
    expect(parts.reduce((a, b) => a + b, 0)).toBeCloseTo(1000, 2);
  });
});

describe('goalProgress', () => {
  const base = { target: 10000, pendingReceivables: 2000, weightedPipeline: 3000 };
  it('percentual e restante', () => {
    const g = goalProgress({ ...base, basis: 'recebido', actual: 2500, elapsedFraction: 0.1 });
    expect(g.percent).toBe(25);
    expect(g.remaining).toBe(7500);
  });
  it('projeção depende da base', () => {
    expect(goalProgress({ ...base, basis: 'recebido', actual: 5000, elapsedFraction: 0.5 }).projected).toBe(7000);
    expect(goalProgress({ ...base, basis: 'contratado', actual: 5000, elapsedFraction: 0.5 }).projected).toBe(8000);
  });
  it('alerta de risco só quando atrasado no ritmo E projeção abaixo da meta', () => {
    expect(goalProgress({ ...base, basis: 'recebido', actual: 1000, elapsedFraction: 0.8 }).atRisk).toBe(true);
    expect(goalProgress({ ...base, basis: 'recebido', actual: 7900, elapsedFraction: 0.8 }).atRisk).toBe(false);
    expect(goalProgress({ target: 10000, basis: 'recebido', actual: 1000, pendingReceivables: 9000, weightedPipeline: 0, elapsedFraction: 0.8 }).atRisk).toBe(false);
  });
  it('sem meta não há risco nem divisão por zero', () => {
    const g = goalProgress({ target: 0, basis: 'recebido', actual: 10, pendingReceivables: 0, weightedPipeline: 0, elapsedFraction: 1 });
    expect(g.percent).toBe(0);
    expect(g.atRisk).toBe(false);
  });
});

describe('datas', () => {
  it('monthRange cobre fevereiro bissexto', () => {
    expect(monthRange(2028, 2)).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });
  it('todayBR usa o fuso de São Paulo', () => {
    expect(todayBR(new Date('2026-03-01T01:30:00Z'))).toBe('2026-02-28');
  });
  it('elapsedFraction', () => {
    expect(elapsedFraction('2026-04-01', '2026-04-30', '2026-04-15')).toBeCloseTo(0.5, 1);
    expect(elapsedFraction('2026-04-01', '2026-04-30', '2026-05-10')).toBe(1);
  });
});

describe('horas', () => {
  it('interpreta formatos comuns', () => {
    expect(parseDuration('1:30')).toBe(90);
    expect(parseDuration('1,5')).toBe(90);
    expect(parseDuration('0.25')).toBe(15);
    expect(parseDuration('2')).toBe(120);
  });
  it('rejeita inválidos', () => {
    expect(parseDuration('')).toBeNull();
    expect(parseDuration('abc')).toBeNull();
    expect(parseDuration('0')).toBeNull();
    expect(parseDuration('25')).toBeNull();
    expect(parseDuration('1:75')).toBeNull();
  });
  it('formata', () => expect(fmtMinutes(95)).toBe('1h35'));
});
