import { CheckCircle2, Search, BarChart3, Sparkles } from 'lucide-react';
import { enviarPedido } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Diagnóstico gratuito da sua presença digital — Muvens', description: 'Receba uma análise gratuita do site e das redes sociais da sua empresa, com oportunidades de melhoria.' };

const input = 'mt-1.5 w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm outline-none focus:border-black';

/** Página pública de captura (bio do Instagram, WhatsApp, site, anúncios). Cada envio entra no CRM e dispara a análise do site. */
export default async function DiagnosticoGratis({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; utm_source?: string; utm_campaign?: string }> }) {
  const sp = await searchParams; const ok = sp.ok === '1';
  return (
    <div className="min-h-screen bg-[#F7F7F4] text-neutral-900" style={{ fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif' }}>
      <header className="bg-black text-white">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-5 py-5"><img src="/logo-muvens.svg" alt="" className="h-9 w-auto" /><span className="text-lg font-semibold tracking-[0.2em]">MUVENS</span></div>
        <div className="mx-auto grid max-w-5xl gap-8 px-5 pb-14 pt-6 lg:grid-cols-2 lg:items-center">
          <div>
            <span className="inline-block rounded-full bg-[#DCEA1E] px-3 py-1 text-xs font-semibold text-black">100% gratuito</span>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">Descubra o que está travando a presença digital da sua empresa</h1>
            <p className="mt-4 text-white/70">Analisamos o site e as redes sociais da sua empresa e mostramos, em uma página personalizada, onde estão as oportunidades para atrair mais clientes.</p>
            <ul className="mt-6 space-y-3 text-sm text-white/85">
              {[[Search, 'Análise do site, redes sociais e conversão'], [BarChart3, 'Pontos de melhoria e o que já está bom'], [Sparkles, 'Plano de ação sugerido, sem compromisso']].map(([I, t]) => { const Icon = I as typeof Search; return <li key={String(t)} className="flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-lg bg-white/10"><Icon className="h-4 w-4 text-[#DCEA1E]" strokeWidth={1.8} /></span>{String(t)}</li>; })}
            </ul>
          </div>
          <div className="rounded-3xl bg-white p-6 text-neutral-900 shadow-xl sm:p-8">
            {ok ? (
              <div className="py-8 text-center"><CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" strokeWidth={1.6} /><h2 className="mt-4 text-2xl font-semibold">Recebemos o seu pedido!</h2><p className="mt-2 text-sm text-neutral-600">Nossa equipe vai analisar a sua empresa e entrar em contato em breve com o diagnóstico.</p></div>
            ) : (
              <form action={enviarPedido} className="space-y-4">
                <h2 className="text-xl font-semibold">Peça o seu diagnóstico</h2>
                {sp.err && <p role="alert" className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">{sp.err}</p>}
                <input type="hidden" name="t" value={Date.now()} /><input type="hidden" name="utm_source" value={sp.utm_source ?? ''} /><input type="hidden" name="utm_campaign" value={sp.utm_campaign ?? ''} />
                <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden"><label>Não preencha<input name="empresa_site_2" tabIndex={-1} autoComplete="off" /></label></div>
                <label className="block text-sm font-medium">Seu nome<input name="nome" required minLength={2} maxLength={120} autoComplete="name" className={input} /></label>
                <label className="block text-sm font-medium">E-mail<input name="email" type="email" required maxLength={160} autoComplete="email" className={input} /></label>
                <label className="block text-sm font-medium">WhatsApp (com DDD)<input name="telefone" type="tel" required maxLength={30} autoComplete="tel" placeholder="(41) 99999-9999" className={input} /></label>
                <label className="block text-sm font-medium">Nome da empresa<input name="empresa" maxLength={120} autoComplete="organization" className={input} /></label>
                <label className="block text-sm font-medium">Site da empresa <span className="font-normal text-neutral-500">(ou @ do Instagram)</span><input name="site" maxLength={160} placeholder="suaempresa.com.br" className={input} /></label>
                <label className="flex items-start gap-3 text-xs text-neutral-600"><input type="checkbox" name="aceite" className="mt-0.5 h-4 w-4 accent-black" required /><span>Autorizo a Muvens Agência a entrar em contato por e-mail e WhatsApp para enviar o diagnóstico e apresentar seus serviços. Posso pedir a exclusão dos meus dados a qualquer momento. <a href="/privacidade" className="underline">Política de privacidade</a>.</span></label>
                <button className="w-full rounded-full bg-black px-6 py-4 text-sm font-semibold text-[#DCEA1E] hover:opacity-90">Quero meu diagnóstico gratuito</button>
              </form>
            )}
          </div>
        </div>
      </header>
      <footer className="mx-auto max-w-5xl px-5 py-8 text-xs text-neutral-500">Muvens Agência · design, marketing digital e IA aplicada a negócios.</footer>
    </div>
  );
}
