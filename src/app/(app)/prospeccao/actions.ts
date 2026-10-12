'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { flash, requireModule } from '@/lib/session';
import { placesConfigured, searchPlaces } from '@/integrations/google-places';
import { analyzeMany, analyzeNextBatch, analyzeProspect } from '@/lib/prospecting/pipeline';
import { groupCampaigns } from '@/lib/prospecting/groups';
import { SERVICE_LABEL } from '@/lib/proposal-templates';
import { slug } from '@/lib/prospecting/groups';

const B = '/prospeccao';
const dbErr = (to: string, e: { code?: string; message: string }): never => flash(to, 'err', e.code === '42501' ? 'Seu perfil não tem permissão para esta ação.' : e.code === '23505' ? 'Já existe um registro com este e-mail, site ou local.' : e.code === '23514' ? 'Valor inválido.' : 'Não foi possível concluir a operação.');
const opt = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim() || null;

export async function createCampaign(fd: FormData) {
  const { supabase } = await requireModule('prospeccao');
  const r = z.object({ name: z.string().trim().min(2, 'Dê um nome à campanha'), niche: z.string().trim().min(2, 'Informe o nicho'), city: z.string().trim().min(2, 'Informe a cidade'), max_results: z.coerce.number().int().min(1).max(20) }).safeParse(Object.fromEntries(fd));
  if (!r.success) flash(`${B}?tab=campanhas`, 'err', r.error.issues[0].message);
  const { error } = await supabase.from('prospect_campaigns').insert(r.data);
  if (error) dbErr(`${B}?tab=campanhas`, error);
  revalidatePath(B);
  flash(`${B}?tab=campanhas`, 'ok', 'Campanha criada. Clique em “Buscar no Google Maps” para trazer prospectos.');
}

type Db = Awaited<ReturnType<typeof requireModule>>['supabase'];
type Campaign = { id: string; niche: string; city: string; max_results: number };

/** Busca no Google Maps, grava os prospectos novos e analisa os primeiros. Devolve um resumo (ou lança com a mensagem de erro). */
async function searchInto(supabase: Db, c: Campaign, opts: { analyze?: boolean } = {}) {
  const places = await searchPlaces(c.niche, c.city, c.max_results);
  let created = 0, dup = 0; const ids: string[] = [];
  for (const p of places) {
    const { data, error } = await supabase.from('prospects').insert({ campaign_id: c.id, source: 'google_maps', place_id: p.place_id, name: p.name, category: p.category, address: p.address, phone: p.phone, website: p.website, rating: p.rating, reviews_count: p.reviews_count, maps_url: p.maps_url, google_fetched_at: new Date().toISOString() }).select('id').single();
    if (error) { if (error.code === '23505') dup++; continue; }
    created++; ids.push(data!.id);
  }
  // analisa todos em paralelo limitado (5 por vez) dentro de um orçamento de tempo; o que sobrar é concluído pela tela (análise automática) e pelo worker
  const an = opts.analyze === false ? { analyzed: 0, failed: 0, skipped: ids.length } : await analyzeMany(supabase, ids, { concurrency: 5, deadlineMs: 35_000 });
  return { created, dup, analyzed: an.analyzed, left: ids.length - an.analyzed - an.failed, found: places.length };
}

/** Busca no Google Maps a partir de uma campanha existente. Integração pendente sem chave. */
export async function runCampaign(id: string) {
  const { supabase } = await requireModule('prospeccao');
  const back = `${B}?tab=campanhas`;
  if (!placesConfigured()) flash(back, 'err', 'Integração pendente: configure GOOGLE_PLACES_API_KEY no servidor (Vercel) para buscar no Google Maps.');
  const { data: c } = await supabase.from('prospect_campaigns').select('*').eq('id', id).maybeSingle();
  if (!c) flash(back, 'err', 'Campanha não encontrada.');
  if (c!.status !== 'ativa') flash(back, 'err', 'A campanha não está ativa.');
  let r; try { r = await searchInto(supabase, c!); } catch (e) { return flash(back, 'err', `Falha na busca: ${e instanceof Error ? e.message : 'erro'}`); }
  revalidatePath(B);
  flash(`${B}?tab=prospectos&grp=${slug(c!.niche)}--${slug(c!.city)}`, 'ok', `${r.created} prospecto(s) novo(s)${r.dup ? `, ${r.dup} já existia(m)` : ''}. ${r.analyzed} analisado(s)${r.left ? `; ${r.left} serão analisados automaticamente em seguida` : ''}.`);
}

