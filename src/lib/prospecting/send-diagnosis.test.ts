import { describe, expect, it } from 'vitest';
import { brtParts, diagnoseSending, type DiagInput } from './send-diagnosis';

const base: DiagInput = { settings: { sending_enabled: true, require_approval: true, sender_name: 'A', sender_email: 'a@b.com', company_legal_name: 'X', company_address: 'Rua', window_start_hour: 9, window_end_hour: 18, weekdays_only: true, daily_email_limit: 30 }, providerConfigured: true, cronSecretConfigured: true, approved: 2, drafts: 0, failed: 0, sentToday: 0, now: new Date('2026-10-13T15:00:00Z') }; // terça 12h BRT
const bad = (i: DiagInput) => diagnoseSending(i).filter((c) => c.ok === false).map((c) => c.label);

describe('diagnoseSending', () => {
  it('tudo certo: nada bloqueia', () => expect(bad(base)).toEqual([]));
  it('cron das 9h UTC (6h BRT) cai fora da janela', () => { expect(brtParts(new Date('2026-10-13T09:00:00Z')).hour).toBe(6); expect(bad({ ...base, now: new Date('2026-10-13T09:00:00Z') }).join()).toMatch(/horário/); });
  it('fim de semana, envio desligado, sem aprovados e sem provedor', () => {
    const r = bad({ ...base, now: new Date('2026-10-17T15:00:00Z'), providerConfigured: false, approved: 0, drafts: 3, settings: { ...base.settings!, sending_enabled: false } }).join('|');
    expect(r).toMatch(/Resend/); expect(r).toMatch(/ligado/); expect(r).toMatch(/aprovados/); expect(r).toMatch(/horário/);
  });
  it('identificação incompleta', () => expect(bad({ ...base, settings: { ...base.settings!, company_address: null } }).join()).toMatch(/Identificação/));
});
