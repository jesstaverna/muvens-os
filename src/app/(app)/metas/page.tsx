import { requireModule, flash } from '@/lib/session';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { PageHeader, Stat, Field, Empty } from '@/components/ui';
import { ProgressBar } from '@/components/Charts';
import { SubmitButton } from '@/components/SubmitButton';
import { money, pct } from '@/lib/format';
import { elapsedFraction, goalProgress, monthRange, todayBR, type Basis } from '@/lib/domain';

export const metadata = { title: 'Metas e Resultados' };
const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

const schema = z.object({
  period_type: z.enum(['mensal', 'anual']), period: z.string().regex(/^\d{4}(-\d{2})?$/, 'Período inválido'), basis: z.enum(['contratado', 'emitido', 'recebido']),
  revenue_target: z.preprocess((v) => Number(String(v ?? '').replace(/\./g, '').replace(',', '.')), z.number().min(0, 'Meta inválida')),
  contracts_target: z.preprocess((v) => (v === '' || v == null ? null : Number(v)), z.number().int().min(0).nullable()),
  mrr_target: z.preprocess((v) => (v === '' || v == null ? null : Number(String(v).replace(/\./g, '').replace(',', '.'))), z.number().min(0).nullable()),
});

async function saveGoal(fd: FormData) {
  'use server';
  const { supabase } = await requireModule('metas');
  const r = schema.safeParse(Object.fromEntries(fd));
  if (!r.success) flash('/metas', 'err', r.error.issues[0].message);
  const { period, ...rest } = r.data;
  const period_start = rest.period_type === 'anual' ? `${period.slice(0, 4)}-01-01` : `${period.length === 7 ? period : period + '-01'}-01`;
  const { error } = await supabase.from('goals').upsert({ ...rest, period_start }, { onConflict: 'period_type,period_start' });
  if (error) flash('/metas', 'err', error.code === '42501' ? 'Apenas administradores definem metas.' : 'Não foi possível salvar a meta.');
  revalidatePath('/metas');
  flash('/metas', 'ok', 'Meta salva.');
}

type M = Record<string, number>;
const pick = (m: M, basis: Basis) => Number(basis === 'contratado' ? m.contracted : basis === 'emitido' ? m.issued : m.received);

