// Smoke test das consultas PostgREST usadas pelas páginas, contra um PostgREST local apontando para o banco de teste.
// Uso: PGRST_URL=http://127.0.0.1:3111 JWT_SECRET=... node supabase/tests/api_smoke.mjs   (após run_local.sh)
import { createHmac } from 'node:crypto';
import { PostgrestClient } from '@supabase/postgrest-js';

const URL = process.env.PGRST_URL ?? 'http://127.0.0.1:3111';
const SECRET = process.env.JWT_SECRET ?? 'test-secret-test-secret-test-secret-123456';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (sub) => { const h = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 600 })}`; return `${h}.${createHmac('sha256', SECRET).update(h).digest('base64url')}`; };
const as = (sub) => new PostgrestClient(URL, sub ? { headers: { Authorization: `Bearer ${jwt(sub)}` } } : {});
const U = (n) => `00000000-0000-0000-0000-0000000000a${n}`;
let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.error('✗', msg); } else console.log('✓', msg); };
const must = (r, msg) => { if (r.error) { fails++; console.error('✗', msg, '→', r.error.message); return null; } console.log('✓', msg); return r.data; };

const admin = as(U(1)), com = as(U(2)), fin = as(U(3)), des = as(U(4)), anon = as(null);

const leads = must(await com.from('leads').select('id, name, company, whatsapp, phone, email, source, service_interest, potential_value, stage_id, owner:profiles!leads_owner_id_fkey(full_name), owner_id, last_contact_at, created_at, next_action, next_action_at, pipeline_stages(name, kind)').order('created_at', { ascending: false }).limit(500), 'CRM: leads com embeds (owner + etapa)');
ok(leads?.[0]?.owner?.full_name === 'Comercial Teste', 'CRM: embed do responsável resolve');
must(await com.from('leads').select('id').or('name.ilike.%maria%,company.ilike.%maria%,email.ilike.%maria%'), 'CRM: busca com or()');
const lead = leads?.[0];
must(await com.from('lead_interactions').select('id, kind, content, created_at, profiles(full_name)').eq('lead_id', lead.id).order('created_at', { ascending: false }), 'Lead: histórico com autor');
must(await com.from('lead_reminders').select('id, title, due_at, lead_id, leads(name)').is('done_at', null).order('due_at').limit(50), 'CRM: lembretes com lead');
must(await com.from('proposals').select('id, number, title, status, total_value').eq('lead_id', lead.id), 'Lead: propostas vinculadas');
must(await com.rpc('crm_conversion', { p_from: '2020-01-01', p_to: '2099-01-01' }), 'CRM: conversão (rpc)');
const dup = await com.from('leads').insert({ name: 'Dup', email: 'MARIA@paobom.com', stage_id: lead.stage_id });
ok(dup.error?.code === '23505', 'CRM: e-mail duplicado → 23505');
const found = must(await com.from('leads').select('id, name').or('email_norm.eq.maria@paobom.com,phone_norm.eq.11988887777').limit(1), 'CRM: localizar duplicado por chaves normalizadas');
ok(found?.[0]?.id === lead.id, 'CRM: duplicado encontrado é o lead original');

const props = must(await com.from('proposals').select('id, number, title, client_display_name, status, total_value, valid_until, sent_at, view_count, first_viewed_at').order('number', { ascending: false }).limit(300), 'Propostas: lista');
const pid = props?.[0]?.id;
must(await com.from('proposal_items').select('*').eq('proposal_id', pid).order('position').order('description'), 'Propostas: itens');
must(await com.from('proposal_events').select('id, kind, message, actor_name, created_at').eq('proposal_id', pid).order('created_at', { ascending: false }).limit(50), 'Propostas: eventos');
must(await com.from('proposal_versions').select('id, version, note, created_at').eq('proposal_id', pid).order('version', { ascending: false }), 'Propostas: versões');
const created = must(await com.from('proposals').insert({ title: 'T', template: 'landing_page', client_display_name: 'Cliente X', content: {}, valid_until: '2099-01-01' }).select('id').single(), 'Propostas: criar rascunho');
must(await com.from('proposal_items').insert([{ proposal_id: created.id, position: 0, description: 'LP', billing: 'pontual', quantity: 1, unit_price: 800 }]), 'Propostas: inserir itens');
const t = must(await com.from('proposals').select('total_value, token').eq('id', created.id).single(), 'Propostas: total recalculado');
ok(Number(t?.total_value) === 800, 'Propostas: total = 800 após item');
must(await com.rpc('proposal_snapshot', { p_id: created.id, p_note: 'smoke' }), 'Propostas: snapshot (rpc)');
ok((await com.from('proposals').update({ discount_value: 10 }).eq('id', created.id)).error?.code === '42501', 'Propostas: desconto por comercial negado');
ok(!(await admin.from('proposals').update({ discount_value: 50 }).eq('id', created.id)).error, 'Propostas: desconto por admin permitido');
must(await com.from('proposals').update({ status: 'enviada' }).eq('id', created.id), 'Propostas: enviar');
const pub = await anon.rpc('proposal_public_open', { p_token: t.token });
ok(!pub.error && pub.data?.total_value === 750, 'Público: proposta abre via token e mostra total com desconto');
ok(pub.data && !('token' in pub.data), 'Público: resposta não expõe token');
ok((await anon.from('proposals').select('id')).error != null, 'Público: acesso direto à tabela negado');
const acc = await anon.rpc('proposal_public_accept', { p_token: t.token, p_name: 'Fulano', p_email: 'f@x.com' });
ok(acc.data === true, 'Público: aceite registrado');

must(await fin.from('fin_transactions').select('id, direction, description, amount, status, due_date, paid_at, paid_amount, attachment_path, client_id, fin_categories(name, expense_type), clients(name)').order('due_date').limit(500), 'Financeiro: lançamentos com categoria e cliente');
must(await fin.from('fin_transactions').select('direction, amount, paid_amount, status, client_id, due_date, clients(name)').gte('due_date', '2020-01-01').lte('due_date', '2099-12-31').neq('status', 'cancelado'), 'Financeiro: resumo anual');
must(await fin.from('fin_recurring').select('id, description, vendor, direction, amount, day_of_month, is_subscription, active, starts_on, ends_on').order('description'), 'Financeiro: recorrências');
must(await fin.rpc('generate_recurring', { p_month: '2030-01-10' }), 'Financeiro: gerar recorrências (rpc)');
const m = must(await admin.rpc('dashboard_metrics', { p_from: '2020-01-01', p_to: '2099-12-31', p_client: null }), 'Dashboard: métricas (rpc)');
ok(m && Number(m.contracts_closed) >= 1, 'Dashboard: contratos fechados refletem aceite');
must(await admin.rpc('finance_monthly_series', { p_months: 12 }), 'Dashboard: série mensal');
must(await admin.from('goals').upsert({ period_type: 'mensal', period_start: '2026-10-01', basis: 'recebido', revenue_target: 10000 }, { onConflict: 'period_type,period_start' }), 'Metas: upsert por admin');
ok((await com.from('goals').upsert({ period_type: 'mensal', period_start: '2026-11-01', basis: 'recebido', revenue_target: 1 }, { onConflict: 'period_type,period_start' })).error != null, 'Metas: comercial não define metas');
must(await admin.from('goals').select('basis, revenue_target').eq('period_type', 'mensal').eq('period_start', '2026-10-01').maybeSingle(), 'Metas: leitura maybeSingle');
must(await admin.from('profiles').select('id, full_name, email, role, active, client_id, created_at').order('created_at'), 'Config: usuários');
must(await admin.from('audit_log').select('id, table_name, action, created_at, actor_id').order('created_at', { ascending: false }).limit(15), 'Config: auditoria');
must(await admin.from('jobs').select('id, type, status, attempts, max_attempts, run_at, finished_at, last_error, created_at').order('created_at', { ascending: false }).limit(100), 'Automações: jobs');
must(await admin.from('notifications').select('id, severity, title, body, link, read_at, created_at').order('created_at', { ascending: false }).limit(100), 'Alertas: notificações');
ok((await com.from('jobs').select('id')).data?.length === 0, 'Jobs invisíveis para não-admin');
ok((await des.from('fin_transactions').select('id')).data?.length === 0, 'Designer não vê financeiro');
ok(!(await des.from('clients').select('id, name')).error, 'Designer vê clientes (necessário p/ produção)');

console.log(fails ? `\n${fails} falha(s)` : '\nTodas as consultas OK');
process.exit(fails ? 1 : 0);
