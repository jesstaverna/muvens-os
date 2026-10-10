import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireModule } from '@/lib/session';
import { PageHeader, Field, Pending } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';
import { dateTimeBR, money } from '@/lib/format';
import { setContractStatus, saveContract, changeTemplate } from '../actions';
import { SERVICE_LABEL } from '@/lib/proposal-templates';
import { CONTRACT_STATUS } from '@/lib/domain';

export default async function ContratoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { supabase, profile } = await requireModule('contratos');
  const { data: tpls } = await supabase.from('contract_templates').select('id, service_template').eq('active', true).order('service_template');
  const { data: c } = await supabase.from('contracts').select('*, clients(name), proposals(number, title)').eq('id', id).maybeSingle();
  if (!c) notFound();
  const canEdit = profile.role === 'admin' || profile.role === 'comercial';
  const isAdmin = profile.role === 'admin';
  const editable = canEdit && ['rascunho', 'em_revisao'].includes(c.status);
  const pendentes = (c.body.match(/\[PREENCHER[^\]]*\]/g) ?? []).length;
  const cl = Array.isArray(c.clients) ? c.clients[0] : c.clients, pr = Array.isArray(c.proposals) ? c.proposals[0] : c.proposals;
  const st = CONTRACT_STATUS[c.status];
  const act = (status: string, label: string, opts: { confirm?: string; className?: string } = {}) => (
    <form action={setContractStatus.bind(null, id, status, undefined)}><SubmitButton className={opts.className ?? 'btn btn-sm'} pendingText="…" confirm={opts.confirm}>{label}</SubmitButton></form>);

  return (
    <>
      <PageHeader title={`#${c.number} · ${c.title}`} subtitle={`${cl?.name ?? ''} · ${SERVICE_LABEL[c.service_template ?? ''] ?? 'Serviço'} · proposta #${pr?.number}`}
        actions={<><span className={`badge ${st.tone}`}>{st.label}</span><Link href="/contratos" className="btn btn-sm">← Contratos</Link><Link href={`/propostas/${c.proposal_id}`} className="btn btn-sm">Ver proposta</Link><Link href={`/contratos/${id}/imprimir`} className="btn btn-sm">Imprimir / PDF</Link></>} />

      <div className="card mb-6 text-sm"><b>Revisão humana obrigatória.</b> O texto é gerado a partir de um modelo-base e dos dados da proposta; <u>não é assessoria jurídica</u>. Revise com o jurídico e complete os campos <code>[PREENCHER]</code> antes de aprovar.
        {pendentes > 0 && <span className="ml-1 font-medium text-warn">Pendentes: {pendentes}.</span>}</div>

      {canEdit && (
        <div className="mb-6 flex flex-wrap gap-2">
          {c.status === 'rascunho' && act('em_revisao', 'Enviar para revisão', { className: 'btn btn-primary' })}
          {c.status === 'em_revisao' && <>{act('aprovado', 'Aprovar contrato', { className: 'btn btn-primary', confirm: 'Aprovar este contrato? O texto ficará travado.' })}{act('rascunho', 'Voltar a rascunho')}</>}
          {c.status === 'aprovado' && act('em_revisao', 'Reabrir para revisão', { confirm: 'Reabrir permite editar o texto de novo.' })}
          {['rascunho', 'em_revisao', 'aprovado', 'enviado_assinatura'].includes(c.status) && act('cancelado', 'Cancelar contrato', { confirm: 'Cancelar este contrato?' })}
        </div>)}

      {['aprovado', 'enviado_assinatura'].includes(c.status) && (
        <div className="card mb-6 border-lime">
          <h2 className="text-base font-semibold">Assinatura</h2>
          <p className="mt-1 text-sm text-muted">Envio por Clicksign/ZapSign: <Pending>integração pendente</Pending> (precisa de conta e token). Enquanto isso, registre a assinatura feita fora do sistema.</p>
          {isAdmin ? (
            <form action={setContractStatus.bind(null, id, 'assinado')} className="mt-4 grid items-end gap-3 sm:grid-cols-[12rem_1fr_auto]">
              <Field label="Data da assinatura"><input type="date" name="signed_on" required className="input" /></Field>
              <Field label="Observação / comprovante"><input name="signature_note" placeholder="Ex.: PDF assinado recebido por e-mail em…" className="input" /></Field>
              <SubmitButton pendingText="Registrando…" confirm="Registrar assinatura? Isso ativa o cliente e gera os recebíveis previstos no Financeiro.">Registrar assinatura manual</SubmitButton></form>
          ) : <p className="mt-3 text-sm text-muted">Somente administradores registram a assinatura.</p>}
        </div>)}
      {c.status === 'assinado' && <div className="card mb-6 border-lime bg-lime/10 text-sm">Assinado em {dateTimeBR(c.signed_at)} ({c.signature_provider}). {c.signature_note}<br />Cliente ativado e recebíveis previstos gerados. Valor: {money(c.total_value)}.</div>}

      {editable && (
        <form action={changeTemplate.bind(null, id)} className="card mb-6 flex flex-wrap items-end gap-3">
          <label className="min-w-64 flex-1"><span className="label">Serviço do contrato</span><select name="template_id" defaultValue={c.template_id ?? ''} className="input">{tpls?.map((t) => <option key={t.id} value={t.id}>{SERVICE_LABEL[t.service_template] ?? t.service_template}</option>)}</select></label>
          <SubmitButton className="btn" pendingText="Aplicando…" confirm="Trocar o serviço regera o texto do contrato e descarta edições manuais. Continuar?">Aplicar modelo</SubmitButton>
        </form>)}

      <form action={saveContract.bind(null, id)} className="card space-y-5">
        <fieldset disabled={!editable && !(canEdit && c.status === 'assinado')} className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-2"><Field label="Título"><input name="title" defaultValue={c.title} required className="input" /></Field>
            <Field label="Início da vigência"><input type="date" name="starts_on" defaultValue={c.starts_on ?? ''} className="input" /></Field>
            <Field label="Fim da vigência" hint="Calculado na assinatura (início + meses) se vazio."><input type="date" name="ends_on" defaultValue={c.ends_on ?? ''} className="input" /></Field>
            <Field label="Data de reajuste (alerta 30 dias antes)"><input type="date" name="readjust_on" defaultValue={c.readjust_on ?? ''} className="input" /></Field></div>
          {editable && <Field label="Texto do contrato"><textarea name="body" rows={32} defaultValue={c.body} className="input font-mono text-xs leading-relaxed" /></Field>}
        </fieldset>
        {!editable && <div><span className="label">Texto do contrato</span><pre className="whitespace-pre-wrap rounded-xl bg-subtle p-5 font-mono text-xs leading-relaxed">{c.body}</pre></div>}
        {(editable || (canEdit && c.status === 'assinado')) && <SubmitButton>Salvar</SubmitButton>}
      </form>
    </>
  );
}
