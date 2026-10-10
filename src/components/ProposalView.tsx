import { dateBR, money } from '@/lib/format';
import { normalizeContent } from '@/lib/proposal-templates';

export interface ProposalViewData {
  number: number; title: string; client_name: string; content: unknown; payment_terms: string; installments: number; contract_months: number;
  valid_until: string | null; discount_value: number; subtotal_one_time: number; subtotal_monthly: number; total_value: number;
  items: { description: string; details?: string | null; billing: 'pontual' | 'mensal'; quantity: number; unit_price: number; line_total: number }[];
}

const List = ({ items }: { items: string[] }) => (
  <ul className="space-y-2.5">{items.filter(Boolean).map((t, i) => <li key={i} className="flex gap-3"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-lime" />{t}</li>)}</ul>
);
const Section = ({ n, title, children }: { n: string; title: string; children: React.ReactNode }) => (
  <section className="border-t border-white/10 py-12 sm:py-16"><div className="mb-6 flex items-baseline gap-4"><span className="text-sm text-lime">{n}</span><h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2></div><div className="max-w-3xl whitespace-pre-line text-base leading-relaxed text-white/75">{children}</div></section>
);

/** Visual da proposta (landing page exclusiva). Mesmo componente para preview interno e link público. */
export function ProposalView({ p }: { p: ProposalViewData }) {
  const c = normalizeContent(p.content);
  const oneTime = p.items.filter((i) => i.billing === 'pontual'), monthly = p.items.filter((i) => i.billing === 'mensal');
  let n = 0; const num = () => String(++n).padStart(2, '0');
  return (
    <article className="bg-black text-white" style={{ colorScheme: 'dark' }}>
      <div className="mx-auto max-w-5xl px-5 sm:px-8">
        <header className="flex min-h-[70vh] flex-col justify-between py-10 print:min-h-0">
          <div className="flex items-center justify-between text-sm"><span className="flex items-center gap-2.5"><span className="grid h-8 w-8 place-items-center rounded-lg bg-lime font-bold text-black">M</span><b className="tracking-wide">MUVENS AGÊNCIA</b></span><span className="text-white/50">Proposta #{p.number}</span></div>
          <div className="py-16"><p className="mb-5 text-sm uppercase tracking-[0.2em] text-lime">Proposta comercial</p>
            <h1 className="max-w-4xl text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">{p.title}</h1>
            <p className="mt-6 text-lg text-white/60">Preparada para <span className="text-white">{p.client_name}</span></p></div>
          <div className="flex flex-wrap gap-x-10 gap-y-2 text-sm text-white/50">{p.valid_until && <span>Válida até {dateBR(p.valid_until)}</span>}<span className="h-1.5 w-20 self-center rounded-full bg-lime" /></div>
        </header>

        <Section n={num()} title="Sobre a Muvens">{c.intro || 'A Muvens é uma agência de marketing, design, branding, desenvolvimento web e tráfego pago, focada em transformar presença digital em resultado para o seu negócio.'}</Section>
        {c.diagnostico && <Section n={num()} title="Contexto e diagnóstico">{c.diagnostico}</Section>}
        {c.objetivos.some(Boolean) && <Section n={num()} title="Objetivos"><List items={c.objetivos} /></Section>}
        {c.solucao && <Section n={num()} title="A solução">{c.solucao}</Section>}
        {p.items.length > 0 && <Section n={num()} title="Serviços incluídos"><ul className="space-y-4">{p.items.map((i, k) => <li key={k}><div className="font-medium text-white">{i.description}</div>{i.details && <div className="text-sm text-white/55">{i.details}</div>}</li>)}</ul></Section>}
        {c.escopo.some(Boolean) && <Section n={num()} title="Escopo detalhado"><List items={c.escopo} /></Section>}
        {c.entregaveis.some(Boolean) && <Section n={num()} title="Entregáveis"><List items={c.entregaveis} /></Section>}
        {c.etapas.some((e) => e.title) && <Section n={num()} title="Etapas de execução"><ol className="space-y-5">{c.etapas.filter((e) => e.title).map((e, i) => <li key={i} className="flex gap-4"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-lime text-xs text-lime">{i + 1}</span><div><div className="font-medium text-white">{e.title}</div>{e.description && <div className="text-sm text-white/55">{e.description}</div>}</div></li>)}</ol></Section>}
        {c.cronograma && <Section n={num()} title="Cronograma">{c.cronograma}</Section>}

        <section className="border-t border-white/10 py-12 sm:py-16">
          <div className="mb-8 flex items-baseline gap-4"><span className="text-sm text-lime">{num()}</span><h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Investimento</h2></div>
          <div className="grid gap-4 sm:grid-cols-2">
            {oneTime.length > 0 && <div className="rounded-2xl border border-white/10 p-6"><div className="text-xs uppercase tracking-wider text-white/50">Pagamento pontual</div><div className="mt-2 text-3xl font-semibold">{money(p.subtotal_one_time)}</div>
              <ul className="mt-4 space-y-1 text-sm text-white/60">{oneTime.map((i, k) => <li key={k} className="flex justify-between gap-4"><span>{i.quantity !== 1 ? `${i.quantity}× ` : ''}{i.description}</span><span>{money(i.line_total)}</span></li>)}</ul></div>}
            {monthly.length > 0 && <div className="rounded-2xl border border-white/10 p-6"><div className="text-xs uppercase tracking-wider text-white/50">Mensalidade · {p.contract_months} meses</div><div className="mt-2 text-3xl font-semibold">{money(p.subtotal_monthly)}<span className="text-base font-normal text-white/50"> /mês</span></div>
              <ul className="mt-4 space-y-1 text-sm text-white/60">{monthly.map((i, k) => <li key={k} className="flex justify-between gap-4"><span>{i.description}</span><span>{money(i.line_total)}</span></li>)}</ul></div>}
          </div>
          {p.discount_value > 0 && <p className="mt-5 text-sm text-lime">Desconto aplicado: − {money(p.discount_value)}</p>}
          <div className="mt-6 rounded-2xl bg-lime p-6 text-black"><div className="text-xs uppercase tracking-wider text-black/60">Valor total do contrato</div><div className="mt-1 text-4xl font-semibold">{money(p.total_value)}</div></div>
          <div className="mt-8 grid gap-6 text-sm text-white/70 sm:grid-cols-2">
            <div><div className="mb-1 text-xs uppercase tracking-wider text-white/40">Condições de pagamento</div><p className="whitespace-pre-line">{p.payment_terms || (p.installments > 1 ? `Parte pontual em ${p.installments} parcelas.` : 'Conforme combinado.')}</p></div>
            <div><div className="mb-1 text-xs uppercase tracking-wider text-white/40">Validade</div><p>{p.valid_until ? `Esta proposta é válida até ${dateBR(p.valid_until)}.` : 'Sem prazo de validade definido.'}</p></div>
          </div>
        </section>
      </div>
    </article>
  );
}
