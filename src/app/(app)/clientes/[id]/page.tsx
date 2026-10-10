import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireModule } from '@/lib/session';
import { PageHeader, Stat, Tabs, Empty, Pending, Field } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';
import { ClientForm } from '../ClientForm';
import { addContact, removeContact, saveClient } from '../actions';
import { dateBR, money } from '@/lib/format';
import { PROPOSAL_STATUS, TX_STATUS_LABEL, todayBR } from '@/lib/domain';

export default async function ClientePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const tab = (await searchParams).tab ?? 'geral';
  const { supabase, profile } = await requireModule('clientes');
  const role = profile.role;
  const canEdit = ['admin', 'comercial', 'financeiro'].includes(role);
  const seeFin = role === 'admin' || role === 'financeiro';
  const seeSales = ['admin', 'comercial', 'financeiro'].includes(role);

  const { data: client } = await supabase.from('clients').select('*').eq('id', id).maybeSingle();
  if (!client) notFound();
  const today = todayBR();

  const [{ data: contacts }, { data: services }, { data: proposals }, { data: tx }] = await Promise.all([
    supabase.from('client_contacts').select('*').eq('client_id', id).order('created_at'),
    seeSales ? supabase.from('client_services').select('*').eq('client_id', id).order('created_at', { ascending: false }) : Promise.resolve({ data: [] }),
    seeSales ? supabase.from('proposals').select('id, number, title, status, total_value, created_at').eq('client_id', id).order('number', { ascending: false }) : Promise.resolve({ data: [] }),
    seeFin ? supabase.from('fin_transactions').select('id, description, amount, status, due_date, paid_at, direction').eq('client_id', id).order('due_date', { ascending: false }).limit(200) : Promise.resolve({ data: [] }),
  ]);

  const mrr = (services ?? []).filter((s) => s.billing === 'mensal' && s.status === 'ativo').reduce((a, s) => a + Number(s.value), 0);
  const open = (tx ?? []).filter((t) => t.direction === 'in' && ['previsto', 'emitido'].includes(t.status));
  const overdue = open.filter((t) => t.due_date < today);
  const received = (tx ?? []).filter((t) => t.direction === 'in' && t.status === 'liquidado').reduce((a, t) => a + Number(t.amount), 0);
  const base = `/clientes/${id}`;

  return (
    <>
      <PageHeader title={client.name} subtitle={[client.segment, client.email, client.phone].filter(Boolean).join(' · ') || undefined} actions={<Link href="/clientes" className="btn">← Clientes</Link>} />

      <section className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Situação do cliente">
        <Stat label="Comercial" value={<span className="text-lg">{client.status === 'ativo' ? 'Cliente ativo' : client.status}</span>} hint={seeSales ? `${(proposals ?? []).length} proposta(s) · ${(services ?? []).filter((s) => s.status === 'ativo').length} serviço(s) ativo(s)` : undefined} />
        {seeSales && <Stat label="Mensalidade (MRR)" value={money(mrr)} />}
        {seeFin && <Stat label="Financeiro" value={overdue.length ? <span className="text-danger">{overdue.length} em atraso</span> : <span className="text-ok">Em dia</span>} hint={`${money(open.reduce((a, t) => a + Number(t.amount), 0))} a receber · ${money(received)} recebido`} />}
        <div className="card"><div className="text-xs font-medium uppercase tracking-wider text-muted">Operacional</div><div className="mt-3"><Pending>Projetos e entregas — Fase 2</Pending></div></div>
      </section>

      <Tabs current={tab} items={[
        { key: 'geral', label: 'Dados e contatos', href: base },
        ...(seeSales ? [{ key: 'servicos', label: 'Serviços', href: `${base}?tab=servicos` }, { key: 'propostas', label: 'Propostas', href: `${base}?tab=propostas` }] : []),
        ...(seeFin ? [{ key: 'financeiro', label: 'Financeiro', href: `${base}?tab=financeiro` }] : []),
        { key: 'fase2', label: 'Projetos · Documentos · Campanhas', href: `${base}?tab=fase2` },
      ]} />

      {tab === 'geral' && (
        <div className="grid gap-6 xl:grid-cols-3">
          <div className="card xl:col-span-2">{canEdit ? <ClientForm action={saveClient.bind(null, id)} client={client} /> : <p className="text-sm text-muted">Seu perfil tem acesso somente leitura aos dados cadastrais.</p>}</div>
          <section className="card"><h2 className="mb-4 text-base font-semibold">Contatos</h2>
            <ul className="mb-5 space-y-3">{contacts?.map((c) => (
              <li key={c.id} className="flex items-start justify-between gap-2 text-sm"><span><span className="font-medium">{c.name}</span>{c.role_title && <span className="text-muted"> · {c.role_title}</span>}<span className="block text-xs text-muted">{[c.email, c.phone].filter(Boolean).join(' · ')}</span></span>
                {canEdit && <form action={removeContact.bind(null, id, c.id)}><SubmitButton className="btn btn-sm" pendingText="…" confirm="Remover este contato?">Remover</SubmitButton></form>}</li>))}
              {!contacts?.length && <li className="text-sm text-muted">Nenhum contato cadastrado.</li>}</ul>
            {canEdit && <form action={addContact.bind(null, id)} className="space-y-3"><Field label="Nome"><input name="name" required className="input" /></Field><Field label="Cargo"><input name="role_title" className="input" /></Field>
              <Field label="E-mail"><input name="email" type="email" className="input" /></Field><Field label="Telefone"><input name="phone" className="input" /></Field><SubmitButton className="btn btn-sm" pendingText="…">Adicionar contato</SubmitButton></form>}</section>
        </div>)}

      {tab === 'servicos' && (!services?.length ? <Empty title="Nenhum serviço contratado" text="Serviços são registrados ao ativar uma proposta aceita (Propostas → Ativar cliente e gerar financeiro)." /> : (
        <div className="card overflow-x-auto !p-0"><table className="w-full"><thead><tr className="border-b border-line"><th className="th">Serviço</th><th className="th">Cobrança</th><th className="th">Valor</th><th className="th">Início</th><th className="th">Situação</th></tr></thead>
          <tbody>{services.map((s) => (<tr key={s.id} className="border-b border-line last:border-0"><td className="td">{s.service}</td><td className="td">{s.billing === 'mensal' ? 'Mensal' : 'Pontual'}</td><td className="td">{money(s.value)}</td><td className="td">{dateBR(s.starts_on)}</td><td className="td"><span className="badge">{s.status}</span></td></tr>))}</tbody></table></div>))}

      {tab === 'propostas' && (!proposals?.length ? <Empty title="Sem propostas" /> : (
        <div className="card overflow-x-auto !p-0"><table className="w-full"><tbody>{proposals.map((p) => (
          <tr key={p.id} className="border-b border-line last:border-0"><td className="td"><Link className="font-medium hover:underline" href={`/propostas/${p.id}`}>#{p.number} · {p.title}</Link></td><td className="td">{money(p.total_value)}</td><td className="td"><span className={`badge ${PROPOSAL_STATUS[p.status]?.tone}`}>{PROPOSAL_STATUS[p.status]?.label}</span></td></tr>))}</tbody></table></div>))}

      {tab === 'financeiro' && (!tx?.length ? <Empty title="Sem lançamentos para este cliente" /> : (
        <div className="card overflow-x-auto !p-0"><table className="w-full"><thead><tr className="border-b border-line"><th className="th">Descrição</th><th className="th">Vencimento</th><th className="th">Valor</th><th className="th">Situação</th></tr></thead>
          <tbody>{tx.map((t) => (<tr key={t.id} className="border-b border-line last:border-0"><td className="td">{t.description}</td><td className="td">{dateBR(t.due_date)}</td><td className="td">{money(t.amount)}</td>
            <td className="td"><span className={`badge ${['previsto', 'emitido'].includes(t.status) && t.due_date < today ? 'border-danger/40 text-danger' : ''}`}>{['previsto', 'emitido'].includes(t.status) && t.due_date < today ? 'Em atraso' : TX_STATUS_LABEL(t.direction as 'in' | 'out', t.status)}</span></td></tr>))}</tbody></table></div>))}

      {tab === 'fase2' && <div className="card max-w-2xl text-sm"><Pending>Fase 2</Pending><p className="mt-3 text-muted">Projetos, entregáveis, documentos, relatórios, campanhas e Brand Center por cliente serão adicionados na Fase 2/3 sobre este mesmo cadastro (as tabelas de projeto já referenciarão <code>clients.id</code>).</p></div>}
    </>
  );
}