export default async function Metas() {
  const { supabase, profile } = await requireModule('metas');
  const today = todayBR();
  const [y, mo] = today.split('-').map(Number);
  const cur = monthRange(y, mo), year = { from: `${y}-01-01`, to: `${y}-12-31` };

  const [{ data: goals }, { data: mCur }, { data: mYear }, { data: conv }] = await Promise.all([
    supabase.from('goals').select('*').gte('period_start', `${y}-01-01`).lte('period_start', `${y}-12-31`),
    supabase.rpc('dashboard_metrics', { p_from: cur.from, p_to: cur.to, p_client: null }),
    supabase.rpc('dashboard_metrics', { p_from: year.from, p_to: year.to, p_client: null }),
    supabase.rpc('crm_conversion', { p_from: year.from, p_to: year.to }),
  ]);
  const gMonth = goals?.find((g) => g.period_type === 'mensal' && g.period_start === cur.from);
  const gYear = goals?.find((g) => g.period_type === 'anual' && g.period_start === year.from);
  const c = (mCur ?? {}) as M, a = (mYear ?? {}) as M, cv = (conv ?? {}) as M;
  const seeFinance = profile.role === 'admin' || profile.role === 'financeiro';

  const monthProg = gMonth && goalProgress({ target: Number(gMonth.revenue_target), basis: gMonth.basis as Basis, actual: pick(c, gMonth.basis as Basis), pendingReceivables: Number(c.pending_in_period), weightedPipeline: Number(c.pipeline_weighted), elapsedFraction: elapsedFraction(cur.from, cur.to, today) });
  const yearProg = gYear && goalProgress({ target: Number(gYear.revenue_target), basis: gYear.basis as Basis, actual: pick(a, gYear.basis as Basis), pendingReceivables: Number(a.pending_in_period), weightedPipeline: Number(a.pipeline_weighted), elapsedFraction: elapsedFraction(year.from, year.to, today) });
  const ticket = a.contracts_closed ? Number(a.contracted) / Number(a.contracts_closed) : 0;

  const Card = ({ title, goal, prog, m }: { title: string; goal?: (typeof goals extends (infer U)[] | null ? U : never); prog: ReturnType<typeof goalProgress> | undefined | null; m: M }) => (
    <section className="card">
      <h2 className="text-base font-semibold">{title}</h2>
      {!goal || !prog ? <p className="mt-4 text-sm text-muted">Nenhuma meta definida. {profile.role === 'admin' ? 'Use o formulário ao lado.' : 'Peça a um administrador.'}</p> : (
        <>
          <div className="mt-4 flex items-end justify-between"><span className="text-4xl font-semibold">{pct(prog.percent)}</span><span className="text-sm text-muted">{money(pick(m, goal.basis as Basis))} / {money(goal.revenue_target)}</span></div>
          <div className="my-3"><ProgressBar value={prog.percent} tone={prog.atRisk ? 'danger' : 'lime'} /></div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <dt className="text-muted">Base da meta</dt><dd className="text-right">{goal.basis}</dd>
            <dt className="text-muted">Falta atingir</dt><dd className="text-right">{money(prog.remaining)}</dd>
            <dt className="text-muted">Projeção</dt><dd className="text-right">{money(prog.projected)}</dd>
            <dt className="text-muted">Ritmo esperado hoje</dt><dd className="text-right">{money(prog.expectedNow)}</dd>
            {goal.contracts_target != null && <><dt className="text-muted">Contratos</dt><dd className="text-right">{m.contracts_closed} / {goal.contracts_target}</dd></>}
            {goal.mrr_target != null && <><dt className="text-muted">Receita recorrente</dt><dd className="text-right">{money(m.mrr)} / {money(goal.mrr_target)}</dd></>}
          </dl>
          {prog.atRisk && <p className="mt-4 rounded-xl bg-danger/10 p-3 text-sm text-danger">Risco de não atingir a meta: realizado abaixo de 80% do ritmo esperado e projeção inferior à meta.</p>}
        </>)}
    </section>);

  return (
    <>
      <PageHeader title="Metas e Resultados" subtitle="Projeção = realizado + recebíveis do período (bases emitido/recebido) ou + pipeline ponderado (base contratado)." />
      <section className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Contratos fechados (ano)" value={a.contracts_closed ?? 0} />
        <Stat label="Ticket médio (ano)" value={ticket ? money(ticket) : '—'} hint="Contratado ÷ propostas aceitas" />
        <Stat label="Taxa de conversão (ano)" value={cv.total ? pct((cv.won / cv.total) * 100) : '—'} hint={`${cv.won ?? 0} de ${cv.total ?? 0} leads`} />
        {seeFinance ? <Stat label="Receita recorrente" value={money(c.mrr)} /> : <Stat label="Pipeline ponderado" value={money(c.pipeline_weighted)} />}
      </section>
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card title={`Meta de ${MONTHS[mo - 1]}/${y}`} goal={gMonth} prog={monthProg} m={c} />
          <Card title={`Meta anual ${y}`} goal={gYear} prog={yearProg} m={a} />
          <section className="card"><h2 className="mb-4 text-base font-semibold">Metas cadastradas em {y}</h2>
            {!goals?.length ? <Empty title="Sem metas" /> : <table className="w-full text-sm"><tbody>{[...goals].sort((x, z) => x.period_start.localeCompare(z.period_start)).map((g) => <tr key={g.id} className="border-b border-line last:border-0"><td className="py-2">{g.period_type === 'anual' ? `Ano ${g.period_start.slice(0, 4)}` : `${MONTHS[Number(g.period_start.slice(5, 7)) - 1]}/${g.period_start.slice(0, 4)}`}</td><td className="py-2 text-muted">{g.basis}</td><td className="py-2 text-right">{money(g.revenue_target)}</td></tr>)}</tbody></table>}</section>
        </div>
        {profile.role === 'admin' && (
          <form action={saveGoal} className="card h-fit space-y-4"><h2 className="text-base font-semibold">Definir / alterar meta</h2>
            <Field label="Tipo"><select name="period_type" className="input"><option value="mensal">Mensal</option><option value="anual">Anual</option></select></Field>
            <Field label="Período" hint="Mensal: escolha o mês. Anual: vale o ano do mês escolhido."><input type="month" name="period" required defaultValue={`${y}-${String(mo).padStart(2, '0')}`} className="input" /></Field>
            <Field label="Base de medição"><select name="basis" defaultValue="recebido" className="input"><option value="recebido">Recebido (caixa)</option><option value="emitido">Emitido (faturado)</option><option value="contratado">Contratado (vendido)</option></select></Field>
            <Field label="Meta de faturamento (R$)"><input name="revenue_target" required inputMode="decimal" className="input" /></Field>
            <Field label="Meta de contratos (opcional)"><input name="contracts_target" type="number" min={0} className="input" /></Field>
            <Field label="Meta de receita recorrente (opcional)"><input name="mrr_target" inputMode="decimal" className="input" /></Field>
            <SubmitButton>Salvar meta</SubmitButton></form>)}
      </div>
    </>
  );
}
