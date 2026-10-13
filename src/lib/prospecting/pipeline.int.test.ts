import { createServer } from 'node:http';
import { createHmac } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { PostgrestClient } from '@supabase/postgrest-js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { runRecurringCampaigns } from './recurring';
import { periods, summarize } from './summary';
import { createInboundDrafts, ingestLead, submitQualification } from '@/lib/leads/ingest';
import { normalizeLead } from '@/lib/leads/normalize';
import { parseAnswers } from '@/lib/leads/qualify';
import { analyzeNextBatch, analyzeProspect, ANALYSIS_VERSION, countStale, reanalyzeNextBatch } from './pipeline';
import { autoApproveReady, createFollowups, createNurtureDrafts, processOutbox } from './outbox';
import { sendWeeklyDigest } from './digest';
import { loadFunnel } from './funnel';

// Integração com PostgREST local (ver supabase/tests/). Ignorado sem PGRST_URL.
const URL = process.env.PGRST_URL;
const SECRET = process.env.JWT_SECRET ?? 'test-secret-test-secret-test-secret-123456';
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
const token = () => { const h = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ role: 'service_role', exp: Math.floor(Date.now() / 1000) + 600 })}`; return `${h}.${createHmac('sha256', SECRET).update(h).digest('base64url')}`; };

const RUN = Date.now();
const E1 = `loja${RUN}@teste-int.com`, E2 = `falha${RUN}@teste-int.com`;

describe.skipIf(!URL)('prospecção (integração)', () => {
  const db = new PostgrestClient(URL!, { headers: { Authorization: `Bearer ${token()}` } }) as never as import('@supabase/supabase-js').SupabaseClient;
  let srv: ReturnType<typeof createServer>; let base = '';
  beforeAll(async () => {
    srv = createServer((req, res) => { res.setHeader('content-type', 'text/html'); res.end(req.url === '/contato' ? `<html><body><a href="mailto:contato@loja-${RUN}.com">e</a><a href="https://wa.me/5541997800552">w</a></body></html>` : '<html><head><title>Loja</title></head><body>oi</body></html>'); });
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
    await db.from('outreach_settings').update({ sending_enabled: true, window_start_hour: 0, window_end_hour: 24, weekdays_only: false, daily_email_limit: 50, sender_name: 'Equipe Muvens', sender_email: 'contato@muvens.test', company_legal_name: 'Muvens LTDA', company_document: '00.000.000/0001-00', company_address: 'Rua B, 20', followup_days: 2, max_followups: 1, require_approval: true }).eq('id', 1);
    await db.from('suppression_list').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  });
  afterAll(() => { srv.close(); });

  it('analisa, pontua e cria rascunhos de e-mail e WhatsApp (sem sobrescrever edições)', async () => {
    const { data: p } = await db.from('prospects').insert({ name: 'Loja Teste', website: base, email: E1, phone: '(19) 99999-0000', source: 'manual' }).select('id').single();
    const r = await analyzeProspect(db, p!.id, { site: { allowPrivate: true } });
    expect(r.ok).toBe(true);
    const { data: row } = await db.from('prospects').select('status, score, recommended_service, analysis').eq('id', p!.id).single();
    expect(row!.status).toBe('analisado'); expect(row!.score).toBeGreaterThan(30); expect((row!.analysis as any).visual.status).toBe('pendente'); expect((row!.analysis as any).observations.length).toBeGreaterThan(0);
    const { data: msgs } = await db.from('outreach_messages').select('channel, status, body').eq('prospect_id', p!.id).order('channel');
    expect(msgs!.map((m) => m.channel)).toEqual(['email', 'whatsapp_manual']); expect(msgs!.every((m) => m.status === 'rascunho')).toBe(true);
    await db.from('outreach_messages').update({ body: 'EDITADO' }).eq('prospect_id', p!.id).eq('channel', 'email');
    await analyzeProspect(db, p!.id, { site: { allowPrivate: true } });
    expect((await db.from('outreach_messages').select('body').eq('prospect_id', p!.id).eq('channel', 'email').single()).data!.body).toBe('EDITADO');
  });

  it('só envia mensagens APROVADAS, com rodapé, descadastro e sem repetir', async () => {
    const { data: p } = await db.from('prospects').select('id').eq('email', E1).single();
    const sent: { to: string; text: string; html: string; unsubscribeUrl: string }[] = [];
    const provider = { send: async (m: any) => { sent.push(m); return { id: 'fake-1' }; } };
    expect((await processOutbox(db, provider, 'https://app.test')).sent).toBe(0);               // ainda rascunho
    await db.from('outreach_messages').update({ status: 'aprovada', approved_at: new Date().toISOString() }).eq('prospect_id', p!.id).eq('channel', 'email');
    const r = await processOutbox(db, provider, 'https://app.test');
    expect(r).toMatchObject({ sent: 1, failed: 0 });
    expect(sent[0].to).toBe(E1); expect(sent[0].text).toContain('Muvens LTDA'); expect(sent[0].text).toContain('/descadastro/'); expect(sent[0].unsubscribeUrl).toMatch(/^https:\/\/app\.test\/descadastro\/[a-f0-9]{64}$/); expect(sent[0].html).toContain('Não quero mais receber');
    expect((await processOutbox(db, provider, 'https://app.test')).sent).toBe(0);               // não reenvia
    expect((await db.from('prospects').select('status').eq('id', p!.id).single()).data!.status).toBe('contatado');
  });

  it('falha do provedor marca a mensagem como "falhou" com o erro', async () => {
    const { data: p } = await db.from('prospects').insert({ name: 'Falha SA', email: E2 }).select('id').single();
    await db.from('outreach_messages').insert({ prospect_id: p!.id, channel: 'email', step: 1, subject: 's', body: 'b', status: 'aprovada', approved_at: new Date().toISOString() });
    const r = await processOutbox(db, { send: async () => { throw new Error('domínio não verificado'); } }, 'https://app.test');
    expect(r).toMatchObject({ sent: 0, failed: 1 });
    const m = (await db.from('outreach_messages').select('status, error').eq('prospect_id', p!.id).single()).data!;
    expect(m.status).toBe('falhou'); expect(m.error).toContain('domínio não verificado');
  });

  it('sem provedor configurado não envia nada', async () => { expect((await processOutbox(db, null, 'https://app.test')).sent).toBe(0); });

  it('cria follow-up após o prazo, como rascunho (aprovação exigida)', async () => {
    const { data: p } = await db.from('prospects').select('id').eq('email', E1).single();
    await db.from('outreach_messages').update({ sent_at: new Date(Date.now() - 3 * 86_400_000).toISOString() }).eq('prospect_id', p!.id).eq('channel', 'email').eq('step', 1);
    const r = await createFollowups(db);
    expect(r.created).toBe(1);
    const f = (await db.from('outreach_messages').select('step, status, subject').eq('prospect_id', p!.id).eq('step', 2).single()).data!;
    expect(f.status).toBe('rascunho'); expect(f.subject).toContain('Loja Teste');
    expect((await createFollowups(db)).created).toBe(0);                                         // idempotente
  });

  it('análise automática em lotes: esvazia a fila do grupo e não repete nem trava em falhas', async () => {
    const { data: camp } = await db.from('prospect_campaigns').insert({ name: `lote ${RUN}`, niche: `nicho${RUN}`, city: 'Cidade' }).select('id').single();
    await db.from('prospects').insert([1, 2, 3, 4, 5].map((i) => ({ campaign_id: camp!.id, name: `Lote ${RUN} ${i}`, email: `lote${RUN}-${i}@teste-int.com`, source: 'manual' })));
    const scope = { campaignIds: [camp!.id] };
    const a = await analyzeNextBatch(db, scope, 2); expect(a).toMatchObject({ processed: 2, analyzed: 2, remaining: 3 });
    const b = await analyzeNextBatch(db, scope, 2); expect(b).toMatchObject({ processed: 2, remaining: 1 });
    const c = await analyzeNextBatch(db, scope, 2); expect(c).toMatchObject({ processed: 1, remaining: 0 });
    const d = await analyzeNextBatch(db, scope, 2); expect(d).toMatchObject({ processed: 0, remaining: 0 });
    const { data: rows } = await db.from('prospects').select('status, score').eq('campaign_id', camp!.id);
    expect(rows!.every((r) => r.status === 'analisado' && r.score != null)).toBe(true);
  });

  it('sem e-mail cadastrado: usa o e-mail público do site, extrai o WhatsApp publicado e cria o rascunho de e-mail', async () => {
    const { data: p } = await db.from('prospects').insert({ name: `Site Contato ${RUN}`, website: `${base.replace("127.0.0.1", "localhost")}/contato`, phone: '(41) 99780-0552', source: 'manual' }).select('id').single();
    expect((await analyzeProspect(db, p!.id, { site: { allowPrivate: true } })).ok).toBe(true);
    const row = (await db.from('prospects').select('email, analysis').eq('id', p!.id).single()).data!;
    expect(row.email).toBe(`contato@loja-${RUN}.com`);
    expect((row.analysis as any).email_source).toBe('site'); expect((row.analysis as any).site.whatsappNumbers).toEqual(['5541997800552']);
    const ch = (await db.from('outreach_messages').select('channel').eq('prospect_id', p!.id)).data!.map((m) => m.channel).sort();
    expect(ch).toEqual(['email', 'whatsapp_manual']);
  });

  it('aprovação automática: só quem tem e-mail E WhatsApp, respeita pontuação mínima e o botão desligado', async () => {
    const mk = async (name: string, email: string | null, phone: string | null, score: number) => {
      const { data: p } = await db.from('prospects').insert({ name: `${name} ${RUN}`, email, phone, score, status: 'analisado', source: 'manual', analysis: { site: null, observations: [] } }).select('id').single();
      await db.from('outreach_messages').insert({ prospect_id: p!.id, channel: 'email', step: 1, subject: 's', body: 'b', status: 'rascunho' });
      return p!.id as string;
    };
    const a = await mk('Pronto', `pronto${RUN}@auto.com`, '(41) 99111-2222', 70);
    const b = await mk('SemWhats', `semw${RUN}@auto.com`, '(41) 3027-2736', 70);
    const c = await mk('SemEmail', null, '(41) 99111-3333', 70);
    const d = await mk('Baixo', `baixo${RUN}@auto.com`, '(41) 99111-4444', 10);
    const st = async (id: string) => (await db.from('outreach_messages').select('status').eq('prospect_id', id).eq('channel', 'email').single()).data!.status;
    await db.from('outreach_settings').update({ auto_approve_ready: false, auto_approve_min_score: 50 }).eq('id', 1);
    expect((await autoApproveReady(db)).approved).toBe(0); expect(await st(a)).toBe('rascunho');
    await db.from('outreach_settings').update({ auto_approve_ready: true }).eq('id', 1);
    await autoApproveReady(db);
    expect(await st(a)).toBe('aprovada'); expect(await st(b)).toBe('rascunho'); expect(await st(c)).toBe('rascunho'); expect(await st(d)).toBe('rascunho');
    await db.from('outreach_settings').update({ auto_approve_ready: false, auto_approve_min_score: 0 }).eq('id', 1);
  });

  it('busca semanal: traz empresas novas 1x por semana, ignora duplicadas e só roda campanhas ligadas', async () => {
    process.env.GOOGLE_PLACES_API_KEY = 'k';
    const real = globalThis.fetch;
    const pages = [{ places: [{ id: `pa${RUN}`, displayName: { text: `Alfa ${RUN}` } }, { id: `pb${RUN}`, displayName: { text: `Beta ${RUN}` } }], nextPageToken: 'n' }, { places: [{ id: `pc${RUN}`, displayName: { text: `Gama ${RUN}` } }] }];
    let calls = 0;
    vi.stubGlobal('fetch', (u: unknown, init?: RequestInit) => String(u).includes('places.googleapis.com') ? Promise.resolve(new Response(JSON.stringify(pages[Math.min(calls++, 1)]), { status: 200 })) : real(u as RequestInfo, init));
    try {
      const { data: on } = await db.from('prospect_campaigns').insert({ name: `Semanal ${RUN}`, niche: 'escola', city: 'Curitiba', auto_weekly: true }).select('id').single();
      const { data: off } = await db.from('prospect_campaigns').insert({ name: `Manual ${RUN}`, niche: 'padaria', city: 'Curitiba', auto_weekly: false }).select('id').single();
      const r1 = await runRecurringCampaigns(db); expect(r1.created).toBe(3); expect(calls).toBe(2);
      expect((await db.from('prospects').select('id', { count: 'exact', head: true }).eq('campaign_id', on!.id)).count).toBe(3);
      expect((await db.from('prospects').select('id', { count: 'exact', head: true }).eq('campaign_id', off!.id)).count).toBe(0);
      expect((await db.from('prospect_campaigns').select('last_auto_run_at').eq('id', on!.id).single()).data!.last_auto_run_at).toBeTruthy();
      const r2 = await runRecurringCampaigns(db); expect(r2.campaigns).toBe(0);                      // já rodou esta semana
      calls = 0; const r3 = await runRecurringCampaigns(db, new Date(), { force: true }); expect(r3.created).toBe(0); // mesmos locais = duplicados
    } finally { vi.unstubAllGlobals(); delete process.env.GOOGLE_PLACES_API_KEY; }
  });

  it('lead de anúncio: cria lead + prospecto + link, só rascunhos (sem site), não duplica, e a qualificação pontua e avisa', async () => {
    const lead = normalizeLead({ field_data: [{ name: 'full_name', values: [`Ana Lead ${RUN}`] }, { name: 'email', values: [`ana${RUN}@lead.com`] }, { name: 'phone_number', values: ['(41) 99555-1234'] }, { name: 'company_name', values: [`Loja ${RUN}`] }], platform: 'ig', campaign_name: 'Verão' })!;
    const r = await ingestLead(db, lead, 'https://app.test');
    expect(r.ok).toBe(true); expect(r.duplicate).toBeFalsy(); expect(r.needsAnalysis).toBe(false);
    const l = (await db.from('leads').select('source, email').eq('id', r.leadId!).single()).data!; expect(l.source).toBe('Instagram Ads');
    const msgs = (await db.from('outreach_messages').select('channel, status, body').eq('prospect_id', r.prospectId!)).data!;
    expect(msgs.map((m) => m.channel).sort()).toEqual(['email', 'whatsapp_manual']); expect(msgs.every((m) => m.status === 'rascunho')).toBe(true);
    const q = (await db.from('lead_qualifications').select('token, status').eq('lead_id', r.leadId!).single()).data!;
    expect(msgs.find((m) => m.channel === 'email')!.body).toContain(`https://app.test/qualificar/${q.token}`); expect(q.status).toBe('pendente');
    expect((await createInboundDrafts(db, r.prospectId!, 'https://app.test'))).toBe(0);                     // idempotente
    const dup = await ingestLead(db, lead, 'https://app.test'); expect(dup.duplicate).toBe(true); expect(dup.leadId).toBe(r.leadId);
    // aprovação automática e follow-up frio ignoram lead de anúncio
    await db.from('outreach_settings').update({ auto_approve_ready: true, auto_approve_min_score: 0 }).eq('id', 1);
    await db.from('prospects').update({ score: 90 }).eq('id', r.prospectId!);
    await autoApproveReady(db);
    expect((await db.from('outreach_messages').select('status').eq('prospect_id', r.prospectId!).eq('channel', 'email').single()).data!.status).toBe('rascunho');
    await db.from('outreach_settings').update({ auto_approve_ready: false }).eq('id', 1);
    // qualificação
    const a = parseAnswers({ dificuldade: 'Não consigo clientes novos', precisa: 'Site e anúncios que tragam contatos', areas: ['site_institucional', 'trafego_pago'], prazo: 'agora', invest: '1a5k', decisor: 'sim' }); if (!a.ok) throw new Error(a.error);
    expect((await submitQualification(db, q.token, a.answers)).ok).toBe(true);
    expect((await submitQualification(db, q.token, a.answers)).already).toBe(true);
    const done = (await db.from('lead_qualifications').select('status, fit, score, services').eq('lead_id', r.leadId!).single()).data!; expect(done.status).toBe('respondido'); expect(done.fit).toBe('quente');
    expect((await db.from('leads').select('service_interest').eq('id', r.leadId!).single()).data!.service_interest).toBe('site_institucional');
    expect((await db.from('notifications').select('id', { count: 'exact', head: true }).like('dedupe_key', 'qualif:%')).count).toBeGreaterThan(0);
    expect((await submitQualification(db, 'x'.repeat(64), a.answers)).ok).toBe(false);
  });

  it('reanálise em lote: só quem tem análise antiga, mantém o status e atualiza a versão', async () => {
    const { data: p } = await db.from('prospects').insert({ name: `Antigo ${RUN}`, email: `antigo${RUN}@reanalise.com`, phone: '(41) 99000-1111', source: 'manual', status: 'contatado', analyzed_at: new Date(Date.now() - 86400_000).toISOString(), analysis: { analyzed_with: 'regras-v1', site: null, observations: [] }, score: 10 }).select('id').single();
    const { data: q } = await db.from('prospects').insert({ name: `Descartado ${RUN}`, email: `desc${RUN}@reanalise.com`, source: 'manual', status: 'descartado', analyzed_at: new Date().toISOString(), analysis: { analyzed_with: 'regras-v1' } }).select('id').single();
    const before = await countStale(db, { manualOnly: true }); expect(before).toBeGreaterThanOrEqual(1);
    const r = await reanalyzeNextBatch(db, { manualOnly: true }, 50); expect(r.processed).toBeGreaterThanOrEqual(1); expect(r.remaining).toBe(0);
    const row = (await db.from('prospects').select('status, analysis').eq('id', p!.id).single()).data!;
    expect(row.status).toBe('contatado'); expect((row.analysis as any).analyzed_with).toBe(ANALYSIS_VERSION); expect((row.analysis as any).needs).toBeTruthy();
    expect(((await db.from('prospects').select('analysis').eq('id', q!.id).single()).data!.analysis as any).analyzed_with).toBe('regras-v1');   // descartado não é refeito
  });

  it('resumo: conta o que aconteceu no período', async () => {
    const { cur } = periods(1);
    const r = await summarize(db, cur);
    expect(r.novas).toBeGreaterThan(0); expect(r.analisadas).toBeGreaterThan(0); expect(r.emailsEnviados).toBeGreaterThan(0);
    expect(r.leadsAnuncios).toBeGreaterThan(0); expect(r.qualificacoes).toBeGreaterThan(0); expect(r.quentes).toBeGreaterThan(0);
    const old = await summarize(db, { since: '2000-01-01T00:00:00Z', until: '2000-02-01T00:00:00Z' }); expect(old.novas).toBe(0);
  });

  it('nutrição: lead frio ganha rascunhos espaçados (15/45/90 dias), só um passo por vez, e lead quente não', async () => {
    const mk = async (tag: string, fit: 'frio' | 'quente') => {
      const lead = normalizeLead({ nome: `Nutri ${tag} ${RUN}`, email: `nutri${tag}${RUN}@n.com`, telefone: fit === 'frio' ? '(41) 99444-5555' : '(41) 99444-6666' })!;
      const r = await ingestLead(db, lead, 'https://app.test');
      await db.from('lead_qualifications').update({ status: 'respondido', fit, score: 20, services: ['redes_sociais'], answered_at: new Date(Date.now() - 20 * 86400_000).toISOString() }).eq('lead_id', r.leadId!);
      return r.prospectId!;
    };
    const frio = await mk('f', 'frio'); const quente = await mk('q', 'quente');
    const steps = async (id: string) => (await db.from('outreach_messages').select('step, status').eq('prospect_id', id).eq('channel', 'email').order('step')).data!;
    await createNurtureDrafts(db);
    expect((await steps(frio)).map((m) => m.step)).toEqual([1, 2]); expect((await steps(quente)).map((m) => m.step)).toEqual([1]);
    await createNurtureDrafts(db); expect((await steps(frio)).length).toBe(2);                                       // idempotente
    await db.from('lead_qualifications').update({ answered_at: new Date(Date.now() - 50 * 86400_000).toISOString() }).eq('prospect_id', frio);
    await createNurtureDrafts(db); expect((await steps(frio)).map((m) => m.step)).toEqual([1, 2]);                   // passo 2 ainda não foi enviado: não empilha o 3
    await db.from('outreach_messages').update({ status: 'enviada', sent_at: new Date().toISOString() }).eq('prospect_id', frio).eq('step', 2);
    await createNurtureDrafts(db); expect((await steps(frio)).map((m) => m.step)).toEqual([1, 2, 3]);
  });

  it('resumo semanal por e-mail: só ligado, só segunda, uma vez por semana', async () => {
    const sent: { to: string; subject: string; text: string }[] = [];
    const provider = { send: async (m: { to: string; subject: string; text: string }) => { sent.push(m); return { id: 'x' }; } };
    await db.from('outreach_settings').update({ weekly_digest_enabled: false, weekly_digest_to: 'equipe@muvens.test', last_digest_at: null, sender_name: 'Ana', sender_email: 'ana@updates.muvens.test' }).eq('id', 1);
    const monday = new Date('2026-10-12T14:00:00Z');
    expect((await sendWeeklyDigest(db, provider as never, 'https://app.test', monday)).sent).toBe(false);          // desligado
    await db.from('outreach_settings').update({ weekly_digest_enabled: true }).eq('id', 1);
    expect((await sendWeeklyDigest(db, provider as never, 'https://app.test', new Date('2026-10-13T14:00:00Z'))).sent).toBe(false);   // terça
    expect((await sendWeeklyDigest(db, provider as never, 'https://app.test', monday)).sent).toBe(true);
    expect(sent.length).toBe(1); expect(sent[0].to).toBe('equipe@muvens.test'); expect(sent[0].text).toContain('PROSPECÇÃO');
    expect((await sendWeeklyDigest(db, provider as never, 'https://app.test', monday)).sent).toBe(false);          // não repete
    await db.from('outreach_settings').update({ weekly_digest_enabled: false, weekly_digest_to: null, last_digest_at: null }).eq('id', 1);
  });

  it('alerta por e-mail: só lead quente, só se ligado, com link do WhatsApp e do CRM', async () => {
    const sent: { to: string; subject: string; text: string }[] = []; const provider = { send: async (m: { to: string; subject: string; text: string }) => { sent.push(m); return { id: 'x' }; } };
    const ans = (prazo: string, decisor: string, invest: string) => { const a = parseAnswers({ dificuldade: 'Não consigo clientes novos', precisa: 'Site e anúncios que tragam contatos', areas: ['site_institucional'], prazo, invest, decisor }); if (!a.ok) throw new Error(a.error); return a.answers; };
    const mk = async (tag: string, phone: string) => { const r = await ingestLead(db, normalizeLead({ nome: `Alerta ${tag} ${RUN}`, email: `alerta${tag}${RUN}@a.com`, telefone: phone })!, 'https://app.test'); return (await db.from('lead_qualifications').select('token').eq('lead_id', r.leadId!).single()).data!.token as string; };
    await db.from('outreach_settings').update({ alert_hot_enabled: false, alert_to: 'alerta@muvens.test', sender_name: 'Ana', sender_email: 'ana@updates.muvens.test' }).eq('id', 1);
    const t1 = await mk('1', '(41) 99333-1111'); await submitQualification(db, t1, ans('agora', 'sim', '1a5k'), provider as never); expect(sent.length).toBe(0);   // desligado
    await db.from('outreach_settings').update({ alert_hot_enabled: true }).eq('id', 1);
    const t2 = await mk('2', '(41) 99333-2222'); await submitQualification(db, t2, ans('agora', 'sim', '1a5k'), provider as never);
    expect(sent.length).toBe(1); expect(sent[0].to).toBe('alerta@muvens.test'); expect(sent[0].subject).toContain('Lead quente'); expect(sent[0].text).toContain('wa.me/55419933322'); expect(sent[0].text).toContain('/crm/');
    const t3 = await mk('3', '(41) 99333-3333'); await submitQualification(db, t3, ans('pesquisando', 'nao', 'nenhum'), provider as never); expect(sent.length).toBe(1);   // frio não avisa
    await db.from('outreach_settings').update({ alert_hot_enabled: false, alert_to: null }).eq('id', 1);
  });

  it('funil: carrega do banco e separa as origens', async () => {
    const all = await loadFunnel(db, null, 'todos'); const ads = await loadFunnel(db, null, 'anuncios'); const pro = await loadFunnel(db, null, 'prospeccao');
    expect(all.total).toBeGreaterThan(0); expect(ads.total).toBeGreaterThan(0); expect(ads.total + pro.total).toBe(all.total);
    expect(all.stages.find((x) => x.key === 'leads')!.count).toBeGreaterThan(0);
  });
});

