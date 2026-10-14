import { ArrowRight, CheckCircle2, HelpCircle, Image as ImageIcon, MapPin, MessageSquareText, Megaphone, Star, XCircle, Clock, Info } from 'lucide-react';
import { buildReport, type ReportInput } from '@/lib/prospecting/report';
import { Reveal } from '@/app/diagnostico/[token]/Motion';

const FULL_AUDIT = [
  { Icon: Info, t: 'Informações e categorias', d: 'Nome, categoria principal e secundárias, descrição, serviços e produtos cadastrados.' },
  { Icon: ImageIcon, t: 'Fotos e vídeos', d: 'Quantidade, qualidade e atualização das imagens do local, da equipe e dos trabalhos.' },
  { Icon: Star, t: 'Avaliações e respostas', d: 'Nota, volume, frequência e se as avaliações estão sendo respondidas.' },
  { Icon: Megaphone, t: 'Publicações', d: 'Novidades, ofertas e eventos que mantêm o perfil ativo.' },
  { Icon: Clock, t: 'Horários e atributos', d: 'Horários, feriados, formas de atendimento e atributos que ajudam a decidir.' },
  { Icon: MessageSquareText, t: 'Perguntas e respostas', d: 'Dúvidas frequentes dos clientes respondidas de forma clara.' },
];

