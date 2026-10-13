import Link from 'next/link';
import { ChevronRight, FolderOpen, List } from 'lucide-react';
import { requireModule } from '@/lib/session';
import { PageHeader, Stat, Tabs, Empty, Field, Pending } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';
import { addProspect, addSuppression, createCampaign, quickSearch, removeSuppression, runCampaign, saveOutreachSettings, savePrices, sendQueueNow, retryFailedEmails, approveReadyNow, markWhatsappDone, toggleWeekly, runAutomationNow } from './actions';
import { MESSAGE_STATUS, PROSPECT_STATUS } from '@/lib/domain';
import { SERVICE_LABEL } from '@/lib/proposal-templates';
import { dateTimeBR } from '@/lib/format';
import { placesConfigured } from '@/integrations/google-places';
import { LinkButton } from '@/components/LinkButton';
import { AutoAnalyze } from './AutoAnalyze';
import { ReanalyzeStale } from './ReanalyzeStale';
import { countStale } from '@/lib/prospecting/pipeline';
import { CONTACT_FILTERS, FOCUS_LABEL, matchesFocus, parseFocus, isReady, matchesContact, parseFilters, reachRank, whatsappNumber } from '@/lib/prospecting/filters';
import { whatsappLink } from '@/lib/prospecting/message';
import { diagnoseSending } from '@/lib/prospecting/send-diagnosis';
import { ChannelBadges } from './ChannelBadges';
import { NicheField } from './NicheField';
import { groupCampaigns, slug } from '@/lib/prospecting/groups';

