import Link from 'next/link';
import { requireModule } from '@/lib/session';
import { PageHeader, Stat, Tabs, Empty, Field, Pending } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';
import { dateBR, money } from '@/lib/format';
import { TX_STATUS_LABEL, todayBR } from '@/lib/domain';
import { createTransaction, generateMonth, saveRecurring, setTransactionStatus, toggleRecurring, uploadReceipt } from './actions';

export const metadata = { title: 'Financeiro' };
type Tx = { id: string; direction: 'in' | 'out'; description: string; amount: number; status: string; due_date: string; paid_at: string | null; paid_amount: number | null; attachment_path: string | null; client_id: string | null; fin_categories: { name: string; expense_type: string | null } | null; clients: { name: string } | null };

export default async function Financeiro({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; from?: string; to?: string; status?: string }> }) {
  const { supabase } = await requireModule('financeiro');
  const sp = await searchParams;
  const tab = ['lancamentos', 'receber', 'pagar', 'recorrentes', 'novo'].includes(sp.tab ?? '') ? sp.tab! : 'lancamentos';
  const today = todayBR();
  const year = today.slice(0, 4);

  let q = supabase.from('fin_transactions').select('id, direction, description, amount, status, due_date, paid_at, paid_amount, attachment_path, client_id, fin_categories(name, expense_type), clients(name)').order('due_date', { ascending: tab === 'receber' || tab === 'pagar' }).limit(500);
  if (tab === 'receber') q = q.eq('direction', 'in').in('status', ['previsto', 'emitido']);
  if (tab === 'pagar') q = q.eq('direction', 'out').in('status', ['previsto', 'emitido']);
  if (sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from)) q = q.gte('due_date', sp.from);
  if (sp.to && /^\d{4}-\d{2}-\d{2}$/.test(sp.to)) q = q.lte('due_date', sp.to);
  if (sp.status && ['previsto', 'emitido', 'liquidado', 'cancelado'].includes(sp.status)) q = q.eq('status', sp.status);
  if (sp.q) q = q.ilike('description', `%${sp.q.replace(/[%,()]/g, ' ').trim()}%`);

  const [{ data: txRaw }, { data: cats }, { data: clients }, { data: rec }, { data: yearTx }] = await Promise.all([
    q,
    supabase.from('fin_categories').select('id, name, direction').eq('active', true).order('name'),
    supabase.from('clients').select('id, name').order('name'),
    supabase.from('fin_recurring').select('id, description, vendor, direction, amount, day_of_month, is_subscription, active, starts_on, ends_on').order('description'),
    supabase.from('fin_transactions').select('direction, amount, paid_amount, status, client_id, due_date, clients(name)').gte('due_date', `${year}-01-01`).lte('due_date', `${year}-12-31`).neq('status', 'cancelado'),
  ]);
  const tx = (txRaw ?? []) as unknown as Tx[];

  // Resumo do ano
  const yt = yearTx ?? [];
  const sum = (f: (t: (typeof yt)[number]) => boolean, k: 'amount' | 'paid_amount' = 'amount') => yt.filter(f).reduce((a, t) => a + Number(t[k] ?? 0), 0);
  const recebidoAno = sum((t) => t.direction === 'in' && t.status === 'liquidado', 'paid_amount');
  const pagoAno = sum((t) => t.direction === 'out' && t.status === 'liquidado', 'paid_amount');
  const aReceber = sum((t) => t.direction === 'in' && ['previsto', 'emitido'].includes(t.status));
  const aPagar = sum((t) => t.direction === 'out' && ['previsto', 'emitido'].includes(t.status));
  const atrasoTotal = sum((t) => t.direction === 'in' && ['previsto', 'emitido'].includes(t.status) && t.due_date < today);
  const byClient = new Map<string, { name: string; in: number; out: number; late: number }>();
  for (const t of yt) if (t.client_id) {
    const c = Array.isArray(t.clients) ? t.clients[0] : t.clients; const e = byClient.get(t.client_id) ?? { name: c?.name ?? '—', in: 0, out: 0, late: 0 };
    if (t.direction === 'in' && t.status === 'liquidado') e.in += Number(t.paid_amount); if (t.direction === 'out' && t.status === 'liquidado') e.out += Number(t.paid_amount);
    if (t.direction === 'in' && ['previsto', 'emitido'].includes(t.status) && t.due_date < today) e.late += Number(t.amount); byClient.set(t.client_id, e);
  }
  const late = [...byClient.entries()].filter(([, v]) => v.late > 0).sort((a, b) => b[1].late - a[1].late);
  const inadimplentes = new Set(late.map(([id]) => id)).size;

  const nav = (k: string) => `/financeiro?tab=${k}`;
  const Row = ({ t }: { t: Tx }) => {
    const overdue = ['previsto', 'emitido'].includes(t.status) && t.due_date < today;
    return (
      <tr className="border-b border-line align-top last:border-0">
        <td className="td"><div className="font-medium">{t.description}</div><div className="text-xs text-muted">{t.clients?.name ?? 'Sem cliente'} · {t.fin_categories?.name ?? 'Sem categoria'}</div></td>
        <td className="td whitespace-nowrap">{dateBR(t.due_date)}</td>
        <td className={`td whitespace-nowrap font-medium ${t.direction === 'in' ? '' : 'text-muted'}`}>{t.direction === 'out' ? '− ' : ''}{money(t.amount)}</td>
        <td className="td"><span className={`badge ${overdue ? 'border-danger/40 text-danger' : t.status === 'liquidado' ? 'bg-lime/40' : ''}`}>{overdue ? 'Em atraso' : TX_STATUS_LABEL(t.direction, t.status)}</span>{t.paid_at && <div className="mt-1 text-xs text-muted">em {dateBR(t.paid_at)}</div>}</td>
        <td className="td">
          <div className="flex flex-wrap items-center gap-1.5">
            {t.status === 'previsto' && t.direction === 'in' && <form action={setTransactionStatus.bind(null, t.id, 'emitido', tab)}><SubmitButton className="btn btn-sm" pendingText="…">Marcar emitido</SubmitButton></form>}
            {['previsto', 'emitido'].includes(t.status) && (
              <form action={setTransactionStatus.bind(null, t.id, 'liquidado', tab)} className="flex items-center gap-1.5"><input type="date" name="paid_on" defaultValue={today} className="input !w-36 !py-1.5 text-xs" aria-label="Data do pagamento" /><SubmitButton className="btn btn-sm btn-primary" pendingText="…">{t.direction === 'in' ? 'Recebido' : 'Pago'}</SubmitButton></form>)}
            {t.status !== 'cancelado' && t.status !== 'liquidado' && <form action={setTransactionStatus.bind(null, t.id, 'cancelado', tab)}><SubmitButton className="btn btn-sm" pendingText="…" confirm="Cancelar este lançamento?">Cancelar</SubmitButton></form>}
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs">
            {t.attachment_path && <a className="underline" href={`/financeiro/comprovante/${t.id}`} target="_blank" rel="noreferrer">Ver comprovante</a>}
            <form action={uploadReceipt.bind(null, t.id, tab)} className="flex items-center gap-1.5"><input type="file" name="file" accept="application/pdf,image/png,image/jpeg" required className="w-40 text-xs" aria-label="Comprovante" /><SubmitButton className="btn btn-sm" pendingText="…">Anexar</SubmitButton></form>
          </div>
        </td>
      </tr>);
  };

  return (
    <>
      <PageHeader title="Financeiro" subtitle={`Previsto → emitido → efetivamente recebido/pago. Resumo de ${year}.`} actions={<Link href={nav('novo')} className="btn btn-primary">Novo lançamento</Link>} />
      <section className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Recebido no ano" value={money(recebidoAno)} tone="lime" />
        <Stat label="Pago no ano" value={money(pagoAno)} hint={`Resultado: ${money(recebidoAno - pagoAno)}`} />
        <Stat label="A receber" value={money(aReceber)} hint={atrasoTotal ? `${money(atrasoTotal)} em atraso · ${inadimplentes} cliente(s) inadimplente(s)` : 'Nada em atraso'} tone={atrasoTotal ? 'danger' : undefined} />
        <Stat label="A pagar" value={money(aPagar)} />
      </section>

      <Tabs current={tab} items={[{ key: 'lancamentos', label: 'Todos os lançamentos', href: nav('lancamentos') }, { key: 'receber', label: 'Contas a receber', href: nav('receber') }, { key: 'pagar', label: 'Contas a pagar', href: nav('pagar') }, { key: 'recorrentes', label: 'Fixas, assinaturas e recorrências', href: nav('recorrentes') }, { key: 'novo', label: 'Novo lançamento', href: nav('novo') }]} />

      {tab === 'receber' && late.length > 0 && (
        <div className="card mb-6 border-danger/30"><h2 className="mb-3 text-base font-semibold text-danger">Clientes inadimplentes</h2>
          <ul className="space-y-1.5 text-sm">{late.map(([id, v]) => <li key={id} className="flex justify-between"><Link className="hover:underline" href={`/clientes/${id}?tab=financeiro`}>{v.name}</Link><span className="font-medium text-danger">{money(v.late)}</span></li>)}</ul></div>)}

      {(tab === 'lancamentos' || tab === 'receber' || tab === 'pagar') && (
        <>
          <form method="get" className="mb-5 flex flex-wrap items-end gap-2"><input type="hidden" name="tab" value={tab} />
            <input name="q" defaultValue={sp.q} placeholder="Buscar descrição" className="input w-56" aria-label="Buscar" />
            <input type="date" name="from" defaultValue={sp.from} className="input w-40" aria-label="Vencimento de" /><input type="date" name="to" defaultValue={sp.to} className="input w-40" aria-label="Vencimento até" />
            {tab === 'lancamentos' && <select name="status" defaultValue={sp.status ?? ''} className="input w-40" aria-label="Status"><option value="">Todos</option><option value="previsto">Previsto</option><option value="emitido">Emitido</option><option value="liquidado">Liquidado</option><option value="cancelado">Cancelado</option></select>}
            <button className="btn btn-dark">Filtrar</button></form>
          {!tx.length ? <Empty title="Nenhum lançamento" text="Gere recebíveis ao ativar uma proposta aceita ou cadastre lançamentos manualmente." action={<Link href={nav('novo')} className="btn btn-primary">Novo lançamento</Link>} /> : (
            <div className="card overflow-x-auto !p-0"><table className="w-full"><thead><tr className="border-b border-line"><th className="th">Descrição</th><th className="th">Vencimento</th><th className="th">Valor</th><th className="th">Situação</th><th className="th">Ações e comprovante</th></tr></thead><tbody>{tx.map((t) => <Row key={t.id} t={t} />)}</tbody></table></div>)}
          {tab === 'lancamentos' && byClient.size > 0 && (
            <div className="card mt-8"><h2 className="mb-1 text-base font-semibold">Resultado por cliente — {year}</h2><p className="mb-4 text-xs text-muted">Recebido − custos diretos lançados no cliente. Horas de equipe entram na Fase 2 <Pending>Fase 2</Pending>.</p>
              <table className="w-full text-sm"><tbody>{[...byClient.values()].sort((a, b) => b.in - b.out - (a.in - a.out)).map((v) => <tr key={v.name} className="border-b border-line last:border-0"><td className="py-2">{v.name}</td><td className="py-2 text-right text-muted">{money(v.in)} − {money(v.out)}</td><td className="py-2 text-right font-medium">{money(v.in - v.out)}</td></tr>)}</tbody></table></div>)}
        </>)}

      {tab === 'recorrentes' && (
        <div className="grid gap-6 xl:grid-cols-3">
          <div className="space-y-4 xl:col-span-2">
            <div className="flex items-center justify-between"><p className="text-sm text-muted">Despesas fixas, ferramentas (Adobe, Google Workspace, ChatGPT...) e receitas recorrentes. O worker gera o mês sozinho; você também pode gerar agora.</p>
              <form action={generateMonth}><SubmitButton className="btn btn-sm" pendingText="…">Gerar lançamentos do mês</SubmitButton></form></div>
            {!rec?.length ? <Empty title="Nenhuma recorrência" text="Cadastre aluguel, assinaturas de software, pró-labore etc." /> : (
              <div className="card overflow-x-auto !p-0"><table className="w-full"><tbody>{rec.map((r) => (
                <tr key={r.id} className={`border-b border-line last:border-0 ${r.active ? '' : 'opacity-50'}`}><td className="td"><div className="font-medium">{r.description}{r.vendor ? ` — ${r.vendor}` : ''}</div><div className="text-xs text-muted">{r.direction === 'in' ? 'Receita' : r.is_subscription ? 'Assinatura' : 'Despesa'} · todo dia {r.day_of_month} · desde {dateBR(r.starts_on)}</div></td>
                  <td className="td">{money(r.amount)}</td><td className="td"><form action={toggleRecurring.bind(null, r.id, !r.active)}><SubmitButton className="btn btn-sm" pendingText="…">{r.active ? 'Pausar' : 'Reativar'}</SubmitButton></form></td></tr>))}</tbody></table></div>)}
          </div>
          <form action={saveRecurring} className="card space-y-4"><h2 className="text-base font-semibold">Nova recorrência</h2>
            <Field label="Descrição"><input name="description" required className="input" /></Field><Field label="Fornecedor / ferramenta"><input name="vendor" className="input" placeholder="Adobe, Google Workspace…" /></Field>
            <div className="grid grid-cols-2 gap-3"><Field label="Tipo"><select name="direction" className="input"><option value="out">Saída</option><option value="in">Entrada</option></select></Field><Field label="Valor (R$)"><input name="amount" required inputMode="decimal" className="input" /></Field></div>
            <div className="grid grid-cols-2 gap-3"><Field label="Dia do mês"><input name="day_of_month" type="number" min={1} max={31} defaultValue={5} className="input" /></Field><Field label="Início"><input name="starts_on" type="date" required defaultValue={today} className="input" /></Field></div>
            <Field label="Fim (opcional)"><input name="ends_on" type="date" className="input" /></Field>
            <Field label="Categoria"><select name="category_id" className="input"><option value="">—</option>{cats?.map((c) => <option key={c.id} value={c.id}>{c.direction === 'in' ? 'Entrada' : 'Saída'} · {c.name}</option>)}</select></Field>
            <Field label="Cliente (opcional)"><select name="client_id" className="input"><option value="">—</option>{clients?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_subscription" /> É uma assinatura de ferramenta</label>
            <SubmitButton>Salvar recorrência</SubmitButton></form>
        </div>)}

      {tab === 'novo' && (
        <form action={createTransaction} className="card max-w-3xl space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Tipo"><select name="direction" className="input"><option value="in">Entrada (a receber)</option><option value="out">Saída (a pagar)</option></select></Field>
            <Field label="Situação inicial"><select name="status" className="input"><option value="previsto">Previsto</option><option value="emitido">Emitido</option><option value="liquidado">Já recebido/pago</option></select></Field>
            <Field label="Descrição"><input name="description" required className="input" /></Field><Field label="Valor total (R$)"><input name="amount" required inputMode="decimal" className="input" /></Field>
            <Field label="Vencimento (1ª parcela)"><input name="due_date" type="date" required defaultValue={today} className="input" /></Field><Field label="Parcelas" hint="Os centavos restantes vão para a última parcela."><input name="installments" type="number" min={1} max={60} defaultValue={1} className="input" /></Field>
            <Field label="Categoria"><select name="category_id" className="input"><option value="">—</option>{cats?.map((c) => <option key={c.id} value={c.id}>{c.direction === 'in' ? 'Entrada' : 'Saída'} · {c.name}</option>)}</select></Field>
            <Field label="Cliente"><select name="client_id" className="input"><option value="">—</option>{clients?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          </div>
          <Field label="Observações"><textarea name="notes" rows={2} className="input" /></Field><SubmitButton>Salvar lançamento</SubmitButton>
        </form>)}
    </>
  );
}