/** Auditoria gratuita do perfil no Google (Google Meu Negócio), em formato de landing page. Só usa dados já observados; o resto é explicado como "visto na auditoria". */
export function Audit(props: ReportInput & { generatedAt?: string; whatsapp?: string; email?: string; price?: { from: number; unit: string } }) {
  const r = buildReport(props); const g = r.pillars.find((p) => p.key === 'google')!;
  const cta = props.whatsapp ? `https://wa.me/${props.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(`Olá! Vi a auditoria do perfil da ${props.name} no Google e gostaria de conversar.`)}` : props.email ? `mailto:${props.email}?subject=${encodeURIComponent(`Auditoria Google — ${props.name}`)}` : null;
  const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  const Cta = ({ dark }: { dark?: boolean }) => cta ? <a href={cta} className={`inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold hover:opacity-90 ${dark ? 'bg-black text-[#DCEA1E]' : 'bg-[#DCEA1E] text-black'}`}>Quero otimizar o meu perfil <ArrowRight className="h-4 w-4" strokeWidth={2} /></a> : null;
  const rating = props.rating ? String(props.rating).replace('.', ',') : null;
  return (
    <div className="min-h-screen bg-[#F7F7F4] pb-20 text-neutral-900 sm:pb-0" style={{ fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif' }}>
      <header className="relative overflow-hidden bg-black text-white">
        <div aria-hidden className="pointer-events-none absolute inset-0"><div className="mv-drift absolute -right-24 -top-24 h-96 w-96 rounded-full bg-[#DCEA1E]/10 blur-3xl" /><MapPin className="mv-float absolute right-10 top-24 hidden h-56 w-56 text-white/10 lg:block" strokeWidth={1} /></div>
        <div className="relative mx-auto flex max-w-5xl items-center justify-between px-5 py-5"><span className="flex items-center gap-3"><img src="/logo-muvens.svg" alt="" className="h-9 w-auto" /><span className="text-lg font-semibold tracking-[0.2em]">MUVENS</span></span>{cta && <a href={cta} className="hidden rounded-full bg-[#DCEA1E] px-4 py-2 text-xs font-semibold text-black sm:inline-block">Falar com a Muvens</a>}</div>
        <div className="relative mx-auto max-w-5xl px-5 pb-16 pt-8 sm:pb-24 sm:pt-14">
          <span className="mv-rise inline-block rounded-full bg-[#DCEA1E] px-3 py-1 text-xs font-semibold text-black">Auditoria gratuita · Google Meu Negócio</span>
          <h1 style={{ animationDelay: '.12s' }} className="mv-rise mt-5 max-w-3xl text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">Como está o perfil de {props.name} no Google?</h1>
          <p style={{ animationDelay: '.24s' }} className="mv-rise mt-5 max-w-2xl text-base text-white/70 sm:text-lg">Quando alguém procura {props.category ? props.category.toLowerCase() : 'o seu serviço'} perto de casa, o perfil no Google costuma ser o primeiro contato com a sua empresa. Veja o que já conseguimos observar e o que verificamos na auditoria completa.</p>
          <div style={{ animationDelay: '.36s' }} className="mv-rise mt-8"><Cta /></div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-14 sm:py-20">
        <Reveal><section className="grid gap-6 lg:grid-cols-3">
          <div className="rounded-3xl bg-black p-7 text-white lg:col-span-1">
            <p className="text-xs font-semibold uppercase tracking-widest text-[#DCEA1E]">Seu perfil hoje</p>
            {rating ? <div className="mt-4 flex items-end gap-3"><span className="text-6xl font-semibold text-[#DCEA1E]">{rating}</span><div className="pb-2"><div className="flex">{[1, 2, 3, 4, 5].map((n) => <Star key={n} className={`h-4 w-4 ${props.rating && n <= Math.round(props.rating) ? 'fill-[#DCEA1E] text-[#DCEA1E]' : 'text-white/30'}`} strokeWidth={1.5} />)}</div><p className="mt-1 text-xs text-white/60">{props.reviews ?? 0} avaliações</p></div></div> : <p className="mt-4 text-sm text-white/70">Não encontramos a nota do perfil na análise.</p>}
            <p className="mt-5 text-xs text-white/50">Dados públicos do Google no momento da análise{props.generatedAt ? ` (${props.generatedAt})` : ''}.</p>
          </div>
          <div className="rounded-3xl border border-neutral-200 bg-white p-7 lg:col-span-2">
            <h2 className="text-xl font-semibold">O que já conseguimos observar</h2><p className="mt-1 text-sm text-neutral-600">{g.summary}</p>
            <ul className="mt-5 space-y-3 text-sm">{g.items.map((x) => (
              <li key={x.label} className="flex items-start gap-3">{x.ok === null ? <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400" strokeWidth={2} /> : x.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" strokeWidth={2} /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" strokeWidth={2} />}<span>{x.label}</span></li>))}</ul>
          </div>
        </section></Reveal>

        <Reveal><section className="mt-16">
          <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">Auditoria completa</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">O que analisamos no seu perfil</h2>
          <p className="mt-2 max-w-2xl text-neutral-600">Com acesso ao perfil, revisamos cada ponto abaixo e entregamos um plano de ajustes por ordem de impacto.</p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{FULL_AUDIT.map(({ Icon, t, d }, i) => <Reveal key={t} delay={i * 70}><article className="h-full rounded-2xl border border-neutral-200 bg-white p-6"><span className="grid h-10 w-10 place-items-center rounded-xl bg-black"><Icon className="h-5 w-5 text-[#DCEA1E]" strokeWidth={1.8} /></span><h3 className="mt-4 font-semibold">{t}</h3><p className="mt-1 text-sm text-neutral-600">{d}</p></article></Reveal>)}</div>
        </section></Reveal>

        <Reveal><section className="mt-16 rounded-3xl bg-black px-7 py-12 text-white sm:px-12">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#DCEA1E]">Como funciona</p>
          <ol className="mt-6 grid gap-6 sm:grid-cols-3">{[['1. Acesso ao perfil', 'Você nos adiciona como gerentes do perfil (ou criamos e verificamos um novo, se ainda não existir).'], ['2. Otimização', 'Ajustamos informações, categorias, fotos, serviços e a estratégia de avaliações.'], ['3. Gestão e relatório', 'Publicações periódicas e relatório mensal de buscas, rotas e ligações.']].map(([t, d]) => <li key={t}><h3 className="font-semibold text-[#DCEA1E]">{t}</h3><p className="mt-1 text-sm text-white/70">{d}</p></li>)}</ol>
          {props.price && <p className="mt-8 border-t border-white/15 pt-5 text-sm text-white/80">Valor de referência do serviço: <strong className="text-[#DCEA1E]">a partir de {brl(Number(props.price.from))}{props.price.unit === 'mensal' ? ' / mês' : ''}</strong>. A proposta final depende de um breve briefing.</p>}
          <p className="mt-5 text-xs text-white/50">O Google define as regras e as posições nos resultados. Trabalhamos para melhorar a qualidade e a visibilidade do perfil, sem garantia de posição.</p>
        </section></Reveal>

        <Reveal><section className="mt-16 rounded-3xl bg-[#DCEA1E] px-7 py-12 text-center sm:px-14">
          <h2 className="mx-auto max-w-2xl text-3xl font-semibold leading-tight tracking-tight text-black sm:text-4xl">Vamos deixar o perfil de {props.name} pronto para trazer mais clientes?</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-black/70 sm:text-base">Uma conversa rápida, sem compromisso, para definir os próximos passos.</p><div className="mt-6"><Cta dark /></div>
        </section></Reveal>
      </main>
      <footer className="border-t border-neutral-200 bg-white"><div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-xs text-neutral-500"><span>Muvens Agência · baseada em informações públicas.</span><a href="/privacidade" className="underline">Privacidade</a></div></footer>
      {cta && <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-black/95 p-3 sm:hidden"><a href={cta} className="flex items-center justify-center gap-2 rounded-full bg-[#DCEA1E] px-5 py-3 text-sm font-semibold text-black">Quero otimizar o meu perfil <ArrowRight className="h-4 w-4" strokeWidth={2} /></a></div>}
    </div>
  );
}
