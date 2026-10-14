import { notFound } from 'next/navigation';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { createAnonClient } from '@/lib/supabase/anon';
import { delta, GROUP_LABEL, METRICS, monthLabel, type Metrics } from '@/lib/gmn/metrics';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Relatório do Google Meu Negócio', robots: { index: false, follow: false } };

/** Relatório mensal do perfil no Google, enviado ao cliente por link. Dados informados pela equipe; não expõe contatos. */
export default async function RelatorioGoogle({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[a-f0-9]{64}$/.test(token)) notFound();
  const { data } = await createAnonClient().rpc('public_gmn_report', { p_token: token });
  if (!data) notFound();
  const r = data as { client: string; period: string; metrics: Metrics; previous: Metrics | null; highlights: string | null; next_steps: string | null };
  const has = (k: string) => (r.metrics as Record<string, number>)[k] != null;
  return (
    <div className="min-h-screen bg-[#F7F7F4] text-neutral-900" style={{ fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif' }}>
      <header className="bg-black text-white"><div className="mx-auto max-w-4xl px-5 pb-12 pt-5">
        <div className="flex items-center gap-3"><img src="/logo-muvens.svg" alt="" className="h-9 w-auto" /><span className="text-lg font-semibold tracking-[0.2em]">MUVENS</span></div>
        <p className="mt-10 text-xs font-semibold uppercase tracking-widest text-[#DCEA1E]">Relatório do Google Meu Negócio</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight sm:text-5xl">{r.client}</h1><p className="mt-2 text-lg text-white/70 first-letter:uppercase">{monthLabel(r.period)}</p></div></header>
      <main className="mx-auto max-w-4xl space-y-10 px-5 py-10">
        {Object.entries(GROUP_LABEL).map(([g, label]) => { const ms = METRICS.filter((m) => m.group === g && has(m.key)); if (!ms.length) return null; return (
          <section key={g}><h2 className="text-sm font-semibold uppercase tracking-widest text-neutral-500">{label}</h2>
            <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{ms.map((m) => { const cur = (r.metrics as Record<string, number>)[m.key]; const d = delta(m.key, cur, (r.previous as Record<string, number> | null)?.[m.key]); return (
              <div key={m.key} className="rounded-2xl border border-neutral-200 bg-white p-5"><div className="text-xs text-neutral-500">{m.label}</div><div className="mt-2 text-3xl font-semibold">{m.key === 'rating' ? String(cur).replace('.', ',') : cur.toLocaleString('pt-BR')}</div>
                {d && <div className={`mt-2 flex items-center gap-1 text-xs ${d.up ? 'text-emerald-700' : 'text-red-600'}`}>{d.up ? <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2} /> : <ArrowDownRight className="h-3.5 w-3.5" strokeWidth={2} />}{d.text}</div>}</div>); })}</div></section>); })}
        {r.highlights && <section className="rounded-2xl bg-black p-6 text-white"><h2 className="text-sm font-semibold uppercase tracking-widest text-[#DCEA1E]">Destaques do mês</h2><p className="mt-3 whitespace-pre-line text-white/85">{r.highlights}</p></section>}
        {r.next_steps && <section className="rounded-2xl border border-neutral-200 bg-white p-6"><h2 className="text-sm font-semibold uppercase tracking-widest text-neutral-500">Próximos passos</h2><p className="mt-3 whitespace-pre-line">{r.next_steps}</p></section>}
        <p className="text-center text-xs text-neutral-500">Números do painel de desempenho do Google Meu Negócio. Muvens Agência.</p>
      </main>
    </div>
  );
}