/** Busca direta na página: nicho(s) + cidade → reaproveita/cria a campanha de cada nicho, busca no Google Maps e abre o(s) grupo(s). */
export async function quickSearch(fd: FormData) {
  const { supabase } = await requireModule('prospeccao');
  const picked = [...new Set(fd.getAll('niches').map((v) => String(v).trim()).filter(Boolean))].slice(0, 5);   // tipos marcados nas sugestões
  const r = z.object({ niche: z.string().trim().max(80), city: z.string().trim().min(2, 'Informe a cidade (ex.: Curitiba)').max(80) }).safeParse(Object.fromEntries(fd));
  if (!r.success) flash(B, 'err', r.error.issues[0].message);
  const { city } = r.data!;
  const niches = picked.length ? picked : [r.data!.niche];
  if (!niches[0] || niches[0].length < 2) flash(B, 'err', 'Informe o nicho (ex.: clínica odontológica) ou escolha um tipo nas sugestões.');
  if (!placesConfigured()) flash(B, 'err', 'Integração pendente: configure GOOGLE_PLACES_API_KEY na Vercel para buscar no Google Maps. Enquanto isso, use “Cadastrar manualmente”.');
  const multi = niches.length > 1;
  const { data: existing } = await supabase.from('prospect_campaigns').select('id, niche, city, max_results, status').eq('status', 'ativa');
  let created = 0, dup = 0, analyzed = 0, left = 0, found = 0, lastKey = '', failed = '';
  for (const niche of niches) {
    const key = `${slug(niche)}--${slug(city)}`;
    let c = existing?.find((x) => `${slug(x.niche)}--${slug(x.city)}` === key) as Campaign | undefined;
    if (!c) {
      const { data, error } = await supabase.from('prospect_campaigns').insert({ name: `${niche} (${city})`, niche, city, max_results: 20 }).select('id, niche, city, max_results').single();
      if (error) dbErr(B, error);
      c = data as Campaign;
    }
    try {
      const res = await searchInto(supabase, c, { analyze: !multi });   // várias buscas: a análise acontece automaticamente ao abrir cada grupo
      created += res.created; dup += res.dup; analyzed += res.analyzed; left += res.left; found += res.found; lastKey = key;
    } catch (e) { failed = e instanceof Error ? e.message : 'erro'; break; }
  }
  if (failed && !found) return flash(B, 'err', `Falha na busca: ${failed}`);
  revalidatePath(B);
  const dest = multi ? `${B}?tab=prospectos` : `${B}?tab=prospectos&grp=${lastKey}`;
  flash(dest, found ? 'ok' : 'err', found
    ? `${niches.length} busca(s): ${created} prospecto(s) novo(s)${dup ? `, ${dup} já existia(m)` : ''}.${multi ? ' Abra cada grupo para a análise automática dos sites.' : ` ${analyzed} analisado(s)${left ? `; ${left} serão analisados automaticamente em seguida` : ''}.`}${failed ? ` (parou por erro: ${failed})` : ''}`
    : 'O Google Maps não retornou resultados para essa busca. Tente outro termo ou cidade.');
}

export async function addProspect(fd: FormData) {
  const { supabase } = await requireModule('prospeccao');
  const name = opt(fd, 'name');
  if (!name) flash(`${B}?tab=novo`, 'err', 'Informe o nome da empresa.');
  const email = opt(fd, 'email');
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) flash(`${B}?tab=novo`, 'err', 'E-mail inválido.');
  const { data, error } = await supabase.from('prospects').insert({ source: 'manual', name, category: opt(fd, 'category'), website: opt(fd, 'website'), email, phone: opt(fd, 'phone'), address: opt(fd, 'address'), notes: opt(fd, 'notes') }).select('id').single();
  if (error) dbErr(`${B}?tab=novo`, error);
  await analyzeProspect(supabase, data!.id);
  revalidatePath(B);
  flash(`${B}/${data!.id}`, 'ok', 'Prospecto cadastrado e analisado.');
}

