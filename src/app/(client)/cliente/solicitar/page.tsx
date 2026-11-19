import Link from 'next/link';
import { ArrowRight, CheckCircle2, ClipboardList, Clock3, FileUp, ShieldCheck, UsersRound } from 'lucide-react';
import { requirePortal } from '@/lib/session';
import { SubmitButton } from '@/components/SubmitButton';
import { createClientTask } from '../actions';
import { dateBR } from '@/lib/format';

export const metadata = { title: 'Solicitar uma demanda | Muvens' };

type PortalBoard = {
  projects: { id: string; name: string; status: string }[];
  tasks: { id: string; title: string; project_id: string; status: string; origin?: string; area?: string | null; due_on?: string | null }[];
};
const steps = [
  { Icon: ClipboardList, title: 'Você envia', description: 'Conte o que precisa e compartilhe referências e materiais.' },
  { Icon: UsersRound, title: 'A equipe organiza', description: 'A Muvens valida o escopo, indica responsáveis e confirma os prazos.' },
  { Icon: CheckCircle2, title: 'Você acompanha', description: 'Sua solicitação vira um cartão no quadro, com mensagens e atualizações.' },
];

export default async function SolicitarDemanda() {
  const { supabase, profile } = await requirePortal();
  const { data, error } = await supabase.rpc('portal_board');
  const board = (data ?? { projects: [], tasks: [] }) as PortalBoard;
  const projects = (board.projects ?? []).filter(p => p.status !== 'cancelado' && p.status !== 'concluido');
  const requests = (board.tasks ?? []).filter(t => t.status === 'solicitada' && t.origin === 'cliente').slice(0,6);
  const firstName = (profile.full_name || '').trim().split(/\s+/)[0];
  return (
    <div className="space-y-7">
      <header className="relative overflow-hidden rounded-[28px] bg-[#0C0E0D] px-6 py-8 text-white sm:px-10 sm:py-11">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full bg-[#DCEA1E]/10 blur-3xl"/>
        <div className="relative z-10 flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-[#DCEA1E]/25 bg-[#DCEA1E]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[.14em] text-[#E7FF8E]">Central de solicitações</span>
            <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-[42px] sm:leading-tight">{firstName ? firstName + ', ' : ''}qual será a próxima demanda?</h1>
            <p className="mt-3 max-w-xl text-sm leading-7 text-white/65 sm:text-base">Envie seu pedido diretamente para a equipe Muvens. Tudo ficará registrado no quadro de tarefas, para você acompanhar do início à entrega.</p>
          </div>
          <Link href="/cliente/quadro" className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-4 py-2.5 text-sm font-medium transition hover:bg-white/10">
            Acompanhar meu quadro <ArrowRight className="h-4 w-4"/>
          </Link>
        </div>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.65fr)_minmax(260px,.85fr)]">
        <section className="card !p-6 sm:!p-8">
          <div className="mb-7">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted"><FileUp className="h-4 w-4"/> Nova solicitação</div>
            <h2 className="text-xl font-semibold">Conte o que precisa</h2>
            <p className="mt-2 text-sm text-muted">Os campos com * são obrigatórios. Você também pode enviar outros links na conversa da demanda depois do cadastro.</p>
          </div>
          {error && <p role="alert" className="mb-5 rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm text-danger">Não foi possível carregar seus projetos. Recarregue a página ou fale com a Muvens.</p>}
          {!error && projects.length === 0
            ? <div className="rounded-xl border border-dashed border-line p-8 text-sm text-muted">
                Ainda não há projetos liberados para receber demandas. Solicite à equipe Muvens a liberação de um projeto no seu portal.
              </div>
            : !error && <form action={createClientTask} className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block"><span className="label">Projeto *</span>
                    <select name="project_id" required className="input">
                      {projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </label>
                  <label className="block"><span className="label">Área da demanda *</span>
                    <select name="area" defaultValue="" required className="input">
                      <option value="" disabled>Selecione uma área</option>
                      <option value="social_media">Social Media / conteúdo</option>
                      <option value="diagramacao">Diagramação</option>
                      <option value="outro">Design, site, anúncios ou outra</option>
                    </select>
                  </label>
                </div>
                <label className="block"><span className="label">Título do pedido *</span>
                  <input name="title" className="input" required minLength={3} maxLength={200} placeholder="Ex.: Criar carrossel de lançamento para Instagram"/>
                </label>
                <label className="block"><span className="label">Descrição e orientações *</span>
                  <textarea name="description" className="input min-h-32" required minLength={10} maxLength={6000}
                    placeholder="Explique o que deve ser feito, o público, o conteúdo e os detalhes importantes."/>
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block"><span className="label">Objetivo (opcional)</span>
                    <input name="objective" className="input" maxLength={300} placeholder="Ex.: Divulgação, conversão, campanha"/>
                  </label>
                  <label className="block"><span className="label">Formato / quantidade (opcional)</span>
                    <input name="deliverables" className="input" maxLength={300} placeholder="Ex.: 5 posts 1080×1350"/>
                  </label>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block"><span className="label">Data desejada de entrega</span>
                    <input name="due_on" type="date" className="input"/>
                  </label>
                  <label className="block"><span className="label">Link dos arquivos ou referências</span>
                    <input name="link" type="url" className="input" maxLength={1000} placeholder="https://drive.google.com/…"/>
                  </label>
                </div>
                <div className="rounded-xl border border-line bg-subtle px-4 py-3 text-xs leading-6 text-muted">
                  A data informada é uma preferência e será confirmada pela equipe. Pedidos fora do escopo contratado são avaliados antes de entrar em produção.
                </div>
                <SubmitButton className="btn btn-primary w-full sm:w-auto" pendingText="Enviando solicitação…">Enviar solicitação <ArrowRight className="h-4 w-4"/></SubmitButton>
              </form>}
        </section>
        <aside className="space-y-5">
          <section className="card !p-6">
            <div className="mb-5 flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-ok"/><h2 className="font-semibold">Como funciona</h2></div>
            <ol className="space-y-5">
              {steps.map(({Icon,title,description},i)=>(
                <li key={title} className="flex gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-subtle"><Icon className="h-[18px] w-[18px]" strokeWidth={1.7}/></span>
                  <div><p className="text-sm font-semibold">{i+1}. {title}</p><p className="mt-1 text-xs leading-5 text-muted">{description}</p></div>
                </li>
              ))}
            </ol>
          </section>
          <section className="card !p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold"><Clock3 className="h-4 w-4"/> Aguardando triagem</h2>
              <span className="badge">{requests.length}</span>
            </div>
            {requests.length ? <ul className="space-y-2">
              {requests.map(t=><li key={t.id}>
                <Link href={'/cliente/quadro/' + t.id} className="block rounded-xl border border-line p-3 transition hover:bg-subtle">
                  <span className="block text-sm font-medium">{t.title}</span>
                  <span className="mt-1 block text-[11px] text-muted">{board.projects.find(p=>p.id===t.project_id)?.name ?? 'Projeto'} · aguardando equipe</span>
                </Link>
              </li>)}
            </ul> : <p className="text-xs leading-6 text-muted">Nenhuma solicitação nova pendente de triagem.</p>}
            <Link href="/cliente/quadro" className="mt-4 inline-flex items-center gap-1 text-xs font-semibold underline">Ver todas as demandas <ArrowRight className="h-3.5 w-3.5"/></Link>
          </section>
        </aside>
      </div>
    </div>
  );
}
