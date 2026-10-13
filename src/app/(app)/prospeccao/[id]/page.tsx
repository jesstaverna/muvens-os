import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireModule } from '@/lib/session';
import { PageHeader, Field, Pending } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';
import { CopyButton } from '@/components/ClientButtons';
import { analyzeNow, useContactEmail, approveMessage, cancelMessage, convertToLead, markWhatsappSent, saveMessage, setProspectStatus } from '../actions';
import { MESSAGE_STATUS, PROSPECT_STATUS } from '@/lib/domain';
import { SERVICE_LABEL } from '@/lib/proposal-templates';
import { whatsappLink } from '@/lib/prospecting/message';
import { EMAIL_KIND_LABEL, type EmailKind } from '@/lib/prospecting/emails';
import { fmt, whatsappSignal } from '@/lib/prospecting/phone';
import { ChannelBadges } from '../ChannelBadges';
import type { SiteFindings } from '@/lib/prospecting/analysis';
import { dateTimeBR } from '@/lib/format';
import { Diagnostico } from '../Diagnostico';
import { LinkButton } from '@/components/LinkButton';

export const maxDuration = 60;
const Yes = ({ v, label }: { v: boolean; label: string }) => <li className="flex items-center justify-between gap-3"><span>{label}</span><span className={`badge ${v ? 'bg-lime/40' : 'border-amber-500/40 text-warn'}`}>{v ? 'encontrado' : 'não encontrado'}</span></li>;