export async function analyzeNow(id: string) {
  const { supabase } = await requireModule('prospeccao');
  const r = await analyzeProspect(supabase, id, { site: { withPageSpeed: true } });
  revalidatePath(`${B}/${id}`);
  flash(`${B}/${id}`, r.ok ? 'ok' : 'err', r.ok ? 'Análise atualizada.' : `Falha na análise: ${r.error}`);
}

/** Define como e-mail principal do prospecto um dos e-mails públicos achados no site (a pessoa escolhe). */
export async function useContactEmail(id: string, fd: FormData) {
  const { supabase } = await requireModule('prospeccao');
  const email = String(fd.get('email') ?? '').trim().toLowerCase();
  const { data: p } = await supabase.from('prospects').select('analysis').eq('id', id).maybeSingle();
  const allowed = ((p?.analysis as { site?: { emails?: string[] } } | null)?.site?.emails ?? []).includes(email);
  if (!allowed) flash(`${B}/${id}`, 'err', 'Esse e-mail não está entre os encontrados no site.');
  const { error } = await supabase.from('prospects').update({ email, analysis: { ...(p!.analysis as object), email_source: 'site' } }).eq('id', id);
  if (error) dbErr(`${B}/${id}`, error);
  revalidatePath(`${B}/${id}`);
  flash(`${B}/${id}`, 'ok', 'E-mail de contato atualizado. Reanalise para refazer os rascunhos de mensagem.');
}

export async function setProspectStatus(id: string, status: string) {
  const { supabase } = await requireModule('prospeccao');
  if (!['descartado', 'respondeu', 'analisado'].includes(status)) flash(`${B}/${id}`, 'err', 'Status inválido.');
  const { error } = await supabase.from('prospects').update({ status }).eq('id', id);
  if (error) dbErr(`${B}/${id}`, error);
  if (status === 'descartado' || status === 'respondeu') await supabase.from('outreach_messages').update({ status: 'cancelada' }).eq('prospect_id', id).in('status', ['rascunho', 'aprovada']);   // para as cadências
  revalidatePath(B);
  flash(`${B}/${id}`, 'ok', status === 'respondeu' ? 'Marcado como respondeu — follow-ups cancelados.' : status === 'descartado' ? 'Prospecto descartado — mensagens pendentes canceladas.' : 'Status atualizado.');
}

export async function saveMessage(id: string, prospectId: string, fd: FormData) {
  const { supabase } = await requireModule('prospeccao');
  const body = String(fd.get('body') ?? '').trim();
  if (body.length < 10) flash(`${B}/${prospectId}`, 'err', 'A mensagem está muito curta.');
  const { error } = await supabase.from('outreach_messages').update({ subject: opt(fd, 'subject'), body, ...(fd.get('keep') === 'on' ? {} : { status: 'rascunho', approved_by: null, approved_at: null }) }).eq('id', id).in('status', ['rascunho', 'aprovada', 'falhou']);
  if (error) dbErr(`${B}/${prospectId}`, error);
  revalidatePath(`${B}/${prospectId}`);
  flash(`${B}/${prospectId}`, 'ok', 'Mensagem salva (volta para rascunho: aprove novamente).');
}

export async function approveMessage(id: string, prospectId: string) {
  const { supabase, profile } = await requireModule('prospeccao');
  const { data: m } = await supabase.from('outreach_messages').select('channel, status').eq('id', id).maybeSingle();
  if (m?.channel !== 'email') flash(`${B}/${prospectId}`, 'err', 'Somente e-mails são aprovados para envio automático.');
  const { data: p } = await supabase.from('prospects').select('email, status').eq('id', prospectId).maybeSingle();
  if (!p?.email) flash(`${B}/${prospectId}`, 'err', 'O prospecto não tem e-mail.');
  if (['descartado', 'respondeu', 'convertido'].includes(p!.status)) flash(`${B}/${prospectId}`, 'err', 'Este prospecto não pode receber novas mensagens.');
  const { error } = await supabase.from('outreach_messages').update({ status: 'aprovada', approved_by: profile.id, approved_at: new Date().toISOString() }).eq('id', id).in('status', ['rascunho', 'falhou']);
  if (error) dbErr(`${B}/${prospectId}`, error);
  revalidatePath(B);
  flash(`${B}/${prospectId}`, 'ok', 'Aprovada. O envio acontece pelo worker, dentro dos limites e horários configurados (e só com o envio ligado em Configurações).');
}

