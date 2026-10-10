import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireModule } from '@/lib/session';
import { PageHeader, Field, Pending } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';
import { CopyButton } from '@/components/ClientButtons';
import { dateTimeBR, money } from '@/lib/format';
import { PROPOSAL_STATUS, proposalTotals } from '@/lib/domain';
import { normalizeContent } from '@/lib/proposal-templates';
import { generateContract } from '../../contratos/actions';
import { activateProposal, deleteItem, duplicateProposal, saveItem, saveProposal, sendProposal, setProposalStatus } from '../actions';

const EVENT: Record<string, string> = { enviada: 'Enviada', visualizada: 'Visualizada pelo cliente', alteracao_solicitada: 'Alteração solicitada', aceita: 'Aceite registrado', recusada: 'Recusada', expirada: 'Expirada', status_alterado: 'Status alterado', ativada: 'Ativada', nota: 'Nota' };

export default async function PropostaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { supabase, profile } = await requireModule('propostas');
  const canEdit = profile.role === 'admin' || profile.role === 'comercial';
  const canActivate = profile.role === 'admin' || profile.role === 'financeiro';

  const [{ data: p }, { data: items }, { data: events }, { data: versions }, { data: contract }] = await Promise.all([
    supabase.from('proposals').select('*').eq('id', id).maybeSingle(),
    supabase.from('proposal_items').select('*').eq('proposal_id', id).order('position').order('description'),
    supabase.from('proposal_events').select('id, kind, message, actor_name, created_at').eq('proposal_id', id).order('created_at', { ascending: false }).limit(50),
    supabase.from('proposal_versions').select('id, version, note, created_at').eq('proposal_id', id).order('version', { ascending: false }),
    supabase.from('contracts').select('id, number, status').eq('proposal_id', id).neq('status', 'cancelado').maybeSingle(),
  ]);
  if (!p) notFound();
  const c = normalizeContent(p.content);
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '');
  const link = `${base}/p/${p.token}`;
  const published = p.status !== 'rascunho';
  const st = PROPOSAL_STATUS[p.status];
  const preview = proposalTotals((items ?? []).map((i) => ({ billing: i.billing, quantity: Number(i.quantity), unit_price: Number(i.unit_price) })), p.contract_months, Number(p.discount_value));

  return (
    <>
      <PageHeader title={`#${p.number} · ${p.title}`} subtitle={`${p.client_display_name} · versão ${p.version}`}
        actions={<><span className={`badge ${st.tone}`}>{st.label}</span><Link href="/propostas" className="btn btn-sm">← Propostas</Link><Link href={`/propostas/${id}/preview`} className="btn btn-sm">Pré-visualizar / PDF</Link>
          {canEdit && <form action={duplicateProposal.bind(null, id)}><SubmitButton className="btn btn-sm" pendingText="…">Duplicar</SubmitButton></form>}</>} />

      {published && (
        <div className="card mb-6 flex flex-wrap items-center justify-between gap-3 !p-4">
          <div className="min-w-0 text-sm"><div className="text-xs uppercase tracking-wider text-muted">Link exclusivo</div><code className="block truncate">{link}</code>
            <div className="mt-1 text-xs text-muted">{p.view_count} visualização(ões){p.first_viewed_at ? ` · 1ª em ${dateTimeBR(p.first_viewed_at)}` : ''}{p.accepted_at ? ` · aceita em ${dateTimeBR(p.accepted_at)} por ${p.accepted_by_name}` : ''}</div></div>
          <CopyButton text={link} />
        </div>)}

      {canEdit && (
        <div className="mb-6 flex flex-wrap gap-2">
          {p.status === 'rascunho' && <form action={sendProposal.bind(null, id)}><SubmitButton pendingText="Enviando…" confirm="Liberar o link desta proposta ao cliente?">Marcar como enviada e gerar link</SubmitButton></form>}
          {['enviada', 'visualizada', 'em_negociacao'].includes(p.status) && <>
            <form action={setProposalStatus.bind(null, id, 'em_negociacao')}><SubmitButton className="btn btn-sm" pendingText="…">Em negociação</SubmitButton></form>
            <form action={setProposalStatus.bind(null, id, 'aceita')}><SubmitButton className="btn btn-sm" pendingText="…" confirm="Registrar aceite manualmente (ex.: fechado por WhatsApp/reunião)? Cria o cliente e dispara a preparação do contrato.">Registrar aceite manual</SubmitButton></form>
            <form action={setProposalStatus.bind(null, id, 'recusada')}><SubmitButton className="btn btn-sm" pendingText="…" confirm="Marcar como recusada?">Recusada</SubmitButton></form></>}
        </div>)}

      {p.status === 'aceita' && (
        <div className="card mb-6 border-lime bg-lime/10">
          <h2 className="text-base font-semibold">Proposta aceita — próximos passos</h2>
          <p className="mt-1 text-sm text-muted">{contract ? <>Contrato <Link className="underline" href={`/contratos/${contract.id}`}>#{contract.number}</Link> ({contract.status}). Ao assinar, o cliente é ativado e o financeiro gerado automaticamente.</> : 'Nenhum contrato gerado ainda.'} Assinatura eletrônica: <Pending>integração pendente</Pending>.</p>
          {!contract && canEdit && <form action={generateContract.bind(null, id, undefined)} className="mt-3"><SubmitButton pendingText="Gerando…">Gerar rascunho de contrato</SubmitButton></form>}
          {p.activated_at ? <p className="mt-3 text-sm">Ativada em {dateTimeBR(p.activated_at)}. {p.client_id && <Link className="underline" href={`/clientes/${p.client_id}`}>Ver cliente</Link>}</p>
            : canActivate ? <form action={activateProposal.bind(null, id)} className="mt-4 flex flex-wrap items-end gap-3"><Field label="Primeiro vencimento"><input type="date" name="first_due" required className="input w-48" /></Field><SubmitButton pendingText="Gerando…" confirm="Gerar cliente ativo, serviços e recebíveis previstos?">Ativar sem contrato (manual)</SubmitButton></form>
            : <p className="mt-3 text-sm text-muted">Aguardando o financeiro/administrador ativar.</p>}
        </div>)}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <section className="card">
            <h2 className="mb-5 text-base font-semibold">Serviços e valores</h2>
            <div className="space-y-3">{items?.map((i) => (
              <form key={i.id} action={saveItem.bind(null, id, i.id)} className="grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-[1fr_8rem_5rem_8rem_auto]">
                <div className="space-y-2"><input name="description" defaultValue={i.description} required className="input" aria-label="Serviço" disabled={!canEdit} /><input name="details" defaultValue={i.details ?? ''} placeholder="Detalhes (opcional)" className="input" aria-label="Detalhes" disabled={!canEdit} /></div>
                <select name="billing" defaultValue={i.billing} className="input" aria-label="Cobrança" disabled={!canEdit}><option value="pontual">Pontual</option><option value="mensal">Mensal</option></select>
                <input name="quantity" type="number" min="0.01" step="0.01" defaultValue={Number(i.quantity)} className="input" aria-label="Quantidade" disabled={!canEdit} />
                <input name="unit_price" inputMode="decimal" defaultValue={Number(i.unit_price) ? String(i.unit_price).replace('.', ',') : ''} placeholder="Valor (R$)" className="input" aria-label="Valor unitário" disabled={!canEdit} />
                {canEdit && <div className="flex gap-1.5 sm:flex-col"><SubmitButton className="btn btn-sm" pendingText="…">Salvar</SubmitButton><button formAction={deleteItem.bind(null, id, i.id)} className="btn btn-sm text-danger" formNoValidate>Excluir</button></div>}
              </form>))}
              {!items?.length && <p className="text-sm text-muted">Nenhum item. Adicione os serviços abaixo.</p>}</div>
            {canEdit && <form action={saveItem.bind(null, id, null)} className="mt-5 grid gap-2 border-t border-line pt-5 sm:grid-cols-[1fr_8rem_5rem_8rem_auto]">
              <input name="description" required placeholder="Novo serviço" className="input" aria-label="Novo serviço" /><select name="billing" className="input" aria-label="Cobrança"><option value="pontual">Pontual</option><option value="mensal">Mensal</option></select>
              <input name="quantity" type="number" min="0.01" step="0.01" defaultValue="1" className="input" aria-label="Quantidade" /><input name="unit_price" inputMode="decimal" required placeholder="Valor (R$)" className="input" aria-label="Valor" /><SubmitButton className="btn btn-sm btn-dark" pendingText="…">Adicionar</SubmitButton></form>}
            <dl className="mt-6 grid gap-2 border-t border-line pt-5 text-sm sm:max-w-sm">
              <div className="flex justify-between"><dt className="text-muted">Pontual</dt><dd>{money(preview.oneTime)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Mensal × {p.contract_months}</dt><dd>{money(preview.monthly)} × {p.contract_months}</dd></div>
              {Number(p.discount_value) > 0 && <div className="flex justify-between"><dt className="text-muted">Desconto autorizado</dt><dd>− {money(p.discount_value)}</dd></div>}
              <div className="flex justify-between border-t border-line pt-2 text-base font-semibold"><dt>Total do contrato</dt><dd>{money(p.total_value)}</dd></div>
            </dl>
          </section>

          <form action={saveProposal.bind(null, id)} className="card space-y-5">
            <h2 className="text-base font-semibold">Conteúdo da proposta</h2>
            <fieldset disabled={!canEdit} className="space-y-5">
              <div className="grid gap-5 sm:grid-cols-2"><Field label="Título"><input name="title" defaultValue={p.title} required className="input" /></Field><Field label="Nome do cliente exibido"><input name="client_display_name" defaultValue={p.client_display_name} required className="input" /></Field>
                <Field label="Validade até"><input type="date" name="valid_until" defaultValue={p.valid_until ?? ''} className="input" /></Field>
                <Field label="Vigência (meses)" hint="Multiplica a mensalidade no total."><input type="number" name="contract_months" min={1} max={120} defaultValue={p.contract_months} className="input" /></Field>
                <Field label="Parcelas do valor pontual"><input type="number" name="installments" min={1} max={60} defaultValue={p.installments} className="input" /></Field>
                <Field label="Desconto (R$)" hint="Somente administradores podem aplicar; fica registrado quem autorizou."><input name="discount_value" inputMode="decimal" defaultValue={Number(p.discount_value) ? String(p.discount_value).replace('.', ',') : ''} disabled={profile.role !== 'admin'} className="input" /></Field></div>
              <Field label="Sobre o cliente"><textarea name="sobre_cliente" rows={4} defaultValue={c.sobre_cliente} className="input" /></Field>
              <Field label="O que o cliente espera"><textarea name="expectativas" rows={3} defaultValue={c.expectativas} className="input" /></Field>
              <Field label="Resultados que vamos entregar (um por linha)" hint="Só inclua o que a Muvens pode de fato se comprometer a entregar."><textarea name="resultados" rows={4} defaultValue={c.resultados.join('\n')} className="input" /></Field>
              <Field label="Apresentação (opcional — há um texto padrão)"><textarea name="intro" rows={3} defaultValue={c.intro} className="input" /></Field>
              <Field label="Contexto e diagnóstico"><textarea name="diagnostico" rows={4} defaultValue={c.diagnostico} className="input" /></Field>
              <Field label="Objetivos (um por linha)"><textarea name="objetivos" rows={3} defaultValue={c.objetivos.join('\n')} className="input" /></Field>
              <Field label="Solução apresentada"><textarea name="solucao" rows={4} defaultValue={c.solucao} className="input" /></Field>
              <Field label="Escopo detalhado (um por linha)"><textarea name="escopo" rows={5} defaultValue={c.escopo.join('\n')} className="input" /></Field>
              <Field label="Entregáveis (um por linha)"><textarea name="entregaveis" rows={4} defaultValue={c.entregaveis.join('\n')} className="input" /></Field>
              <Field label="Etapas de execução (uma por linha: Título | descrição)"><textarea name="etapas" rows={4} defaultValue={c.etapas.map((e) => (e.description ? `${e.title} | ${e.description}` : e.title)).join('\n')} className="input" /></Field>
              <Field label="Cronograma"><textarea name="cronograma" rows={3} defaultValue={c.cronograma} className="input" placeholder="Defina prazos somente após validar com a produção." /></Field>
              <Field label="Condições de pagamento"><textarea name="payment_terms" rows={3} defaultValue={p.payment_terms} className="input" /></Field>
            </fieldset>
            {canEdit && <SubmitButton>Salvar proposta</SubmitButton>}
            {published && canEdit && <p className="text-xs text-muted">Esta proposta já foi enviada: cada salvamento cria uma nova versão e altera o que o cliente vê no link.</p>}
          </form>
        </div>

        <aside className="space-y-6">
          <section className="card"><h2 className="mb-4 text-base font-semibold">Histórico de negociação</h2>
            <ol className="space-y-3">{events?.map((e) => (<li key={e.id} className="text-sm"><div className="text-xs text-muted">{dateTimeBR(e.created_at)}{e.actor_name ? ` · ${e.actor_name}` : ''}</div><div className="font-medium">{EVENT[e.kind]}</div>{e.message && <div className="text-muted">{e.message}</div>}</li>))}
              {!events?.length && <li className="text-sm text-muted">Sem eventos ainda.</li>}</ol></section>
          <section className="card"><h2 className="mb-4 text-base font-semibold">Versões</h2>
            <ul className="space-y-2 text-sm">{versions?.map((v) => (<li key={v.id} className="flex justify-between"><span>v{v.version}{v.note ? ` · ${v.note}` : ''}</span><span className="text-muted">{dateTimeBR(v.created_at)}</span></li>))}
              {!versions?.length && <li className="text-muted">Versões são registradas ao enviar e a cada edição posterior.</li>}</ul></section>
        </aside>
      </div>
    </>
  );
}
