import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireModule } from '@/lib/session';
import { PageHeader, Stat, Tabs, Empty, Field } from '@/components/ui';
import { Client360Overview, Client360Operation, Client360Commercial, Client360BrandSection, Client360Portal, Client360History, type Client360Data } from '@/components/Client360Sections';
import { SubmitButton } from '@/components/SubmitButton';
import { ClientForm } from '../ClientForm';
import { addContact, addService, removeContact, saveClient, updateContact, updateService } from '../actions';
import { personName } from '@/lib/people';
import { SERVICE_LABEL } from '@/lib/proposal-templates';
import { dateBR, money } from '@/lib/format';
import { PROPOSAL_STATUS, TX_STATUS_LABEL, todayBR } from '@/lib/domain';
import { LinkButton } from '@/components/LinkButton';

export default async function ClientePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const requestedTab = (await searchParams).tab ?? 'resumo';
  const tab = requestedTab === 'fase2' ? 'operacao' : requestedTab;
  const { supabase, profile } = await requireModule('clientes');
  const role = profile.role;
  const canEdit = ['admin', 'comercial', 'financeiro'].includes(role);
  const seeFin = role === 'admin' || role === 'financeiro';
  const seeSales = ['admin', 'comercial', 'financeiro'].includes(role);
  const canBrand = ['admin', 'comercial', 'designer', 'trafego'].includes(role);
  const canPortal = role === 'admin' || role === 'comercial';

  const { data: client } = await supabase.from('clients').select('*').eq('id', id).maybeSingle();
  if (!client) notFound();
  const today = todayBR();

  const [{ data: contacts }, { data: services }, { data: proposals }, { data: tx }, { data: people }] = await Promise.all([
    supabase.from('client_contacts').select('*').eq('client_id', id).order('is_primary', { ascending: false }).order('created_at'),
    seeSales ? supabase.from('client_services').select('*').eq('client_id', id).order('created_at', { ascending: false }) : Promise.resolve({ data: [] }),
    seeSales ? supabase.from('proposals').select('id, number, title, status, total_value, created_at').eq('client_id', id).order('number', { ascending: false }) : Promise.resolve({ data: [] }),
    seeFin ? supabase.from('fin_transactions').select('id, description, amount, status, due_date, paid_at, direction').eq('client_id', id).order('due_date', { ascending: false }).limit(200) : Promise.resolve({ data: [] }),
    supabase.from('profiles').select('id, full_name, email').in('role', ['admin', 'comercial', 'designer', 'trafego']).eq('active', true).order('full_name')
  ]);

  // Dados operacionais vinculados exclusivamente ao cadastro existente do cliente.
  // Todas as consultas usam a sessão do usuário e respeitam as políticas RLS.
  const [
    projectsResult,
    contractsResult,
    brandProfileResult,
    colorsResult,
    fontsResult,
    assetsResult,
    documentsResult,
    requestsResult,
  ] = await Promise.all([
    supabase.from('projects').select('id, name, status, starts_on, due_on').eq('client_id', id).order('created_at', { ascending: false }).limit(150),
    seeSales
      ? supabase.from('contracts').select('id, number, title, status, starts_on, ends_on, readjust_on, signed_at').eq('client_id', id).order('created_at', { ascending: false }).limit(100)
      : Promise.resolve({ data: [] as Client360Data['contracts'], error: null }),
    canBrand
      ? supabase.from('brand_profiles').select('tone_of_voice, design_rules, restrictions, ai_instructions').eq('client_id', id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    canBrand
      ? supabase.from('brand_colors').select('id, name, hex, role').eq('client_id', id).order('position').limit(60)
      : Promise.resolve({ data: [] as Client360Data['colors'], error: null }),
    canBrand
      ? supabase.from('brand_fonts').select('id, name, usage').eq('client_id', id).order('position').limit(60)
      : Promise.resolve({ data: [] as Client360Data['fonts'], error: null }),
    canBrand
      ? supabase.from('brand_assets').select('id, name, category, created_at').eq('client_id', id).order('created_at', { ascending: false }).limit(100)
      : Promise.resolve({ data: [] as Client360Data['assets'], error: null }),
    canPortal
      ? supabase.from('client_documents').select('id, name, category, created_at').eq('client_id', id).order('created_at', { ascending: false }).limit(60)
      : Promise.resolve({ data: [] as Client360Data['documents'], error: null }),
    canPortal
      ? supabase.from('client_requests').select('id, subject, status, created_at').eq('client_id', id).order('created_at', { ascending: false }).limit(60)
      : Promise.resolve({ data: [] as Client360Data['requests'], error: null }),
  ]);

  const projects = (projectsResult.data ?? []) as Client360Data['projects'];
  const projectIds = projects.map((p) => p.id);
  const tasksResult = projectIds.length
    ? await supabase.from('tasks')
        .select('id, title, status, due_on, review_due_on, area, project_id, created_at')
        .in('project_id', projectIds).neq('status', 'cancelada')
        .order('due_on', { ascending: true, nullsFirst: false }).limit(300)
    : { data: [] as Client360Data['tasks'], error: null };
  const tasks = (tasksResult.data ?? []) as Client360Data['tasks'];
  const taskIds = tasks.map((t) => t.id);
  const eventsResult = tab === 'historico' && taskIds.length
    ? await supabase.from('task_events')
        .select('id, task_id, kind, detail, created_at')
        .in('task_id', taskIds).order('created_at', { ascending: false }).limit(100)
    : { data: [] as Client360Data['events'], error: null };

  const client360: Client360Data = {
    id,
    client: {
      name: client.name, status: client.status, segment: client.segment,
      notes: ['admin', 'comercial', 'financeiro'].includes(role) ? client.notes : null, website: client.website,
    },
    role, today,
    ownerName: null,
    projects,
    tasks,
    contracts: (contractsResult.data ?? []) as Client360Data['contracts'],
    proposals: (proposals ?? []) as Client360Data['proposals'],
    services: (services ?? []) as Client360Data['services'],
    brandProfile: (brandProfileResult.data ?? null) as Client360Data['brandProfile'],
    colors: (colorsResult.data ?? []) as Client360Data['colors'],
    fonts: (fontsResult.data ?? []) as Client360Data['fonts'],
    assets: (assetsResult.data ?? []) as Client360Data['assets'],
    documents: (documentsResult.data ?? []) as Client360Data['documents'],
    requests: (requestsResult.data ?? []) as Client360Data['requests'],
    events: (eventsResult.data ?? []) as Client360Data['events'],
    loadErrors: [
      projectsResult.error && 'projetos',
      contractsResult.error && 'contratos',
      tasksResult.error && 'tarefas',
      brandProfileResult.error && 'marca',
      colorsResult.error && 'cores',
      fontsResult.error && 'fontes',
      assetsResult.error && 'arquivos',
      documentsResult.error && 'documentos',
      requestsResult.error && 'solicitações',
      eventsResult.error && 'histórico',
    ].filter((v): v is string => Boolean(v)),
  };

  const mrr = (services ?? []).filter((s) => s.billing === 'mensal' && s.status === 'ativo').reduce((a, s) => a + Number(s.value), 0);
  const open = (tx ?? []).filter((t) => t.direction === 'in' && ['previsto', 'emitido'].includes(t.status));
  const overdue = open.filter((t) => t.due_date < today);
  const received = (tx ?? []).filter((t) => t.direction === 'in' && t.status === 'liquidado').reduce((a, t) => a + Number(t.amount), 0);
  const base = `/clientes/${id}`;
  const ownerName = client.owner_id ? ((people ?? []).find((p) => p.id === client.owner_id) ? personName((people ?? []).find((p) => p.id === client.owner_id)) : null) : null;
  client360.ownerName = ownerName;

  return (
    <>
      <PageHeader
        title={client.name}
        subtitle={[client.segment, client.email, client.phone, ownerName ? 'Responsável: ' + ownerName : null].filter(Boolean).join(' · ') || undefined}
        actions={<>
          <LinkButton href="/clientes" className="btn btn-sm">← Todos os clientes</LinkButton>
          {canEdit && <LinkButton href={base + '?tab=geral'} className="btn btn-sm">Editar cadastro</LinkButton>}
          <LinkButton href={'/clientes/' + id + '/google'} className="btn btn-sm">Relatórios Google</LinkButton>
        </>}
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <span className={'badge ' + (client.status === 'ativo' ? 'border-lime bg-lime/15 text-fg' : 'text-muted')}>
          {client.status === 'ativo' ? 'Cliente ativo' : client.status}
        </span>
        {ownerName && <span className="text-xs text-muted">Responsável: {ownerName}</span>}
        <span className="ml-auto text-xs text-muted">Ficha integrada · MUVENS OS</span>
      </div>

      <Tabs current={['servicos', 'propostas'].includes(tab) ? 'comercial' : tab} items={[
        { key: 'resumo', label: 'Visão geral', href: base },
        { key: 'operacao', label: 'Operação', href: base + '?tab=operacao' },
        ...(seeSales ? [{ key: 'comercial', label: 'Comercial', href: base + '?tab=comercial' }] : []),
        ...(canBrand ? [{ key: 'marca', label: 'Marca e estratégia', href: base + '?tab=marca' }] : []),
        ...(canPortal ? [{ key: 'portal', label: 'Portal e arquivos', href: base + '?tab=portal' }] : []),
        ...(seeFin ? [{ key: 'financeiro', label: 'Financeiro', href: base + '?tab=financeiro' }] : []),
        { key: 'historico', label: 'Histórico', href: base + '?tab=historico' },
        { key: 'geral', label: 'Cadastro e contatos', href: base + '?tab=geral' },
      ]} />

      {['comercial', 'servicos', 'propostas'].includes(tab) && seeSales && (
        <nav aria-label="Seções comerciais deste cliente" className="mb-6 flex flex-wrap items-center gap-2">
          {[
            { key: 'comercial', label: 'Resumo e contratos' },
            { key: 'servicos', label: 'Serviços e mensalidades' },
            { key: 'propostas', label: 'Propostas' },
          ].map((item) => (
            <Link key={item.key} href={base + '?tab=' + item.key}
              aria-current={item.key === tab ? 'page' : undefined}
              className={'btn btn-sm ' + (tab === item.key ? 'btn-dark' : '')}>{item.label}</Link>
          ))}
        </nav>
      )}

      {tab === 'resumo' && <>
        {seeFin && (
          <section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Indicadores financeiros restritos">
            <Stat label="Receita recorrente ativa" value={money(mrr)} hint="Serviços mensais ativos; não representa valores recebidos." />
            <Stat label="Contas a receber" value={money(open.reduce((a, t) => a + Number(t.amount), 0))}
              hint={overdue.length ? overdue.length + ' lançamento(s) em atraso' : 'Sem atraso registrado'} />
            <Stat label="Recebimentos registrados" value={money(received)} hint="Histórico dos lançamentos carregados nesta ficha." />
          </section>
        )}
        <Client360Overview {...client360} />
      </>}
      {tab === 'operacao' && <Client360Operation {...client360} />}
      {tab === 'comercial' && seeSales && <Client360Commercial {...client360} />}
      {tab === 'marca' && canBrand && <Client360BrandSection {...client360} />}
      {tab === 'portal' && canPortal && <Client360Portal {...client360} />}
      {tab === 'historico' && <Client360History {...client360} />}

      {tab === 'geral' && (
        <div className="grid gap-6 xl:grid-cols-3">
          <div className="card xl:col-span-2">{canEdit ? <ClientForm action={saveClient.bind(null, id)} client={client} people={people ?? []} /> : <p className="text-sm text-muted">Seu perfil tem acesso somente leitura aos dados cadastrais.</p>}</div>
          <section className="card"><h2 className="mb-4 text-base font-semibold">Contatos</h2>
            <ul className="mb-5 space-y-4">{contacts?.map((c) => (
              <li key={c.id} className="text-sm"><div className="flex items-start justify-between gap-2"><span className="min-w-0"><span className="font-medium">{c.name}</span>{c.role_title && <span className="text-muted"> · {c.role_title}</span>}{c.is_primary && <span className="ml-2 rounded-full bg-lime/40 px-2 py-0.5 text-[11px] font-medium">Responsável</span>}<span className="block break-all text-xs text-muted">{[c.email, c.phone].filter(Boolean).join(' · ')}</span></span>
                {canEdit && <form action={removeContact.bind(null, id, c.id)}><SubmitButton className="btn btn-sm" pendingText="…" confirm="Remover este contato?">Remover</SubmitButton></form>}</div>
                {['admin'].includes(role) && <Link href={`/portal?tab=acessos&c=${id}&name=${encodeURIComponent(c.name)}&email=${encodeURIComponent(c.email ?? '')}`} className="mr-3 mt-1 inline-block text-xs underline">Dar acesso ao portal</Link>}
                {canEdit && <details className="mt-1"><summary className="cursor-pointer text-xs underline">Editar</summary>
                  <form action={updateContact.bind(null, id, c.id)} className="mt-2 space-y-2"><Field label="Nome"><input name="name" required defaultValue={c.name} className="input" /></Field><Field label="Cargo"><input name="role_title" defaultValue={c.role_title ?? ''} className="input" /></Field>
                    <Field label="E-mail"><input name="email" type="email" defaultValue={c.email ?? ''} className="input" /></Field><Field label="Telefone"><input name="phone" defaultValue={c.phone ?? ''} className="input" /></Field>
                    <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="is_primary" defaultChecked={c.is_primary} /> Responsável principal do cliente</label><SubmitButton className="btn btn-sm" pendingText="…">Salvar contato</SubmitButton></form></details>}</li>))}
              {!contacts?.length && <li className="text-sm text-muted">Nenhum contato cadastrado.</li>}</ul>
            {canEdit && <form action={addContact.bind(null, id)} className="space-y-3"><Field label="Nome"><input name="name" required className="input" /></Field><Field label="Cargo"><input name="role_title" className="input" /></Field>
              <Field label="E-mail"><input name="email" type="email" className="input" /></Field><Field label="Telefone"><input name="phone" className="input" /></Field><label className="flex items-center gap-2 text-xs"><input type="checkbox" name="is_primary" /> Responsável principal do cliente</label><SubmitButton className="btn btn-sm" pendingText="…">Adicionar contato</SubmitButton></form>}</section>
        </div>)}

      {tab === 'servicos' && seeSales && (
        <div className="space-y-6">
          {!services?.length ? <Empty title="Nenhum serviço cadastrado" text="Serviços entram ao ativar uma proposta aceita ou pelo formulário abaixo. O cliente vê o nome, o período e a descrição no portal (nunca os valores)." /> : (
            <div className="card overflow-x-auto !p-0"><table className="w-full"><thead><tr className="border-b border-line"><th className="th">Serviço</th><th className="th">Cobrança</th><th className="th">Valor</th><th className="th">Início</th><th className="th">Situação</th><th className="th">No portal</th><th className="th"></th></tr></thead>
              <tbody>{services.map((sv) => (<tr key={sv.id} className="border-b border-line align-top last:border-0"><td className="td">{sv.service}{sv.description && <div className="mt-0.5 max-w-xs text-xs text-muted">{sv.description}</div>}</td><td className="td">{sv.billing === 'mensal' ? 'Mensal' : 'Pontual'}</td><td className="td">{money(sv.value)}</td><td className="td">{dateBR(sv.starts_on)}</td><td className="td"><span className="badge">{sv.status}</span></td><td className="td">{sv.portal_visible ? 'Visível' : 'Oculto'}</td>
                <td className="td"><details><summary className="cursor-pointer text-xs underline">Editar</summary>
                  <form action={updateService.bind(null, id, sv.id)} className="mt-2 w-72 space-y-2"><label className="block text-xs">Situação<select name="status" defaultValue={sv.status} className="input !py-1.5"><option value="ativo">Ativo</option><option value="pausado">Pausado</option><option value="encerrado">Encerrado</option></select></label>
                    <label className="block text-xs">Término (opcional)<input type="date" name="ends_on" defaultValue={sv.ends_on ?? ''} className="input !py-1.5" /></label>
                    <label className="block text-xs">Descrição para o cliente<textarea name="description" rows={3} defaultValue={sv.description ?? ''} className="input" /></label>
                    <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="portal_visible" defaultChecked={sv.portal_visible} /> Mostrar no portal do cliente</label><SubmitButton className="btn btn-sm" pendingText="…">Salvar</SubmitButton></form></details></td></tr>))}</tbody></table></div>)}
          {['admin', 'financeiro'].includes(role) && (
            <form action={addService.bind(null, id)} className="card max-w-3xl space-y-4"><h2 className="text-base font-semibold">Adicionar serviço</h2>
              <div className="grid gap-4 sm:grid-cols-2"><Field label="Serviço *"><input name="service" required list="svc-list" maxLength={200} className="input" placeholder="Ex.: Diagramação de livros" /></Field>
                <Field label="Cobrança"><select name="billing" className="input"><option value="mensal">Mensal</option><option value="pontual">Pontual</option></select></Field>
                <Field label="Valor (R$)" hint="Deixe 0 se não quiser que entre na receita recorrente do sistema."><input name="value" inputMode="decimal" defaultValue="0" className="input" /></Field>
                <Field label="Início"><input type="date" name="starts_on" defaultValue={today} className="input" /></Field></div>
              <datalist id="svc-list">{[...new Set(Object.values(SERVICE_LABEL))].map((l) => <option key={l} value={l} />)}</datalist>
              <Field label="Descrição para o cliente" hint="O que está incluído. Aparece em Meus serviços no portal."><textarea name="description" rows={3} className="input" /></Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="portal_visible" defaultChecked /> Mostrar no portal do cliente</label>
              <SubmitButton>Adicionar serviço</SubmitButton></form>)}
        </div>)}

      {tab === 'propostas' && seeSales && (!proposals?.length ? <Empty title="Sem propostas" /> : (
        <div className="card overflow-x-auto !p-0"><table className="w-full"><tbody>{proposals.map((p) => (
          <tr key={p.id} className="border-b border-line last:border-0"><td className="td"><Link className="font-medium hover:underline" href={`/propostas/${p.id}`}>#{p.number} · {p.title}</Link></td><td className="td">{money(p.total_value)}</td><td className="td"><span className={`badge ${PROPOSAL_STATUS[p.status]?.tone}`}>{PROPOSAL_STATUS[p.status]?.label}</span></td></tr>))}</tbody></table></div>))}

      {tab === 'financeiro' && seeFin && (!tx?.length ? <Empty title="Sem lançamentos para este cliente" /> : (
        <div className="card overflow-x-auto !p-0"><table className="w-full"><thead><tr className="border-b border-line"><th className="th">Descrição</th><th className="th">Vencimento</th><th className="th">Valor</th><th className="th">Situação</th></tr></thead>
          <tbody>{tx.map((t) => (<tr key={t.id} className="border-b border-line last:border-0"><td className="td">{t.description}</td><td className="td">{dateBR(t.due_date)}</td><td className="td">{money(t.amount)}</td>
            <td className="td"><span className={`badge ${['previsto', 'emitido'].includes(t.status) && t.due_date < today ? 'border-danger/40 text-danger' : ''}`}>{['previsto', 'emitido'].includes(t.status) && t.due_date < today ? 'Em atraso' : TX_STATUS_LABEL(t.direction as 'in' | 'out', t.status)}</span></td></tr>))}</tbody></table></div>))}


    </>
  );
}
