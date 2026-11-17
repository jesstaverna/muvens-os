import { requireModule } from '@/lib/session';
import { PageHeader, Stat, Empty } from '@/components/ui';
import { LinkButton } from '@/components/LinkButton';
import { ProgressBar, RevenueChart } from '@/components/Charts';
import { money, pct } from '@/lib/format';
import { monthRange, todayBR, type Basis } from '@/lib/domain';

export const metadata = { title: 'Visão Financeira' };

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
const SHORT_MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export default async function ResumoFinanceiro({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  // Mesma autorização de /financeiro: exclusivamente administrador e financeiro.
  const { supabase } = await requireModule('financeiro');
  const { m: selectedMonth } = await searchParams;
  const today = todayBR();
  const [currentYear, currentMonth] = today.split('-').map(Number);
  const selection = /^(20\d{2})-(0[1-9]|1[0-2])$/.exec(selectedMonth ?? '');
  const year = selection ? Number(selection[1]) : currentYear;
  const month = selection ? Number(selection[2]) : currentMonth;
  const { from, to } = monthRange(year, month);
  const monthValue = from.slice(0, 7);

  const [
    { data: metrics, error: metricsError },
    { data: goal, error: goalError },
    { data: series, error: seriesError },
  ] = await Promise.all([
    supabase.rpc('dashboard_metrics', { p_from: from, p_to: to, p_client: null }),
    supabase.from('goals')
      .select('basis, revenue_target, contracts_target, mrr_target')
      .eq('period_type', 'mensal')
      .eq('period_start', from)
      .maybeSingle(),
    supabase.rpc('finance_monthly_series', { p_months: 12 }),
  ]);

  if (metricsError || !metrics) {
    return <Empty title="Não foi possível carregar a visão financeira" text={metricsError?.message ?? 'Confira a conexão com o Supabase e tente novamente.'} />;
  }

  const m = metrics as Record<string, number>;
  const n = (key: string) => Number(m[key] ?? 0);
  const received = n('received');
  const paid = n('expenses_paid');
  const cashMovement = received - paid;
  const expensesDue = n('expenses_fixed') + n('expenses_variable') + n('expenses_other');
  const basis = (goal?.basis ?? 'recebido') as Basis;
  const actual = basis === 'contratado' ? n('contracted') : basis === 'emitido' ? n('issued') : received;
  const target = Number(goal?.revenue_target ?? 0);
  const progress = target > 0 ? (actual / target) * 100 : 0;
  const remaining = Math.max(target - actual, 0);
  const basisLabel = basis === 'contratado' ? 'propostas aceitas' : basis === 'emitido' ? 'cobranças emitidas' : 'recebimentos';

  const chart = (series as { month: string; received: number; spent: number }[] | null ?? [])
    .map((r) => {
      const ym = String(r.month).slice(0, 7);
      const mm = Number(ym.slice(5, 7));
      return { label: SHORT_MONTHS[mm - 1] + '/' + ym.slice(2, 4), a: Number(r.received), b: Number(r.spent) };
    });

  return (
    <>
      <PageHeader
        title="Visão Financeira"
        subtitle={MONTHS[month - 1] + ' de ' + year + ' · realizado e compromissos financeiros'}
        actions={<>
          <LinkButton href="/financeiro?tab=lancamentos">Todos os lançamentos</LinkButton>
          <LinkButton href="/financeiro?tab=novo" className="btn btn-primary">+ Novo lançamento</LinkButton>
        </>}
      />

      <form method="get" className="card mb-6 flex flex-wrap items-end gap-3 !p-4">
        <label>
          <span className="label">Mês de referência</span>
          <input name="m" type="month" className="input w-48" defaultValue={monthValue} aria-label="Mês de referência do financeiro" />
        </label>
        <button type="submit" className="btn btn-dark">Visualizar</button>
        <LinkButton href="/financeiro/resumo" className="btn">Mês atual</LinkButton>
      </form>

      <section className="mb-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Receitas e pagamentos no mês">
        <Stat label="Propostas aceitas" value={money(n('contracted'))} hint="Valor integral das propostas aceitas no mês, inclusive vigências futuras." />
        <Stat label="Cobranças emitidas" value={money(n('issued'))} hint="Cobranças emitidas no período. Não equivale a dinheiro recebido." />
        <Stat label="Entradas recebidas" value={money(received)} hint="Pagamentos efetivamente recebidos no período." tone="lime" />
        <Stat label="Saídas pagas" value={money(paid)} hint="Pagamentos efetivamente efetuados no período." />
      </section>

      <section className="mb-7 grid gap-4 lg:grid-cols-2">
        <div className="card">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">Movimentação líquida de caixa no mês</p>
          <p className={'mt-3 text-3xl font-semibold ' + (cashMovement < 0 ? 'text-danger' : '')}>{money(cashMovement)}</p>
          <p className="mt-2 text-sm text-muted">Entradas recebidas − saídas pagas. Não é o saldo bancário nem o lucro da agência.</p>
          <div className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-4 text-sm">
            <div><p className="text-xs text-muted">Entrou</p><p className="mt-1 font-semibold">{money(received)}</p></div>
            <div><p className="text-xs text-muted">Saiu</p><p className="mt-1 font-semibold">{money(paid)}</p></div>
          </div>
        </div>
        <div className="card">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">Despesas com vencimento no mês</p>
          <p className="mt-3 text-3xl font-semibold">{money(expensesDue)}</p>
          <p className="mt-2 text-sm text-muted">Valores não cancelados por data de vencimento; incluem valores já pagos.</p>
          <div className="mt-5 grid grid-cols-3 gap-2 border-t border-line pt-4 text-sm">
            <div><p className="text-xs text-muted">Fixas</p><p className="mt-1 font-semibold">{money(n('expenses_fixed'))}</p></div>
            <div><p className="text-xs text-muted">Variáveis</p><p className="mt-1 font-semibold">{money(n('expenses_variable'))}</p></div>
            <div><p className="text-xs text-muted">Outras</p><p className="mt-1 font-semibold">{money(n('expenses_other'))}</p></div>
          </div>
          <p className="mt-4 text-xs text-muted">Lucro gerencial e DRE exigem classificação de custos, competência e remuneração; serão implantados separadamente.</p>
        </div>
      </section>

      <section className="mb-7 grid gap-4 lg:grid-cols-2">
        <div className="card">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h2 className="text-base font-semibold">Meta de receita do mês</h2>
            <LinkButton href="/metas" className="btn btn-sm">Gerenciar metas</LinkButton>
          </div>
          {goalError ? <p className="mt-4 text-sm text-danger">Não foi possível carregar a meta mensal.</p> : target > 0 ? (
            <>
              <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-3xl font-semibold">{pct(progress)}</span>
                <span className="text-sm text-muted">{money(actual)} de {money(target)}</span>
              </div>
              <div className="mt-3"><ProgressBar value={progress} /></div>
              <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
                <div><dt className="text-xs text-muted">Base da meta</dt><dd className="mt-1 font-medium">{basisLabel}</dd></div>
                <div><dt className="text-xs text-muted">Falta atingir</dt><dd className="mt-1 font-medium">{money(remaining)}</dd></div>
              </dl>
            </>
          ) : (
            <p className="mt-4 text-sm text-muted">Nenhuma meta mensal com valor positivo foi cadastrada para este período. Defina a meta em Metas e Resultados.</p>
          )}
        </div>
        <div className="card">
          <h2 className="text-base font-semibold">Contas e compromissos</h2>
          <div className="mt-4 space-y-4">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span>A receber com vencimento no mês</span><strong>{money(n('pending_in_period'))}</strong>
            </div>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span>A pagar com vencimento no mês</span><strong>{money(n('pending_out_period'))}</strong>
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-line pt-3 text-sm">
              <span>A receber em aberto (todos os períodos)</span><strong>{money(n('receivable_open'))}</strong>
            </div>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className={n('receivable_overdue_count') > 0 ? 'text-danger' : ''}>Recebimentos vencidos</span>
              <strong className={n('receivable_overdue_count') > 0 ? 'text-danger' : ''}>{money(n('receivable_overdue'))}</strong>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <LinkButton href="/financeiro?tab=receber" className="btn btn-sm">Contas a receber</LinkButton>
            <LinkButton href="/financeiro?tab=pagar" className="btn btn-sm">Contas a pagar</LinkButton>
            <LinkButton href="/financeiro?tab=recorrentes" className="btn btn-sm">Recorrências</LinkButton>
          </div>
        </div>
      </section>

      <section className="mb-7 grid gap-4 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <h2 className="text-base font-semibold">Recebimentos e pagamentos — últimos 12 meses até hoje</h2>
          <p className="mt-1 text-xs text-muted">Histórico de movimentação efetiva, independente do mês selecionado acima.</p>
          {seriesError ? <p className="mt-5 text-sm text-danger">Não foi possível carregar o histórico financeiro.</p> : <div className="mt-5"><RevenueChart data={chart} /></div>}
        </div>
        <div className="card">
          <h2 className="text-base font-semibold">Receita recorrente ativa</h2>
          <p className="mt-4 text-3xl font-semibold">{money(n('mrr'))}</p>
          <p className="mt-2 text-sm text-muted">MRR dos serviços ativos hoje. Este indicador não representa o faturamento histórico do mês selecionado.</p>
          <div className="mt-5"><LinkButton href="/clientes" className="btn btn-sm">Ver clientes</LinkButton></div>
        </div>
      </section>
    </>
  );
}