export default async function ProspectoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { supabase } = await requireModule('prospeccao');
  const [{ data: p }, { data: msgs }] = await Promise.all([
    supabase.from('prospects').select('*, prospect_campaigns(name, city)').eq('id', id).maybeSingle(),
    supabase.from('outreach_messages').select('*').eq('prospect_id', id).order('step').order('channel'),
  ]);
  if (!p) notFound();
  const an = (p.analysis ?? null) as { site: SiteFindings | null; reasons: string[]; observations: string[]; visual?: { note: string } } | null;
  const site = an?.site ?? null; const st = PROSPECT_STATUS[p.status];
  const locked = ['descartado', 'respondeu', 'convertido'].includes(p.status);
  const siteNumbers = site?.whatsappNumbers ?? [];
  const sig = whatsappSignal(p.phone, siteNumbers);
  const emailFromSite = (p.analysis as { email_source?: string } | null)?.email_source === 'site';

  return (
    <>
      <PageHeader title={p.name} subtitle={[p.category, p.address].filter(Boolean).join(' · ') || undefined} actions={<><span className={`badge ${st.tone}`}>{st.label}</span><LinkButton href="/prospeccao" className="btn btn-sm">← Prospecção</LinkButton></>} />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <section className="card"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-xs font-medium uppercase tracking-wider text-muted">Oportunidade</div><div className="mt-1 text-4xl font-semibold">{p.score ?? '—'}<span className="text-base font-normal text-muted">/100</span></div><div className="mt-1 text-sm">Serviço sugerido: <b>{SERVICE_LABEL[p.recommended_service ?? ''] ?? '—'}</b></div></div>
            <div className="flex flex-wrap gap-2"><form action={analyzeNow.bind(null, id)}><SubmitButton className="btn btn-sm" pendingText="Analisando…">{p.analyzed_at ? 'Reanalisar' : 'Analisar agora'}</SubmitButton></form>
              {!locked && <form action={convertToLead.bind(null, id)}><SubmitButton className="btn btn-sm btn-primary" pendingText="…">Converter em lead</SubmitButton></form>}</div></div>
            {an && <div className="mt-5 border-t border-line pt-4"><h2 className="mb-2 text-sm font-semibold">O que observamos (dados públicos)</h2><ul className="list-disc space-y-1 pl-5 text-sm">{an.observations.map((o) => <li key={o}>{o}</li>)}{!an.observations.length && <li className="list-none text-muted">Nada a destacar.</li>}</ul>
              <p className="mt-3 text-sm">{(p.analysis as { need_score?: number } | null)?.need_score != null ? <>Necessidade <b>{(p.analysis as { need_score: number }).need_score}</b> · alcance de contato <b>{(((p.analysis as { contact_bonus?: number }).contact_bonus ?? 0) >= 0 ? '+' : '') + ((p.analysis as { contact_bonus?: number }).contact_bonus ?? 0)}</b> = {p.score}/100. <span className="text-muted">{((p.analysis as { reasons?: string[] }).reasons ?? []).filter((x) => /\([+-]\d+\)/.test(x)).join(' · ')}</span></> : null}</p>
              <p className="mt-3 text-xs text-muted">Pontuação por regras simples (editáveis no código) e não por estatística; use como triagem, não como verdade. Última análise: {dateTimeBR(p.analyzed_at)}.</p></div>}
            {p.analysis_error && <p className="mt-3 text-sm text-danger">Erro na última análise: {p.analysis_error}</p>}</section>

          {p.analyzed_at && p.report_token && p.status !== 'descartado' && <div className="flex flex-wrap items-center gap-2 text-sm"><span className="text-muted">Proposta online:</span><span className={`badge ${p.report_views ? 'bg-lime/50 text-fg' : 'text-muted'}`} title="Pode incluir leitores automáticos de e-mail; as aberturas feitas por você pelos botões do sistema não contam.">{p.report_views ? `Aberto ${p.report_views}× · última em ${dateTimeBR(p.report_last_viewed_at)}` : 'Ainda não aberto'}</span><a className="btn btn-sm btn-primary" href={`/diagnostico/${p.report_token}?p=1`} target="_blank" rel="noreferrer noopener">Ver proposta online</a></div>}
          {p.analyzed_at && p.report_token === undefined && <p className="rounded-lg border border-amber-500/40 px-4 py-3 text-sm text-warn">O link público do diagnóstico ainda não está ativo: falta aplicar a migração 12 no Supabase (arquivo <code>supabase/atualizacoes/C_link_publico_diagnostico.sql</code>, rodar uma vez no SQL Editor).</p>}
          <Diagnostico share={p.report_token && p.analyzed_at && p.status !== 'descartado' ? { token: p.report_token, phone: p.phone, email: p.email } : undefined} name={p.name} category={p.category} website={p.website} rating={p.rating} reviews={p.reviews_count} score={p.score} service={p.recommended_service} site={site} observations={an?.observations ?? []} analyzed={!!p.analyzed_at && !!an} generatedAt={p.analyzed_at ? dateTimeBR(p.analyzed_at) : undefined} />

          {site && (
            <section className="card"><h2 className="mb-1 text-base font-semibold">Contatos e pessoas encontrados no site</h2>
              <p className="mb-3 text-xs text-muted">Só o que a própria empresa publicou em páginas públicas ({(site.pagesChecked ?? []).length || 1} página(s) verificada(s): início, contato, equipe, comercial/compras quando existem). Não adivinhamos e-mails nem consultamos o LinkedIn.</p>
              {(site.contacts ?? []).length === 0 && (site.people ?? []).length === 0 ? <p className="text-sm text-muted">Nenhum e-mail ou cargo comercial/compras/direção publicado nas páginas verificadas. Tente o telefone, o WhatsApp ou o formulário do site.</p> : (<>
                {(site.contacts ?? []).length > 0 && <ul className="space-y-2 text-sm">{(site.contacts ?? []).map((c: { email: string; kind: string }) => (
                  <li key={c.email} className="flex flex-wrap items-center justify-between gap-2"><span><b>{c.email}</b> <span className={`badge ml-1 ${['comercial', 'compras', 'diretoria'].includes(c.kind) ? 'bg-lime/50 text-fg' : 'text-muted'}`}>{EMAIL_KIND_LABEL[c.kind as EmailKind] ?? c.kind}</span></span>
                    {p.email === c.email ? <span className="text-xs text-muted">em uso</span> : <form action={useContactEmail.bind(null, id)}><input type="hidden" name="email" value={c.email} /><SubmitButton className="btn btn-sm" pendingText="…">Usar este e-mail</SubmitButton></form>}</li>))}</ul>}
                {(site.people ?? []).length > 0 && <ul className="mt-4 space-y-1 border-t border-line pt-3 text-sm">{(site.people ?? []).map((x: { role: string; title: string; name?: string }) => <li key={x.role + x.title + (x.name ?? '')}><span className="badge mr-2">{x.role === 'comercial' ? 'Comercial' : x.role === 'compras' ? 'Compras' : 'Direção'}</span>{x.name ? <b>{x.name}</b> : null}{x.name ? ' — ' : ''}{x.title}</li>)}</ul>}</>)}
            </section>)}

          {site && (
            <section className="card"><h2 className="mb-3 text-base font-semibold">Site e presença online</h2>
              {!site.reachable ? <p className="text-sm text-warn">Site inacessível na análise ({site.error}).</p> : (
                <><ul className="space-y-2 text-sm"><Yes v={site.https} label="Conexão segura (HTTPS)" /><Yes v={site.hasViewport} label="Adaptação para celular" /><Yes v={site.hasMetaDescription} label="Descrição para o Google" /><Yes v={site.hasWhatsappLink} label="Botão/link de WhatsApp" />{!!site.whatsappNumbers?.length && <li className="flex justify-between gap-3 text-muted"><span>Número de WhatsApp publicado</span><b className="text-fg">{site.whatsappNumbers.map((n) => fmt(n)).join(' · ')}</b></li>}{!!site.emails?.length && <li className="flex justify-between gap-3 text-muted"><span>E-mails públicos no site</span><b className="truncate text-fg">{site.emails.join(' · ')}</b></li>}<Yes v={site.hasContactForm} label="Formulário de contato" /><Yes v={site.hasAdsPixel} label="Pixel/tag de anúncios" /><Yes v={site.hasFavicon} label="Ícone da aba (favicon)" /><Yes v={site.hasShareImage} label="Imagem de compartilhamento" />
                  {typeof site.pageSpeedScore === 'number' && <li className="flex justify-between"><span>Velocidade no celular (PageSpeed)</span><b>{site.pageSpeedScore}/100</b></li>}</ul>
                  <div className="mt-4 text-sm"><span className="label">Redes sociais encontradas no site</span>{Object.keys(site.socials).length ? <ul className="space-y-1">{Object.entries(site.socials).map(([k, v]) => <li key={k}><a className="underline" href={v} target="_blank" rel="noreferrer noopener">{k}</a></li>)}</ul> : <span className="text-muted">nenhuma</span>}</div></>)}
              <p className="mt-4 rounded-xl bg-subtle p-3 text-xs text-muted"><Pending>Identidade visual</Pending> {an?.visual?.note}</p></section>)}

          <section className="space-y-4"><h2 className="text-base font-semibold">Mensagens</h2>
            {!msgs?.length && <p className="text-sm text-muted">Nenhuma mensagem ainda. Analise o prospecto para gerar os rascunhos.</p>}
            {msgs?.map((m) => (
              <article key={m.id} className="card"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div className="text-sm font-medium">{m.channel === 'email' ? 'E-mail' : 'WhatsApp (assistido)'} · {m.step === 1 ? '1º contato' : `follow-up ${m.step - 1}`}</div><span className="badge">{MESSAGE_STATUS[m.status]}{m.sent_at ? ` · ${dateTimeBR(m.sent_at)}` : ''}</span></div>
                {m.error && <p className="mb-2 text-xs text-danger">Erro: {m.error}</p>}
                {m.channel === 'email' ? (
                  <form action={saveMessage.bind(null, m.id, id)} className="space-y-3"><fieldset disabled={['enviada', 'enviando', 'cancelada'].includes(m.status)} className="space-y-3"><Field label="Assunto"><input name="subject" defaultValue={m.subject ?? ''} className="input" /></Field><Field label="Texto"><textarea name="body" rows={12} defaultValue={m.body} className="input font-mono text-xs" /></Field></fieldset>
                    <p className="text-xs text-muted">O rodapé com identificação da empresa, motivo do contato e link de descadastro é adicionado automaticamente no envio.</p>
                    {['rascunho', 'aprovada', 'falhou'].includes(m.status) && <div className="flex flex-wrap gap-2"><SubmitButton className="btn btn-sm" pendingText="…">Salvar texto</SubmitButton></div>}</form>
                ) : (<><p className="whitespace-pre-line rounded-xl bg-subtle p-4 text-sm">{m.body}</p></>)}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {m.channel === 'email' && ['rascunho', 'falhou'].includes(m.status) && !locked && <form action={approveMessage.bind(null, m.id, id)}><SubmitButton className="btn btn-sm btn-primary" pendingText="…" confirm="Aprovar este e-mail para envio automático (dentro dos limites e horários)?">Aprovar para envio</SubmitButton></form>}
                  {m.channel === 'whatsapp_manual' && sig.level === 'improvavel' && <p className="w-full rounded-lg bg-amber-500/15 p-2.5 text-xs text-warn">{sig.detail}</p>}
                  {m.channel === 'whatsapp_manual' && m.status === 'rascunho' && !locked && (whatsappLink(p.phone, m.body) ? <><a className="btn btn-sm btn-primary" href={whatsappLink(p.phone, m.body)!} target="_blank" rel="noreferrer noopener">Abrir no WhatsApp</a><form action={markWhatsappSent.bind(null, m.id, id)}><SubmitButton className="btn btn-sm" pendingText="…">Já enviei</SubmitButton></form></> : <span className="text-xs text-muted">Sem telefone válido.</span>)}
                  {m.channel === 'whatsapp_manual' && <CopyButton text={m.body} label="Copiar texto" />}
                  {['rascunho', 'aprovada', 'falhou'].includes(m.status) && <form action={cancelMessage.bind(null, m.id, id)}><SubmitButton className="btn btn-sm" pendingText="…">Cancelar</SubmitButton></form>}</div></article>))}</section>
        </div>

        <aside className="space-y-6">
          <section className="card text-sm"><h2 className="mb-3 text-base font-semibold">Dados</h2><dl className="space-y-2">
            <div className="flex justify-between gap-3"><dt className="text-muted">Site</dt><dd className="truncate">{p.website ? <a className="underline" href={p.website} target="_blank" rel="noreferrer noopener">{p.website_domain}</a> : '—'}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">E-mail</dt><dd className="truncate">{p.email ?? '—'}{emailFromSite && <span className="ml-1 text-xs text-muted">(achado no site)</span>}</dd></div><div className="flex justify-between gap-3"><dt className="text-muted">Telefone</dt><dd>{p.phone ?? '—'}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">Google</dt><dd>{p.rating ? `${String(p.rating).replace('.', ',')} ★ (${p.reviews_count ?? 0})` : '—'}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">Origem</dt><dd>{p.source === 'google_maps' ? 'Google Maps' : p.source === 'inbound' ? 'Lead de anúncio/formulário' : 'Manual'}</dd></div><div className="flex justify-between gap-3"><dt className="text-muted">Base legal</dt><dd>legítimo interesse</dd></div></dl>
            <div className="mt-4 border-t border-line pt-3"><div className="label">Canais disponíveis</div><ChannelBadges email={p.email} emailFromSite={emailFromSite} phone={p.phone} siteNumbers={siteNumbers} linkedin={site?.socials?.linkedin} people={site?.people} analyzed={!!p.analyzed_at} /><p className="mt-2 text-xs text-muted">{sig.detail} O WhatsApp não permite confirmar se um número tem conta sem enviar mensagem; este é só um sinal.</p></div>
            {p.maps_url && <a className="mt-3 inline-block underline" href={p.maps_url} target="_blank" rel="noreferrer noopener">Ver no Google Maps</a>}
            {p.lead_id && <Link href={`/crm/${p.lead_id}`} className="mt-3 block underline">Ver lead no CRM</Link>}</section>
          {!locked && <section className="card"><h2 className="mb-3 text-base font-semibold">Resultado do contato</h2><div className="space-y-2">
            <form action={setProspectStatus.bind(null, id, 'respondeu')}><SubmitButton className="btn btn-sm w-full" pendingText="…" confirm="Marcar como respondeu? Os follow-ups são cancelados.">Respondeu / demonstrou interesse</SubmitButton></form>
            <form action={setProspectStatus.bind(null, id, 'descartado')}><SubmitButton className="btn btn-sm w-full" pendingText="…" confirm="Descartar este prospecto?">Descartar</SubmitButton></form></div>
            <p className="mt-3 text-xs text-muted">Se a pessoa pedir para não receber mais, use a lista de bloqueio (aba “Lista de bloqueio”).</p></section>}
        </aside>
      </div>
    </>
  );
}