export const metadata = { title: 'Prospecção' };
export const maxDuration = 60;
const one = <T,>(v: T | T[] | null | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;
type SP = { tab?: string; status?: string; grp?: string; min?: string; q?: string; f?: string | string[]; ord?: string; foco?: string };

export default async function Prospeccao({ searchParams }: { searchParams: Promise<SP> }) {
  const { supabase, profile } = await requireModule('prospeccao');
  const sp = await searchParams;
  const tab = ['prospectos', 'campanhas', 'fila', 'novo', 'bloqueios', 'config'].includes(sp.tab ?? '') ? sp.tab! : 'prospectos';
  const isAdmin = profile.role === 'admin';
  const [{ data: campaigns }, { data: settings, error: settingsError }] = await Promise.all([supabase.from('prospect_campaigns').select('*').order('created_at', { ascending: false }), supabase.from('outreach_settings').select('*').eq('id', 1).maybeSingle()]);

  // Grupos = nicho + cidade (várias campanhas do mesmo nicho/cidade ficam no mesmo box)
  const groups = groupCampaigns(campaigns ?? []);
  const grp = sp.grp ?? '';
  const current = grp === 'todos' ? { title: 'Todos os prospectos' } : grp === 'manual' ? { title: 'Cadastrados manualmente' } : groups.get(grp) ? { title: `${groups.get(grp)!.niche} (${groups.get(grp)!.city})` } : null;
  const listMode = tab === 'prospectos' && !!current;
  let pendingCount = 0; let staleCount = 0;
  if (listMode) {
    staleCount = await countStale(supabase, grp === 'manual' ? { manualOnly: true } : groups.get(grp) ? { campaignIds: groups.get(grp)!.ids } : {});
    let pcq = supabase.from('prospects').select('id', { count: 'exact', head: true }).eq('status', 'novo').is('analyzed_at', null);
    if (grp === 'manual') pcq = pcq.is('campaign_id', null); else if (groups.get(grp)) pcq = pcq.in('campaign_id', groups.get(grp)!.ids);
    pendingCount = (await pcq).count ?? 0;
  }

  let pq = supabase.from('prospects').select('id, name, category, website, email, phone, score, status, recommended_service, rating, reviews_count, campaign_id, site_numbers:analysis->site->whatsappNumbers, email_src:analysis->>email_source, linkedin:analysis->site->socials->>linkedin, people:analysis->site->people, contacts:analysis->site->contacts, needs:analysis->needs, analyzed_at, prospect_campaigns(name)').order('score', { ascending: false, nullsFirst: false }).limit(300);
  if (sp.status && sp.status in PROSPECT_STATUS) pq = pq.eq('status', sp.status);
  if (grp === 'manual') pq = pq.is('campaign_id', null); else if (groups.get(grp)) pq = pq.in('campaign_id', groups.get(grp)!.ids);
  if (sp.min && Number(sp.min) > 0) pq = pq.gte('score', Number(sp.min));
  const qText = (sp.q ?? '').trim().replace(/[%,()]/g, ' ').slice(0, 60);
  if (qText) pq = pq.or(`name.ilike.%${qText}%,category.ilike.%${qText}%`);
  const [{ data: prospects }, { data: counts }, { data: queue }, { data: priceRows }, { data: supp }] = await Promise.all([
    listMode ? pq : Promise.resolve({ data: [] as never[] }),
    supabase.from('prospects').select('status, campaign_id, score').limit(5000),
    tab === 'fila' ? supabase.from('outreach_messages').select('id, prospect_id, channel, step, subject, status, created_at, sent_at, error, prospects(name, email)').eq('channel', 'email').order('created_at', { ascending: false }).limit(200) : Promise.resolve({ data: [] as never[] }),
    tab === 'config' ? supabase.from('service_prices').select('service, price_from, unit') : Promise.resolve({ data: [] as never[] }),
    tab === 'bloqueios' ? supabase.from('suppression_list').select('*').order('created_at', { ascending: false }).limit(300) : Promise.resolve({ data: [] as never[] }),
  ]);
  const activeF = parseFilters(sp.f);
  const totalFetched = prospects?.length ?? 0;
  const foco = parseFocus(sp.foco);
  let shown: any[] = (prospects ?? []).filter((r: any) => matchesContact(r, activeF) && matchesFocus(r, foco));
  if (sp.ord === 'contato') shown = [...shown].sort((a, b) => reachRank(b) - reachRank(a) || (b.score ?? -1) - (a.score ?? -1));
  else if (sp.ord === 'nome') shown = [...shown].sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR'));
  let diag: ReturnType<typeof diagnoseSending> = [];
  let pendingAnalysis = 0;
  if (tab === 'campanhas') pendingAnalysis = (await supabase.from('prospects').select('id', { count: 'exact', head: true }).eq('status', 'novo').is('analyzed_at', null)).count ?? 0;
  let readyCount = 0; let waDue: any[] = [];
  if (tab === 'fila') {
    const { data: rd } = await supabase.from('outreach_messages').select('id, prospects!inner(email, phone, status, site_numbers:analysis->site->whatsappNumbers)').eq('channel', 'email').eq('step', 1).eq('status', 'rascunho').limit(500);
    readyCount = (rd ?? []).filter((r: any) => { const p = one(r.prospects) as any; return p && !['descartado', 'respondeu', 'convertido'].includes(p.status) && isReady(p); }).length;
    const days = Number(settings?.whatsapp_after_days ?? 3);
    const { data: sentFirst } = await supabase.from('outreach_messages').select('prospect_id').eq('channel', 'email').eq('step', 1).eq('status', 'enviada').lte('sent_at', new Date(Date.now() - days * 86400_000).toISOString()).limit(500);
    const ids = [...new Set((sentFirst ?? []).map((m: any) => m.prospect_id))];
    if (ids.length) {
      const { data: wa } = await supabase.from('outreach_messages').select('id, prospect_id, body, prospects!inner(name, phone, status, site_numbers:analysis->site->whatsappNumbers)').eq('channel', 'whatsapp_manual').eq('status', 'rascunho').in('prospect_id', ids).limit(100);
      waDue = (wa ?? []).filter((m: any) => { const p = one(m.prospects) as any; return p?.status === 'contatado' && whatsappNumber(p); });
    }
    const brt = new Date(Date.now() - 3 * 3600_000); const dayStart = new Date(Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), brt.getUTCDate(), 3)).toISOString(); // meia-noite de Brasília (UTC-3)
    const cnt = (st: string) => supabase.from('outreach_messages').select('id', { count: 'exact', head: true }).eq('channel', 'email').eq('status', st);
    const [ap, dr, fa, sent, last] = await Promise.all([cnt('aprovada'), cnt('rascunho'), cnt('falhou'),
      supabase.from('outreach_messages').select('id', { count: 'exact', head: true }).eq('channel', 'email').in('status', ['enviada', 'enviando']).gte('sent_at', dayStart),
      supabase.from('outreach_messages').select('error').eq('channel', 'email').eq('status', 'falhou').order('created_at', { ascending: false }).limit(1)]);
    diag = diagnoseSending({ settings, providerConfigured: !!process.env.RESEND_API_KEY, cronSecretConfigured: !!process.env.CRON_SECRET, approved: ap.count ?? 0, drafts: dr.count ?? 0, failed: fa.count ?? 0, sentToday: sent.count ?? 0, lastError: last.data?.[0]?.error ?? null });
  }
  const by = (s: string) => counts?.filter((c) => c.status === s).length ?? 0;
  const placesOk = placesConfigured(), emailOk = !!process.env.RESEND_API_KEY;
  const identOk = !!(settings?.sender_name && settings?.sender_email && settings?.company_legal_name && settings?.company_address);
  const nav = (k: string) => `/prospeccao?tab=${k}`;
  const input = (n: string, d?: string | number | null, extra = '') => <input name={n} defaultValue={d ?? ''} className="input" {...(extra ? { placeholder: extra } : {})} />;

  return (
    <>
      <PageHeader title="Prospecção" subtitle="Descobre empresas, analisa a presença digital com dados públicos e prepara a abordagem. E-mail automático; WhatsApp assistido (uma pessoa envia)." />

      <form action={quickSearch} className="card mb-6 !p-4" role="search" aria-label="Buscar prospectos">
        <NicheField>
          <label className="block"><span className="label">Cidade</span><input name="city" required minLength={2} maxLength={80} className="input" placeholder="ex.: Curitiba" /></label>
          <SubmitButton className="btn btn-primary w-full md:w-auto" pendingText="Buscando…">Buscar prospectos</SubmitButton>
        </NicheField>
        <p className="mt-2 text-xs text-muted">Busca empresas no Google Maps, analisa o site de cada uma e mostra os resultados abaixo, agrupados por nicho e cidade. {!placesOk && <><Pending>Google Maps pendente</Pending> — configure a chave na Vercel; até lá, use <Link href={nav('novo')} className="underline">Cadastrar manualmente</Link>.</>}</p>
      </form>

      <section className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Prospectos analisados" value={by('analisado') + by('aprovado')} hint={`${by('novo')} aguardando análise`} href={nav('prospectos')} />
        <Stat label="Contatados" value={by('contatado')} />
        <Stat label="Responderam" value={by('respondeu')} tone="lime" />
        <Stat label="Viraram lead" value={by('convertido')} href="/crm" />
      </section>

      <div className="card mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <span>Google Maps: {placesOk ? <b>configurado</b> : <Pending>pendente (GOOGLE_PLACES_API_KEY)</Pending>}</span>
        <span>Envio de e-mail: {emailOk ? <b>provedor configurado</b> : <Pending>pendente (RESEND_API_KEY)</Pending>}</span>
        <span>Identificação da empresa: {identOk ? <b>completa</b> : <Pending>incompleta</Pending>}</span>
        <span>Envio automático: {settings?.sending_enabled ? <b className="text-warn">LIGADO</b> : <b>desligado</b>}</span>
      </div>

      <Tabs current={tab} items={[{ key: 'prospectos', label: 'Prospectos', href: nav('prospectos') }, { key: 'campanhas', label: 'Campanhas (Google Maps)', href: nav('campanhas') }, { key: 'fila', label: 'Fila de e-mails', href: nav('fila') }, { key: 'novo', label: 'Cadastrar manualmente', href: nav('novo') }, { key: 'bloqueios', label: 'Lista de bloqueio', href: nav('bloqueios') }, { key: 'config', label: 'Configurações de envio', href: nav('config') }]} />

      {tab === 'prospectos' && !listMode && (() => {
        const boxes = [...groups.values()].sort((x, y) => y.latest.localeCompare(x.latest)).map((g) => ({ href: `/prospeccao?tab=prospectos&grp=${g.key}`, title: `${g.niche} (${g.city})`, sub: `${g.ids.length} campanha(s)`, rows: counts?.filter((c) => g.ids.includes(c.campaign_id)) ?? [] }));
        const manual = counts?.filter((c) => c.campaign_id == null) ?? [];
        if (manual.length) boxes.push({ href: '/prospeccao?tab=prospectos&grp=manual', title: 'Cadastrados manualmente', sub: 'sem campanha', rows: manual });
        if (!boxes.length) return <Empty title="Nenhum prospecto ainda" text="Crie uma campanha (nicho + cidade) para buscar no Google Maps ou cadastre um prospecto manualmente. Os resultados ficam agrupados em caixas por nicho e cidade." action={<LinkButton href={nav('campanhas')} className="btn btn-primary">Criar campanha</LinkButton>} />;
        return (
          <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-muted">{boxes.length} grupo(s) de nicho e cidade. Clique em um para ver os prospectos.</p><LinkButton href="/prospeccao?tab=prospectos&grp=todos" icon={List} className="btn btn-sm">Ver todos em uma lista</LinkButton></div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{boxes.map((b) => {
              const n = (st: string[]) => b.rows.filter((r) => st.includes(r.status)).length;
              const scores = b.rows.map((r) => r.score).filter((v): v is number => typeof v === 'number');
              const avg = scores.length ? Math.round(scores.reduce((a, v) => a + v, 0) / scores.length) : null, best = scores.length ? Math.max(...scores) : null;
              return (
                <Link key={b.href} href={b.href} className="card group block !p-5 transition hover:border-fg">
                  <div className="flex items-start justify-between gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-lime text-black"><FolderOpen className="h-5 w-5" strokeWidth={1.7} /></span><ChevronRight className="h-5 w-5 text-muted transition group-hover:translate-x-0.5" strokeWidth={1.7} /></div>
                  <div className="mt-4 font-semibold leading-snug">{b.title}</div><div className="text-xs text-muted">{b.sub}</div>
                  <div className="mt-4 text-3xl font-semibold tracking-tight">{b.rows.length}<span className="ml-1.5 text-sm font-normal text-muted">prospecto(s)</span></div>
                  <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]"><span className="badge">{n(['novo'])} novos</span><span className="badge">{n(['analisado', 'aprovado'])} analisados</span><span className="badge">{n(['contatado'])} contatados</span><span className="badge bg-lime/40">{n(['respondeu'])} responderam</span>{n(['convertido']) > 0 && <span className="badge bg-lime/60">{n(['convertido'])} leads</span>}</div>
                  {avg != null && <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-xs text-muted"><span>Oportunidade média <b className="text-fg">{avg}/100</b></span><span>melhor <b className="text-fg">{best}</b></span></div>}
                </Link>);
            })}</div>
          </>);
      })()}

      {tab === 'prospectos' && listMode && (
        <>
          <div className="mb-5 flex flex-wrap items-center gap-3"><LinkButton href="/prospeccao?tab=prospectos" className="btn btn-sm">← Todos os grupos</LinkButton><h2 className="text-lg font-semibold">{current!.title}</h2></div>
          <AutoAnalyze grp={grp} pending={pendingCount} />
          <ReanalyzeStale grp={grp} stale={staleCount} />
          <form method="get" className="card mb-5 space-y-3 !p-4"><input type="hidden" name="tab" value="prospectos" /><input type="hidden" name="grp" value={grp} />
            <div className="flex flex-wrap items-end gap-2">
              <label className="min-w-[14rem] flex-1"><span className="label">Buscar</span><input name="q" defaultValue={sp.q ?? ''} placeholder="Nome ou segmento da empresa" className="input" /></label>
              <label><span className="label">Status</span><select name="status" defaultValue={sp.status ?? ''} className="input w-44"><option value="">Todos</option>{Object.entries(PROSPECT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
              <label><span className="label">Pontuação mín.</span><input name="min" type="number" min={0} max={100} defaultValue={sp.min} placeholder="0" className="input w-28" /></label>
              <label><span className="label">Foco de oportunidade</span><select name="foco" defaultValue={sp.foco ?? ''} className="input w-56"><option value="">Todas</option>{(Object.keys(FOCUS_LABEL) as (keyof typeof FOCUS_LABEL)[]).map((k) => <option key={k} value={k}>{FOCUS_LABEL[k]}</option>)}</select></label>
              <label><span className="label">Ordenar por</span><select name="ord" defaultValue={sp.ord ?? ''} className="input w-48"><option value="">Maior pontuação</option><option value="contato">Mais fácil de contatar</option><option value="nome">Nome (A–Z)</option></select></label>
            </div>
            <fieldset><legend className="label">Contato disponível (marque os que você exige)</legend>
              <div className="flex flex-wrap gap-2">{CONTACT_FILTERS.map((f) => <label key={f.key} className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-line px-3 py-1.5 text-xs has-[:checked]:border-transparent has-[:checked]:bg-lime has-[:checked]:font-medium has-[:checked]:text-black"><input type="checkbox" name="f" value={f.key} defaultChecked={activeF.includes(f.key)} className="sr-only" />{f.label}</label>)}</div></fieldset>
            <div className="flex flex-wrap items-center gap-3"><button className="btn btn-dark">Filtrar</button><LinkButton href={`/prospeccao?tab=prospectos&grp=${grp}&f=email&f=wa&ord=contato`} className="btn btn-sm">Prontos: e-mail + WhatsApp</LinkButton><LinkButton href={`/prospeccao?tab=prospectos&grp=${grp}`} className="btn btn-sm">Limpar filtros</LinkButton>
              <span className="text-sm text-muted">{activeF.length || sp.q || sp.status || sp.min || sp.foco ? `${shown.length} de ${totalFetched} prospecto(s) no grupo` : `${totalFetched} prospecto(s)`}{totalFetched >= 300 ? ' (mostrando os 300 primeiros)' : ''}</span></div></form>
          {!shown.length ? <Empty title="Nenhum prospecto com esses filtros" text="Ajuste os filtros ou rode a busca da campanha novamente." /> : (
            <div className="card overflow-x-auto !p-0"><table className="w-full"><thead><tr className="border-b border-line"><th className="th">Empresa</th><th className="th">Oportunidade</th><th className="th">Serviço sugerido</th><th className="th">Contato</th><th className="th">Status</th></tr></thead>
              <tbody>{shown.map((p: any) => (<tr key={p.id} className="border-b border-line last:border-0 hover:bg-subtle/60">
                <td className="td"><Link href={`/prospeccao/${p.id}`} className="font-medium hover:underline">{p.name}</Link><div className="text-xs text-muted">{p.category ?? '—'}</div></td>
                <td className="td">{p.score == null ? <span className="text-muted">—</span> : <span className={`font-semibold ${p.score >= 60 ? 'text-ok' : ''}`}>{p.score}/100</span>}</td>
                <td className="td">{SERVICE_LABEL[p.recommended_service ?? ''] ?? '—'}<div className="mt-1 flex flex-wrap gap-1">{matchesFocus(p, 'sites') && <span className="badge text-[10px]">Site</span>}{matchesFocus(p, 'recorrentes') && <span className="badge text-[10px]">Recorrente</span>}</div></td><td className="td"><div className="mb-1.5 text-xs text-muted">{[p.phone, p.email].filter(Boolean).join(' · ') || 'sem contato'}</div><ChannelBadges email={p.email} emailFromSite={p.email_src === 'site'} phone={p.phone} siteNumbers={p.site_numbers} linkedin={p.linkedin} people={p.people} analyzed={!!p.analyzed_at} /></td>
                <td className="td"><span className={`badge ${PROSPECT_STATUS[p.status].tone}`}>{PROSPECT_STATUS[p.status].label}</span></td></tr>))}</tbody></table></div>)}
        </>)}

      {tab === 'campanhas' && (() => {
        const weekly = (campaigns ?? []).filter((c: any) => c.auto_weekly && c.status === 'ativa');
        const next = weekly.map((c: any) => (c.last_auto_run_at ? new Date(new Date(c.last_auto_run_at).getTime() + 7 * 86400_000) : new Date())).sort((a: Date, b: Date) => a.getTime() - b.getTime())[0];
        const row = (ok: boolean, text: string, fix?: string) => <li className="flex gap-3"><span className={`mt-0.5 font-bold ${ok ? 'text-ok' : 'text-danger'}`}>{ok ? '✓' : '✗'}</span><div>{text}{!ok && fix && <p className="text-xs text-muted">{fix}</p>}</div></li>;
        return (
          <section className="card mb-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-base font-semibold">Prospecção automática</h2><p className="text-xs text-muted">Busca semanal das campanhas, análise das empresas novas e criação dos rascunhos.</p></div>
            {isAdmin && <form action={runAutomationNow}><SubmitButton className="btn btn-sm btn-primary" pendingText="Rodando… (pode levar 1 min)">Rodar agora</SubmitButton></form>}</div>
            <ul className="mt-4 space-y-2 text-sm">
              {row(placesOk, 'Google Maps (chave configurada)', 'Cadastre GOOGLE_PLACES_API_KEY na Vercel e faça novo deploy.')}
              {row(!!process.env.CRON_SECRET, 'Agendador (CRON_SECRET) configurado', 'Cadastre CRON_SECRET na Vercel. Sem ele o agendador não consegue chamar o processador.')}
              {row(weekly.length > 0, `Campanhas com busca semanal ligada: ${weekly.length}`, 'Em cada campanha abaixo, clique em "Repetir toda semana".')}
              {row(pendingAnalysis === 0, `Empresas aguardando análise: ${pendingAnalysis}`, 'A análise é feita pelo agendador e também ao abrir um grupo (análise automática). Clique em "Rodar agora" para adiantar.')}
            </ul>
            <p className="mt-3 text-xs text-muted">{weekly.length ? `Próxima busca automática: ${next && next.getTime() > Date.now() ? dateTimeBR(next.toISOString()) : 'na próxima execução do agendador'}. ` : ''}Na Vercel Hobby o agendador roda uma vez por dia (11h, horário de Brasília). O botão "Rodar agora" executa na hora, sem enviar e-mails.</p></section>);
      })()}

      {tab === 'campanhas' && (
        <div className="grid gap-6 xl:grid-cols-3">
          <div className="space-y-4 xl:col-span-2">{!campaigns?.length ? <Empty title="Nenhuma campanha" text="Defina um nicho e uma cidade (ex.: clínica de estética · Campinas)." /> : campaigns.map((c) => (
            <div key={c.id} className="card flex flex-wrap items-center justify-between gap-3"><div><div className="font-medium">{c.name}</div><div className="text-xs text-muted">{c.niche} · {c.city} · até {c.max_results} resultados{c.auto_weekly ? ` · semanal${c.last_auto_run_at ? ` (última: ${dateTimeBR(c.last_auto_run_at)})` : ' (aguardando 1ª execução)'}` : ''} · {dateTimeBR(c.created_at)}</div></div>
              <div className="flex gap-2"><LinkButton className="btn btn-sm" icon={FolderOpen} href={`/prospeccao?tab=prospectos&grp=${slug(c.niche)}--${slug(c.city)}`}>Ver prospectos</LinkButton><form action={toggleWeekly.bind(null, c.id, !c.auto_weekly)}><SubmitButton className="btn btn-sm" pendingText="…">{c.auto_weekly ? 'Semanal: ligada ✓' : 'Repetir toda semana'}</SubmitButton></form><form action={runCampaign.bind(null, c.id)}><SubmitButton className="btn btn-sm btn-primary" pendingText="Buscando e analisando…">Buscar no Google Maps</SubmitButton></form></div></div>))}
            {!placesOk && <p className="text-sm text-muted">A busca só funciona depois de configurar a chave do Google Places na Vercel (<code>GOOGLE_PLACES_API_KEY</code>). Enquanto isso, cadastre prospectos manualmente.</p>}</div>
          <form action={createCampaign} className="card h-fit space-y-4"><h2 className="text-base font-semibold">Nova campanha</h2><Field label="Nome"><input name="name" required className="input" placeholder="Clínicas — Campinas" /></Field><Field label="Nicho"><input name="niche" required className="input" placeholder="clínica de estética" /></Field><Field label="Cidade"><input name="city" required className="input" placeholder="Campinas, SP" /></Field>
            <Field label="Máx. de resultados por busca" hint="Até 20 por busca (limite da API por página)."><input name="max_results" type="number" min={1} max={20} defaultValue={20} className="input" /></Field><SubmitButton>Criar campanha</SubmitButton></form>
        </div>)}

      {tab === 'fila' && (
        <section className="card mb-5 max-w-4xl"><h2 className="text-base font-semibold">Cadência: e-mail primeiro, WhatsApp depois</h2>
          <p className="mt-1 text-xs text-muted">O sistema cria os rascunhos ao analisar. O 1º contato é por e-mail; se não houver resposta em {settings?.whatsapp_after_days ?? 3} dia(s), o WhatsApp assistido aparece aqui para você enviar.</p>
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-line p-3 text-sm"><span><b>{readyCount}</b> rascunho(s) de prospectos com e-mail <b>e</b> WhatsApp prontos para aprovar{settings?.auto_approve_ready ? ' (aprovação automática ligada)' : ''}.</span>
            {readyCount > 0 && <form action={approveReadyNow}><SubmitButton className="btn btn-sm btn-primary" pendingText="Aprovando…">Aprovar os {readyCount} de uma vez</SubmitButton></form>}</div>
          <h3 className="mb-2 mt-5 text-sm font-semibold">WhatsApp para fazer hoje ({waDue.length})</h3>
          {!waDue.length ? <p className="text-sm text-muted">Nada pendente. Aparecem aqui os prospectos que receberam o e-mail há {settings?.whatsapp_after_days ?? 3}+ dia(s), ainda sem resposta e com WhatsApp.</p> : (
            <ul className="space-y-2">{waDue.map((m: any) => { const p = one(m.prospects) as any; const num = whatsappNumber(p); const link = whatsappLink(num, m.body); return (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line p-3 text-sm"><span><Link href={`/prospeccao/${m.prospect_id}`} className="font-medium hover:underline">{p.name}</Link><span className="ml-2 text-xs text-muted">{num}</span></span>
                <span className="flex gap-2">{link && <a className="btn btn-sm btn-primary" href={link} target="_blank" rel="noreferrer noopener">Abrir no WhatsApp</a>}<form action={markWhatsappDone.bind(null, m.id, m.prospect_id)}><SubmitButton className="btn btn-sm" pendingText="…">Já enviei</SubmitButton></form></span></li>); })}</ul>)}
        </section>)}

      {tab === 'fila' && (
        <section className="card mb-5 max-w-4xl"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-base font-semibold">Por que os e-mails saem (ou não)</h2><p className="text-xs text-muted">Confira cada item: todos precisam estar em dia para o envio acontecer.</p></div>
          {diag.some((c) => !c.ok && /falharam/.test(c.label)) && <form action={retryFailedEmails}><SubmitButton className="btn btn-sm" pendingText="…">Reenviar os que falharam</SubmitButton></form>}
          {isAdmin && <form action={sendQueueNow}><SubmitButton className="btn btn-sm btn-primary" pendingText="Processando…">Processar fila agora</SubmitButton></form>}</div>
          <ul className="mt-4 space-y-2 text-sm">{diag.map((c) => (<li key={c.label} className="flex gap-3"><span className={`mt-0.5 font-bold ${c.ok ? 'text-ok' : 'text-danger'}`}>{c.ok ? '✓' : '✗'}</span><div><span>{c.label}</span>{!c.ok && c.fix && <p className="text-xs text-muted">{c.fix}</p>}</div></li>))}</ul>
          <p className="mt-4 text-xs text-muted">O envio roda quando o agendador chama o processador (na Vercel Hobby, 1 vez por dia). O botão acima processa na hora, respeitando as mesmas travas.</p></section>)}

      {tab === 'fila' && (!queue?.length ? <Empty title="Nenhum e-mail na fila" text="As mensagens aparecem aqui quando um prospecto é analisado. Aprove no detalhe do prospecto." /> : (
        <div className="card overflow-x-auto !p-0"><table className="w-full"><thead><tr className="border-b border-line"><th className="th">Prospecto</th><th className="th">Passo</th><th className="th">Assunto</th><th className="th">Status</th><th className="th">Enviado em</th></tr></thead>
          <tbody>{queue.map((m: any) => (<tr key={m.id} className="border-b border-line last:border-0"><td className="td"><Link href={`/prospeccao/${m.prospect_id}`} className="font-medium hover:underline">{one(m.prospects)?.name}</Link><div className="text-xs text-muted">{one(m.prospects)?.email}</div></td>
            <td className="td">{m.step === 1 ? '1º contato' : `Follow-up ${m.step - 1}`}</td><td className="td max-w-xs truncate">{m.subject}</td><td className="td"><span className="badge">{MESSAGE_STATUS[m.status]}</span>{m.error && <div className="mt-1 text-xs text-danger">{m.error}</div>}</td><td className="td whitespace-nowrap">{m.sent_at ? dateTimeBR(m.sent_at) : '—'}</td></tr>))}</tbody></table></div>))}

      {tab === 'novo' && (
        <form action={addProspect} className="card max-w-3xl space-y-5"><div className="grid gap-5 sm:grid-cols-2"><Field label="Empresa *"><input name="name" required className="input" /></Field><Field label="Categoria / nicho"><input name="category" className="input" /></Field>
          <Field label="Site"><input name="website" className="input" placeholder="empresa.com.br" /></Field><Field label="E-mail comercial"><input name="email" type="email" className="input" /></Field><Field label="Telefone / WhatsApp"><input name="phone" className="input" /></Field><Field label="Endereço"><input name="address" className="input" /></Field></div>
          <Field label="Observações"><textarea name="notes" rows={3} className="input" /></Field>
          <p className="text-xs text-muted">Cadastre apenas contatos comerciais públicos da empresa. Ao salvar, o site é analisado automaticamente e os rascunhos de mensagem são criados.</p><SubmitButton pendingText="Analisando…">Cadastrar e analisar</SubmitButton></form>)}

      {tab === 'bloqueios' && (
        <div className="grid gap-6 xl:grid-cols-3">
          <div className="xl:col-span-2">{!supp?.length ? <Empty title="Lista de bloqueio vazia" text="Quem clica em “não quero mais receber” entra aqui automaticamente e nunca mais é contatado." /> : (
            <div className="card divide-y divide-line !p-0">{supp.map((x: any) => (<div key={x.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm"><div><div className="font-medium">{x.email ?? x.domain ?? x.phone}</div><div className="text-xs text-muted">{x.source}{x.note ? ` · ${x.note}` : ''} · {dateTimeBR(x.created_at)}</div></div>{isAdmin && <form action={removeSuppression.bind(null, x.id)}><SubmitButton className="btn btn-sm" pendingText="…" confirm="Remover da lista de bloqueio? Só faça isso com autorização expressa da pessoa.">Remover</SubmitButton></form>}</div>))}</div>)}</div>
          <form action={addSuppression} className="card h-fit space-y-4"><h2 className="text-base font-semibold">Bloquear manualmente</h2><Field label="E-mail ou domínio"><input name="value" required className="input" placeholder="pessoa@empresa.com ou empresa.com" /></Field><Field label="Observação"><input name="note" className="input" /></Field><SubmitButton pendingText="…">Bloquear</SubmitButton></form>
        </div>)}

      {tab === 'config' && !settings && (
        <div className="card max-w-3xl border-danger/40 text-sm"><h2 className="text-base font-semibold text-danger">Configurações de envio não encontradas</h2>
          <p className="mt-2 text-muted">{settingsError ? `Erro ao ler: ${settingsError.message}.` : 'A linha de configurações ainda não existe no banco.'} No SQL Editor do Supabase, rode:</p>
          <pre className="mt-3 overflow-x-auto rounded-xl bg-subtle p-4 text-xs">insert into public.outreach_settings (id) values (1) on conflict (id) do nothing;</pre><p className="mt-3 text-muted">Depois atualize esta página. Se o erro persistir, confirme que a migração <code>20261014000011_prospecting.sql</code> foi executada por completo.</p></div>)}
      {tab === 'config' && settings && (
        <form action={saveOutreachSettings} className="card max-w-3xl space-y-6"><fieldset disabled={!isAdmin} className="space-y-6">
          <div><h2 className="mb-3 text-base font-semibold">Identificação do remetente (obrigatória)</h2><div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome de quem assina"><input name="sender_name" defaultValue={settings.sender_name ?? ''} className="input" /></Field><Field label="E-mail de envio" hint="Precisa ser de um domínio verificado no provedor (SPF/DKIM)."><input name="sender_email" defaultValue={settings.sender_email ?? ''} className="input" /></Field>
            <Field label="Responder para (opcional)"><input name="reply_to" defaultValue={settings.reply_to ?? ''} className="input" /></Field><Field label="Razão social"><input name="company_legal_name" defaultValue={settings.company_legal_name ?? ''} className="input" /></Field>
            <Field label="CNPJ"><input name="company_document" defaultValue={settings.company_document ?? ''} className="input" /></Field><Field label="Endereço"><input name="company_address" defaultValue={settings.company_address ?? ''} className="input" /></Field></div></div>
          <div><h2 className="mb-3 text-base font-semibold">Limites e horários</h2><div className="grid gap-4 sm:grid-cols-3">
            <Field label="Limite diário de e-mails"><input name="daily_email_limit" type="number" min={1} max={500} defaultValue={settings.daily_email_limit} className="input" /></Field><Field label="Início (hora)"><input name="window_start_hour" type="number" min={0} max={23} defaultValue={settings.window_start_hour} className="input" /></Field><Field label="Fim (hora)"><input name="window_end_hour" type="number" min={1} max={24} defaultValue={settings.window_end_hour} className="input" /></Field>
            <Field label="Dias até o follow-up"><input name="followup_days" type="number" min={2} max={30} defaultValue={settings.followup_days} className="input" /></Field><Field label="Máx. de follow-ups"><input name="max_followups" type="number" min={0} max={3} defaultValue={settings.max_followups} className="input" /></Field></div>
            <label className="mt-4 flex items-center gap-2 text-sm"><input type="checkbox" name="weekdays_only" defaultChecked={settings.weekdays_only} /> Enviar só em dias úteis (fuso de São Paulo)</label></div>
          <div className="space-y-3 rounded-xl border border-line p-4"><h2 className="text-base font-semibold">Controles</h2>
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="require_approval" defaultChecked={settings.require_approval} className="mt-1" /><span><b>Exigir aprovação humana de cada e-mail</b> (recomendado). Desmarque só depois de revisar vários textos e ver que a qualidade está boa.</span></label>
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="auto_approve_ready" defaultChecked={settings.auto_approve_ready} className="mt-1" /><span><b>Aprovar automaticamente</b> o 1º e-mail de quem tem <b>e-mail e WhatsApp</b> (pontuação mínima abaixo). Os demais continuam esperando a sua aprovação. As travas de envio (horário, limite, bloqueios, identificação) continuam valendo.</span></label>
            <div className="grid gap-4 pl-6 sm:grid-cols-2"><Field label="Pontuação mínima para aprovar sozinho"><input name="auto_approve_min_score" type="number" min={0} max={100} defaultValue={settings.auto_approve_min_score ?? 0} className="input" /></Field><Field label="Dias até o WhatsApp (depois do e-mail)"><input name="whatsapp_after_days" type="number" min={1} max={30} defaultValue={settings.whatsapp_after_days ?? 3} className="input" /></Field></div>
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="sending_enabled" defaultChecked={settings.sending_enabled} className="mt-1" /><span><b>Ligar o envio automático.</b> Só envia se: provedor configurado, identificação completa, dentro do horário e do limite, e fora da lista de bloqueio. Todo e-mail leva identificação, motivo do contato e link de descadastro.</span></label></div>
        </fieldset>{isAdmin ? <SubmitButton>Salvar configurações</SubmitButton> : <p className="text-sm text-muted">Somente administradores alteram estas configurações.</p>}</form>)}
      {tab === 'config' && settings && (
        <form action={savePrices} className="card mt-6 max-w-3xl space-y-4"><fieldset disabled={!isAdmin} className="space-y-4">
          <div><h2 className="text-base font-semibold">Preços de referência ("a partir de")</h2><p className="mt-1 text-sm text-muted">Aparecem na landing do diagnóstico, na proposta de cada serviço. Deixe em branco para exibir "sob consulta". Se nenhum preço for preenchido, a landing não mostra valores.</p></div>
          <div className="space-y-2">{Object.entries(SERVICE_LABEL).map(([k, label]) => { const row = priceRows?.find((x: { service: string }) => x.service === k) as { price_from: number; unit: string } | undefined; return (
            <div key={k} className="grid items-center gap-2 sm:grid-cols-[1fr_9rem_8rem]"><span className="text-sm">{label}</span>
              <input name={`price_${k}`} inputMode="decimal" placeholder="sob consulta" defaultValue={row ? String(row.price_from).replace('.', ',') : ''} className="input" aria-label={`Preço de ${label}`} />
              <select name={`unit_${k}`} defaultValue={row?.unit ?? 'unico'} className="input" aria-label={`Tipo de cobrança de ${label}`}><option value="unico">valor único</option><option value="mensal">por mês</option></select></div>); })}</div>
        </fieldset>{isAdmin ? <SubmitButton>Salvar preços</SubmitButton> : <p className="text-sm text-muted">Somente administradores alteram os preços.</p>}</form>)}
    </>
  );
}