export async function cancelMessage(id: string, prospectId: string) {
  const { supabase } = await requireModule('prospeccao');
  await supabase.from('outreach_messages').update({ status: 'cancelada' }).eq('id', id).in('status', ['rascunho', 'aprovada', 'falhou']);
  revalidatePath(`${B}/${prospectId}`);
  flash(`${B}/${prospectId}`, 'ok', 'Mensagem cancelada.');
}

/** WhatsApp assistido: a pessoa abriu a conversa e enviou manualmente; registramos o contato. */
export async function markWhatsappSent(id: string, prospectId: string) {
  const { supabase } = await requireModule('prospeccao');
  await supabase.from('outreach_messages').update({ status: 'enviada', sent_at: new Date().toISOString() }).eq('id', id);
  await supabase.from('prospects').update({ status: 'contatado' }).eq('id', prospectId).in('status', ['novo', 'analisado', 'aprovado']);
  revalidatePath(`${B}/${prospectId}`);
  flash(`${B}/${prospectId}`, 'ok', 'Contato por WhatsApp registrado.');
}

export async function convertToLead(prospectId: string) {
  const { supabase, profile } = await requireModule('prospeccao');
  const back = `${B}/${prospectId}`;
  const { data: p } = await supabase.from('prospects').select('*').eq('id', prospectId).maybeSingle();
  if (!p) flash(B, 'err', 'Prospecto não encontrado.');
  if (p!.lead_id) flash(back, 'err', 'Já convertido em lead.');
  if (!p!.email && !p!.phone) flash(back, 'err', 'Preencha e-mail ou telefone do prospecto antes de converter.');
  const { data: stage } = await supabase.from('pipeline_stages').select('id').eq('active', true).order('position').limit(1).single();
  const obs = ((p!.analysis as { observations?: string[] } | null)?.observations ?? []).map((o) => `• ${o}`).join('\n');
  const { data: lead, error } = await supabase.from('leads').insert({ name: p!.name, company: p!.name, phone: p!.phone, email: p!.email, source: p!.source === 'google_maps' ? 'Prospecção (Google Maps)' : 'Prospecção', segment: p!.category, service_interest: SERVICE_LABEL[p!.recommended_service ?? ''] ?? null, stage_id: stage!.id, owner_id: profile.id, notes: `Pontuação de oportunidade: ${p!.score ?? '—'}/100\n${obs}`.trim(), created_by: profile.id }).select('id').single();
  if (error) { if (error.code === '23505') flash(back, 'err', 'Já existe um lead com este e-mail ou telefone no CRM.'); dbErr(back, error); }
  await supabase.from('prospects').update({ status: 'convertido', lead_id: lead!.id }).eq('id', prospectId);
  await supabase.from('outreach_messages').update({ status: 'cancelada' }).eq('prospect_id', prospectId).in('status', ['rascunho', 'aprovada']);
  revalidatePath(B);
  flash(`/crm/${lead!.id}`, 'ok', 'Prospecto convertido em lead no CRM.');
}

export async function addSuppression(fd: FormData) {
  const { supabase } = await requireModule('prospeccao');
  const v = String(fd.get('value') ?? '').trim().toLowerCase();
  if (!v) flash(`${B}?tab=bloqueios`, 'err', 'Informe um e-mail ou domínio.');
  const row = v.includes('@') ? { email: v } : { domain: v.replace(/^https?:\/\/|^www\.|\/.*$/gi, '') };
  const { error } = await supabase.from('suppression_list').insert({ ...row, source: 'manual', note: opt(fd, 'note') });
  if (error && error.code !== '23505') dbErr(`${B}?tab=bloqueios`, error);
  revalidatePath(B);
  flash(`${B}?tab=bloqueios`, 'ok', 'Adicionado à lista de bloqueio — nunca mais receberá mensagens.');
}
export async function removeSuppression(id: string) {
  const { supabase, profile } = await requireModule('prospeccao');
  if (profile.role !== 'admin') flash(`${B}?tab=bloqueios`, 'err', 'Só administradores removem itens da lista de bloqueio.');
  await supabase.from('suppression_list').delete().eq('id', id);
  revalidatePath(B);
  flash(`${B}?tab=bloqueios`, 'ok', 'Removido da lista de bloqueio.');
}

