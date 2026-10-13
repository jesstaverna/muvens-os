import { notFound } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { AREAS, CONTATO, DECISOR, INVEST, PRAZO } from '@/lib/leads/qualify';
import { enviarQualificacao } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Conte o que você precisa', robots: { index: false, follow: false } };

const radio = 'flex cursor-pointer items-center gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm has-[:checked]:border-black has-[:checked]:bg-[#DCEA1E]/30';

/** Formulário público de qualificação do lead (link enviado por e-mail/WhatsApp). Não expõe dados do CRM. */
export default async function Qualificar({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { token } = await params; const sp = await searchParams;
  if (!/^[a-f0-9]{64}$/.test(token)) notFound();
  const db = createAdminClient();
  const { data: q } = await db.from('lead_qualifications').select('status, leads(name)').eq('token', token).maybeSingle();
  if (!q) notFound();
  const lead = Array.isArray(q.leads) ? q.leads[0] : q.leads; const first = String(lead?.name ?? '').split(' ')[0];
  const done = q.status === 'respondido' || sp.ok === '1';
  return (
    <div className="min-h-screen bg-[#F7F7F4] text-neutral-900" style={{ fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif' }}>
      <header className="bg-black text-white"><div className="mx-auto flex max-w-2xl items-center gap-3 px-5 py-5"><img src="/logo-muvens.svg" alt="" className="h-9 w-auto" /><span className="text-lg font-semibold tracking-[0.2em]">MUVENS</span></div></header>
      <main className="mx-auto max-w-2xl px-5 py-10">
        {done ? (
          <div className="rounded-3xl bg-white p-8 text-center shadow-sm"><CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" strokeWidth={1.6} /><h1 className="mt-4 text-2xl font-semibold">Obrigado{first ? `, ${first}` : ''}!</h1>
            <p className="mt-2 text-neutral-600">Recebemos as suas respostas. Vamos analisar com atenção e retornar com o melhor caminho para o seu momento, e uma proposta sob medida se fizer sentido.</p></div>
        ) : (
          <>
            <h1 className="text-3xl font-semibold tracking-tight">Vamos entender o seu momento{first ? `, ${first}` : ''}</h1>
            <p className="mt-2 text-neutral-600">São poucas perguntas (cerca de 2 minutos). Com elas, indicamos o melhor caminho, sem compromisso.</p>
            {sp.err && <p role="alert" className="mt-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">{sp.err}</p>}
            <form action={enviarQualificacao.bind(null, token)} className="mt-8 space-y-7">
              <label className="block"><span className="font-semibold">1. Qual é a sua maior dificuldade hoje no marketing e nas vendas?</span><textarea name="dificuldade" required minLength={5} maxLength={1200} rows={3} className="mt-2 w-full rounded-xl border border-neutral-300 bg-white p-3 text-sm" placeholder="Ex.: não consigo atrair clientes novos, meu Instagram não gera contatos…" /></label>
              <label className="block"><span className="font-semibold">2. O que você mais precisa resolver nos próximos meses?</span><textarea name="precisa" required minLength={5} maxLength={1200} rows={3} className="mt-2 w-full rounded-xl border border-neutral-300 bg-white p-3 text-sm" placeholder="Ex.: ter um site profissional, ganhar autoridade, vender mais online…" /></label>
              <fieldset><legend className="font-semibold">3. Em quais áreas você gostaria de ajuda? <span className="font-normal text-neutral-500">(marque quantas quiser)</span></legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{AREAS.map((a) => <label key={a.key} className={radio}><input type="checkbox" name="areas" value={a.key} className="h-4 w-4 accent-black" />{a.label}</label>)}</div></fieldset>
              <fieldset><legend className="font-semibold">4. Quanto você investe hoje em marketing?</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{INVEST.map((o) => <label key={o.v} className={radio}><input type="radio" name="invest" value={o.v} required className="h-4 w-4 accent-black" />{o.l}</label>)}</div></fieldset>
              <fieldset><legend className="font-semibold">5. Quando você quer começar?</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{PRAZO.map((o) => <label key={o.v} className={radio}><input type="radio" name="prazo" value={o.v} required className="h-4 w-4 accent-black" />{o.l}</label>)}</div></fieldset>
              <fieldset><legend className="font-semibold">Você decide a contratação?</legend><div className="mt-2 grid gap-2">{DECISOR.map((o) => <label key={o.v} className={radio}><input type="radio" name="decisor" value={o.v} required className="h-4 w-4 accent-black" />{o.l}</label>)}</div></fieldset>
              <fieldset><legend className="font-semibold">Como prefere ser contatado?</legend><div className="mt-2 flex flex-wrap gap-2">{CONTATO.map((o) => <label key={o.v} className={radio}><input type="radio" name="contato" value={o.v} className="h-4 w-4 accent-black" />{o.l}</label>)}</div></fieldset>
              <button className="w-full rounded-full bg-black px-6 py-4 text-sm font-semibold text-[#DCEA1E] hover:opacity-90">Enviar respostas</button>
              <p className="text-center text-xs text-neutral-500">Usamos estas informações apenas para atender o seu pedido de contato. Você pode pedir a exclusão a qualquer momento respondendo ao nosso e-mail.</p>
            </form>
          </>
        )}
      </main>
    </div>
  );
}
