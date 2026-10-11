import Link from 'next/link';
import { requireModule } from '@/lib/session';
import { PageHeader, Stat, Empty } from '@/components/ui';
import { ProgressBar, RevenueChart } from '@/components/Charts';
import { money, moneyCompact, pct, dateBR } from '@/lib/format';
import { elapsedFraction, goalProgress, monthRange, todayBR, type Basis } from '@/lib/domain';
import { LinkButton } from '@/components/LinkButton';
import { Radar } from 'lucide-react';

export const metadata = { title: 'Dashboard' };
const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

type SP = { m?: string; from?: string; to?: string; client?: string };
const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

export default async function Dashboard({ searchParams }: { searchParams: Promise<SP> }) {
  const { supabase, profile } = await requireModule('dashboard');
  const sp = await searchParams;
  const today = todayBR();
  const [ty, tm] = today.split('-').map(Number);

  let from: string, to: string, label: string;
  if (isDate(sp.from) && isDate(sp.to) && sp.from! <= sp.to!) { from = sp.from!; to = sp.to!; label = `${dateBR(from)} a ${dateBR(to)}`; }
  else {
    const m = /^(\d{4})-(\d{2})$/.exec(sp.m ?? '');
    const y = m ? Number(m[1]) : ty, mo = m ? Math.min(Math.max(Number(m[2]), 1), 12) : tm;
    ({ from, to } = monthRange(y, mo));
    label = `${MONTHS[mo - 1]}/${y}`;
  }
  // período imediatamente anterior, do mesmo tamanho (para comparação)
  const day = 86_400_000, d0 = Date.parse(from), d1 = Date.parse(to);
  const prevTo = new Date(d0 - day).toISOString().slice(0, 10), prevFrom = new Date(d0 - day - (d1 - d0)).toISOString().slice(0, 10);
  const clientId = sp.client && /^[0-9a-f-]{36}$/.test(sp.client) ? sp.client : null;

  const seeFinance = profile.role === 'admin' || profile.role === 'financeiro';
  const seeSales = profile.role === 'admin' || profile.role === 'comercial';

  const [{ data: metrics, error }, { data: prevMetrics }, { data: clients }, { data: series }, { data: goal }, { data: alerts }, { count: projectsActive }, { count: tasksLate }] = await Promise.all([
    supabase.rpc('dashboard_metrics', { p_from: from, p_to: to, p_client: clientId }),
    supabase.rpc('dashboard_metrics', { p_from: prevFrom, p_to: prevTo, p_client: clientId }),
    supabase.from('clients').select('id, name').order('name'),
    seeFinance ? supabase.rpc('finance_monthly_series', { p_months: 12 }) : Promise.resolve({ data: null }),
    supabase.from('goals').select('basis, revenue_target').eq('period_type', 'mensal').eq('period_start', from.slice(0, 8) + '01').maybeSingle(),
    supabase.from('notifications').select('id, severity, title, link').is('read_at', null).order('created_at', { ascending: false }).limit(5),
    (() => { let q = supabase.from('projects').select('id', { count: 'exact', head: true }).eq('status', 'em_andamento'); if (clientId) q = q.eq('client_id', clientId); return q; })(),
    (() => { let q = supabase.from('tasks').select('id, projects!inner(client_id)', { count: 'exact', head: true }).lt('due_on', today).in('status', ['a_fazer', 'em_andamento', 'produzido', 'ajustes']); if (clientId) q = q.eq('projects.client_id', clientId); return q; })(),
  ]);

  if (error || !metrics) return <Empty title="Não foi possível carregar os indicadores" text={error?.message ?? 'Tente novamente em instantes.'} />;
  const m = metrics as Record<string, number>;
  const n = (k: string) => Number(m[k] ?? 0);
  const pm = (prevMetrics ?? {}) as Record<string, number>;
  const dlt = (k: string, goodWhenUp = true) => { const a = n(k), b = Number(pm[k] ?? 0); return { pct: b > 0 ? ((a - b) / b) * 100 : null, goodWhenUp }; };

  const fixedAndVar = n('expenses_fixed') + n('expenses_variable') + n('expenses_other');
  const basis = (goal?.basis ?? 'recebido') as Basis;
  const actual = basis === 'contratado' ? n('contracted') : basis === 'emitido' ? n('issued') : n('received');
  const isMonth = from.endsWith('-01') && to.slice(0, 7) === from.slice(0, 7);
  const g = goal && isMonth ? goalProgress({ target: Number(goal.revenue_target), basis, actual, pendingReceivables: n('pending_in_period'), weightedPipeline: n('pipeline_weighted'), elapsedFraction: elapsedFraction(from, to, today) }) : null;

  const chart = (series as { month: string; received: number; spent: number }[] | null)?.map((r) => ({ label: MONTHS[Number(r.month.slice(5, 7)) - 1], a: Number(r.received), b: Number(r.spent) })) ?? [];

  return (
    <>
      <PageHeader title="Dashboard" subtitle={`Período: ${label}${clientId ? ' · filtrado por cliente' : ''}`} />

      <section aria-label="Ações rápidas" className="mb-6 flex flex-wrap gap-2">
        {seeSales && <><LinkButton href="/crm/novo" className="btn btn-primary">Novo lead</LinkButton><LinkButton href="/propostas/nova">Nova proposta</LinkButton></>}
        {seeFinance && <LinkButton href="/financeiro?tab=novo">Novo lançamento</LinkButton>}
        {['admin', 'comercial', 'designer', 'trafego'].includes(profile.role) && <LinkButton href="/projetos/tarefas/nova">Nova tarefa</LinkButton>}
        {seeSales && <LinkButton href="/prospeccao" icon={Radar}>Prospecção</LinkButton>}
      </section>

      <form className="card mb-8 flex flex-wrap items-end gap-3 !p-4" method="get">
        <label><span className="label">Mês</span><input type="month" name="m" defaultValue={from.slice(0, 7)} className="input w-44" /></label>
        <label><span className="label">De</span><input type="date" name="from" defaultValue={sp.from} className="input w-40" /></label>
        <label><span className="label">Até</span><input type="date" name="to" defaultValue={sp.to} className="input w-40" /></label>
        <label className="min-w-48 flex-1"><span className="label">Cliente</span>
          <select name="client" defaultValue={clientId ?? ''} className="input"><option value="">Todos</option>{clients?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <button className="btn btn-dark">Aplicar</button>
        <LinkButton href="/dashboard" className="btn">Limpar</LinkButton>
      </form>
      <p className="-mt-5 mb-8 text-xs text-muted">Preencha “De/Até” para um período personalizado; caso contrário vale o mês.</p>

      {!!alerts?.length && (
        <section aria-label="Alertas importantes" className="mb-8 space-y-2">
          {alerts.map((a) => (
            <Link key={a.id} href={a.link ?? '/alertas'} className={`card flex items-center justify-between !p-4 text-sm hover:bg-subtle ${a.severity === 'critical' ? 'border-danger/40' : ''}`}>
              <span><span className={`mr-2 font-medium ${a.severity === 'critical' ? 'text-danger' : 'text-warn'}`}>{a.severity === 'critical' ? 'Crítico' : 'Atenção'}</span>{a.title}</span><span className="text-muted">Ver →</span>
            </Link>
          ))}
        </section>
      )}

      {seeFinance && (
        <>
          <section className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Contratado" delta={dlt('contracted')} value={money(n('contracted'))} hint={`${n('contracts_closed')} proposta(s) aceita(s)`} tone="lime" />
            <Stat label="Emitido" delta={dlt('issued')} value={money(n('issued'))} hint="Cobranças emitidas no período" />
            <Stat label="Recebido" delta={dlt('received')} value={money(n('received'))} hint="Liquidado no período" />
            <Stat label="Receita recorrente (MRR)" value={money(n('mrr'))} hint="Serviços mensais ativos hoje" />
            <Stat label="Contas a receber" value={money(n('receivable_open'))} hint={n('receivable_overdue_count') ? `${money(n('receivable_overdue'))} vencidos (${n('receivable_overdue_count')})` : 'Nada vencido'} tone={n('receivable_overdue_count') ? 'danger' : undefined} href="/financeiro?tab=receber" />
            <Stat label="Despesas fixas" value={money(n('expenses_fixed'))} hint="Vencimentos no período" />
            <Stat label="Despesas variáveis" value={money(n('expenses_variable'))} hint={n('expenses_other') ? `+ ${money(n('expenses_other'))} impostos/pró-labore` : undefined} />
            <Stat label="Resultado operacional" value={money(n('received') - n('expenses_paid'))} hint="Recebido − despesas pagas" tone={n('received') - n('expenses_paid') < 0 ? 'danger' : undefined} />
          </section>

          <section className="mb-8 grid gap-4 lg:grid-cols-3">
            <div className="card lg:col-span-2">
              <h2 className="mb-4 text-base font-semibold">Recebido × despesas — últimos 12 meses</h2>
              <RevenueChart data={chart} />
            </div>
            <div className="card">
              <h2 className="mb-1 text-base font-semibold">Meta do mês</h2>
              {g && goal ? (
                <>
                  <div className="mt-4 text-3xl font-semibold">{pct(g.percent)}</div>
                  <div className="mb-3 mt-1 text-xs text-muted">{money(actual)} de {money(goal.revenue_target)} · base: {basis}</div>
                  <ProgressBar value={g.percent} tone={g.atRisk ? 'danger' : 'lime'} />
                  <dl className="mt-5 space-y-2 text-sm">
                    <div className="flex justify-between"><dt className="text-muted">Falta</dt><dd>{money(g.remaining)}</dd></div>
                    <div className="flex justify-between"><dt className="text-muted">Projeção</dt><dd>{money(g.projected)}</dd></div>
                    <div className="flex justify-between"><dt className="text-muted">Previsão de caixa</dt><dd>{money(n('received') + n('pending_in_period') - n('pending_out_period'))}</dd></div>
                  </dl>
                  {g.atRisk && <p className="mt-4 rounded-xl bg-danger/10 p-3 text-xs text-danger">Risco de não atingir a meta no ritmo atual.</p>}
                </>
              ) : (
                <div className="mt-4 text-sm text-muted">{isMonth ? <>Nenhuma meta definida para este mês. <Link href="/metas" className="underline">Definir meta</Link></> : 'A meta é exibida ao filtrar um mês inteiro.'}
                  <div className="mt-4 flex justify-between"><span>Previsão de caixa</span><span className="text-fg">{money(n('received') + n('pending_in_period') - n('pending_out_period'))}</span></div></div>
              )}
            </div>
          </section>
        </>
      )}

      <section aria-label="Operação" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Clientes ativos" value={n('active_clients')} href="/clientes" />
        {seeSales && <>
          <Stat label="Leads recebidos" delta={dlt('leads_received')} value={n('leads_received')} href="/crm" />
          <Stat label="Propostas enviadas" delta={dlt('proposals_sent')} value={n('proposals_sent')} href="/propostas" />
          <Stat label="Negociações abertas" value={n('negotiations_open')} hint={money(n('negotiations_value')) + ' em potencial'} href="/crm" />
          <Stat label="Contratos fechados" delta={dlt('contracts_closed')} value={n('contracts_closed')} hint="Propostas aceitas no período" />
          <Stat label="Pipeline ponderado" value={moneyCompact(n('pipeline_weighted'))} hint="Potencial × probabilidade da etapa" />
        </>}
        <Stat label="Projetos em andamento" value={projectsActive ?? 0} href="/projetos?view=projetos" />
        <Stat label="Tarefas atrasadas" value={tasksLate ?? 0} tone={tasksLate ? 'danger' : undefined} href="/projetos?view=lista" />
      </section>
    </>
  );
}