export async function saveOutreachSettings(fd: FormData) {
  const { supabase } = await requireModule('prospeccao');
  const n = (k: string) => Number(fd.get(k));
  const r = z.object({ daily_email_limit: z.number().int().min(1).max(500), window_start_hour: z.number().int().min(0).max(23), window_end_hour: z.number().int().min(1).max(24), followup_days: z.number().int().min(2).max(30), max_followups: z.number().int().min(0).max(3) })
    .safeParse({ daily_email_limit: n('daily_email_limit'), window_start_hour: n('window_start_hour'), window_end_hour: n('window_end_hour'), followup_days: n('followup_days'), max_followups: n('max_followups') });
  if (!r.success || r.data.window_end_hour <= r.data.window_start_hour) flash(`${B}?tab=config`, 'err', 'Confira os limites: horário final deve ser maior que o inicial.');
  const email = opt(fd, 'sender_email');
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) flash(`${B}?tab=config`, 'err', 'E-mail do remetente inválido.');
  const { error } = await supabase.from('outreach_settings').update({ ...r.data!, sender_name: opt(fd, 'sender_name'), sender_email: email, reply_to: opt(fd, 'reply_to'), company_legal_name: opt(fd, 'company_legal_name'), company_document: opt(fd, 'company_document'), company_address: opt(fd, 'company_address'),
    weekdays_only: fd.get('weekdays_only') === 'on', require_approval: fd.get('require_approval') === 'on', sending_enabled: fd.get('sending_enabled') === 'on' }).eq('id', 1);
  if (error) flash(`${B}?tab=config`, 'err', error.code === '42501' ? 'Apenas administradores alteram as configurações de envio.' : 'Não foi possível salvar.');
  revalidatePath(B);
  flash(`${B}?tab=config`, 'ok', 'Configurações salvas.');
}

/** Análise em sequência chamada pela tela (lotes de 4). `grp` = chave do grupo, 'manual' ou 'todos'. */
export async function analyzeBatch(grp: string): Promise<{ processed: number; remaining: number; error?: string }> {
  const { supabase } = await requireModule('prospeccao');
  let scope: { campaignIds?: string[]; manualOnly?: boolean } = {};
  if (grp === 'manual') scope = { manualOnly: true };
  else if (grp !== 'todos') {
    const { data } = await supabase.from('prospect_campaigns').select('id, niche, city, created_at');
    const g = groupCampaigns(data ?? []).get(grp);
    if (!g) return { processed: 0, remaining: 0, error: 'Grupo não encontrado.' };
    scope = { campaignIds: g.ids };
  }
  try { const r = await analyzeNextBatch(supabase, scope, 4); return { processed: r.processed, remaining: r.remaining }; }
  catch (e) { return { processed: 0, remaining: 0, error: e instanceof Error ? e.message : 'Falha na análise.' }; }
}

/** Preços de referência exibidos como "a partir de" na landing. Campo vazio = "sob consulta". Só administradores. */
export async function savePrices(fd: FormData) {
  const { supabase } = await requireModule('prospeccao');
  for (const service of Object.keys(SERVICE_LABEL)) {
    const raw = String(fd.get(`price_${service}`) ?? '').trim().replace(/\./g, '').replace(',', '.');
    if (!raw) { const { error } = await supabase.from('service_prices').delete().eq('service', service); if (error) dbErr(`${B}?tab=config`, error); continue; }
    const v = Number(raw);
    if (!Number.isFinite(v) || v <= 0 || v > 10_000_000) flash(`${B}?tab=config`, 'err', `Valor inválido em ${SERVICE_LABEL[service]}.`);
    const unit = fd.get(`unit_${service}`) === 'mensal' ? 'mensal' : 'unico';
    const { error } = await supabase.from('service_prices').upsert({ service, price_from: v, unit }, { onConflict: 'service' });
    if (error) dbErr(`${B}?tab=config`, error);
  }
  revalidatePath(B);
  flash(`${B}?tab=config`, 'ok', 'Preços de referência salvos.');
}
