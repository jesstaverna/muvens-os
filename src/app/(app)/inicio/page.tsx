import Link from 'next/link';
import { ArrowRight, CalendarDays, Clock3, Megaphone, TrendingUp, Wallet } from 'lucide-react';
import { requireModule } from '@/lib/session';
import { monthRange, todayBR, TASK_STATUS } from '@/lib/domain';
import { dateBR, money, moneyCompact } from '@/lib/format';
import { taskDisplayTitle } from '@/lib/projects/task-label';
import { taskCategoryLabel } from '@/lib/projects/task-categories';

export const metadata = { title: 'Início | MUVENS OS' };
export const dynamic = 'force-dynamic';
const platforms:Record<string,string> = { instagram:'Instagram',facebook:'Facebook',linkedin:'LinkedIn' };
const number = (v: unknown) => Number(v ?? 0).toLocaleString('pt-BR');
const value = (v: unknown) => Number(v ?? 0);
const first = <T,>(v:T|T[]|null|undefined):T|null => Array.isArray(v)?v[0]??null:v??null;
type TaskRow = { id:string;task_number:number|null;title:string;status:string;category:string|null;due_on:string|null;projects:{name:string;clients:{name:string}|{name:string}[]|null}|{name:string;clients:{name:string}|{name:string}[]|null}[]|null };
type SocialPeriod={platform:string;reach:number;impressions:number;engagements:number;link_clicks:number;source:string;metric_flags:Record<string,unknown>|null};
type SocialPost={id:string;post_title:string;platform:string;post_url:string|null;published_on:string;reach:number;views:number;interactions:number};

export default async function Inicio(){
  const {supabase,profile}=await requireModule('dashboard');
  const today=todayBR();
  const [year,month]=today.slice(0,7).split('-').map(Number);
  const {from,to}=monthRange(year,month);
  const finance=['admin','financeiro'].includes(profile.role);
  const sales=['admin','comercial'].includes(profile.role);
  const social=['admin','comercial','trafego'].includes(profile.role);
  const [
    myTasks,pendingRequests,overdue,projects,clients,tasks,activities,financial,internalClient
  ]=await Promise.all([
    supabase.from('tasks').select('id',{count:'exact',head:true}).eq('assignee_id',profile.id).not('status','in','(entregue,cancelada)'),
    supabase.from('tasks').select('id',{count:'exact',head:true}).eq('origin','cliente').eq('status','solicitada'),
    supabase.from('tasks').select('id',{count:'exact',head:true}).lt('due_on',today).in('status',['solicitada','a_fazer','em_andamento','produzido','ajustes']),
    supabase.from('projects').select('id',{count:'exact',head:true}).eq('status','em_andamento'),
    supabase.from('clients').select('id',{count:'exact',head:true}).eq('status','ativo').neq('name','MUVENS'),
    supabase.from('tasks').select('id,task_number,title,status,category,due_on,projects(name,clients(name))')
      .neq('status','cancelada').order('created_at',{ascending:false}).limit(7),
    supabase.from('marketing_activities').select('id,title,channel,status,planned_on')
      .gte('planned_on',today).order('planned_on',{ascending:true}).limit(4),
    finance||sales?supabase.rpc('dashboard_metrics',{p_from:from,p_to:to,p_client:null}):Promise.resolve({data:null,error:null}),
    social?supabase.from('clients').select('id').eq('name','MUVENS').maybeSingle():Promise.resolve({data:null,error:null}),
  ]);
  const [{data:metrics,error:metricsError},{data:bestPosts,error:postsError}]=internalClient.data?.id?await Promise.all([
    supabase.from('social_period_metrics').select('platform,reach,impressions,engagements,link_clicks,source,metric_flags')
      .eq('client_id',internalClient.data.id).eq('period_start',from).eq('period_end',to),
    supabase.from('social_post_metrics').select('id,post_title,platform,post_url,published_on,reach,views,interactions')
      .eq('client_id',internalClient.data.id).gte('published_on',from).lte('published_on',to)
      .order('reach',{ascending:false}).limit(3),
  ]):[{data:null,error:null},{data:null,error:null}];
  const channels=(metrics??[]) as SocialPeriod[];
  const posts=((bestPosts??[]) as SocialPost[]).sort((a,b)=>Math.max(value(b.reach),value(b.views))-Math.max(value(a.reach),value(a.views))).slice(0,3);
  const observed=(p:SocialPeriod,key:'reach'|'engagements'|'link_clicks')=>p.source==='manual'||p.metric_flags?.[key]===true;
  const metricTotal=(key:'reach'|'engagements'|'link_clicks')=>{
    const measured=channels.filter(p=>observed(p,key));
    return measured.length?number(measured.reduce((n,p)=>n+value(p[key]),0)):'—';
  };
  const kpi=(financial.data??{}) as Record<string,unknown>;
  const tasksView=(tasks.data??[]) as TaskRow[];
  const titleOf=(t:TaskRow)=>taskDisplayTitle(t.task_number,first(first(t.projects)?.clients)?.name,t.title);
  const cards=[
    {label:'Minhas tarefas',total:myTasks.count??0,detail:'Atribuídas a você',href:'/projetos?me=1'},
    {label:'Solicitações do cliente',total:pendingRequests.count??0,detail:'Aguardando triagem',href:'/projetos'},
    {label:'Tarefas atrasadas',total:overdue.count??0,detail:'Prazos vencidos',href:'/projetos?view=lista'},
    {label:'Projetos ativos',total:projects.count??0,detail:String(clients.count??0)+' clientes externos ativos',href:'/projetos?view=projetos'},
  ];
  return <>
    <header className="mb-6 rounded-[26px] bg-[#0C0E0D] px-6 py-8 text-white sm:px-9">
      <p className="text-[11px] font-bold uppercase tracking-[.18em] text-[#DCEA1E]">MUVENS OS · INÍCIO</p>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
        <div><h1 className="text-3xl font-semibold tracking-tight">Visão geral da agência</h1>
          <p className="mt-2 text-sm text-white/60">O essencial da operação, marketing e resultados em um só lugar.</p>
          <p className="mt-3 flex items-center gap-2 text-xs text-white/50"><CalendarDays className="h-4 w-4"/>{dateBR(today)}</p></div>
        <div className="flex flex-wrap gap-2"><Link href="/projetos/tarefas/nova" className="rounded-xl bg-[#DCEA1E] px-4 py-2.5 text-sm font-semibold text-black">+ Nova tarefa</Link>
          <Link href="/dashboard" className="rounded-xl border border-white/25 px-4 py-2.5 text-sm text-white">Análises detalhadas</Link></div>
      </div>
    </header>
    <section aria-label="Resumo operacional" className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map(c=><Link key={c.label} href={c.href} className="rounded-2xl border border-line bg-surface p-5 transition hover:shadow-sm">
        <div className="text-xs text-muted">{c.label}</div><div className="mt-3 text-[28px] font-semibold tabular-nums">{number(c.total)}</div>
        <div className="mt-1 text-xs text-muted">{c.detail}</div>
      </Link>)}
    </section>
    <div className="mb-6 grid items-start gap-5 xl:grid-cols-2">
      <section className="rounded-2xl border border-line bg-surface p-5">
        <div className="mb-3 flex items-center justify-between"><h2 className="text-base font-semibold">Tarefas da agência</h2><Link href="/projetos" className="text-xs text-muted underline">Ver Kanban</Link></div>
        {tasksView.length?<ul className="divide-y divide-line">{tasksView.map(t=><li key={t.id} className="py-3">
          <Link href={'/projetos/tarefas/'+t.id} className="block text-sm font-semibold hover:underline">{titleOf(t)}</Link>
          <p className="mt-1 text-xs text-muted">{TASK_STATUS[t.status]?.label??t.status}{t.category?' · '+taskCategoryLabel(t.category):''}{t.due_on?' · '+dateBR(t.due_on):''}</p>
        </li>)}</ul>:<p className="py-5 text-sm text-muted">Nenhuma tarefa cadastrada.</p>}
      </section>
      <section className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="mb-3 flex items-center gap-2 text-base font-semibold"><Megaphone className="h-4 w-4"/> Planejamento de marketing</h2>
        {activities.data?.length?<ul className="divide-y divide-line">{activities.data.map(a=><li key={a.id} className="flex items-start justify-between gap-2 py-3">
          <div><div className="text-sm font-medium">{a.title}</div><div className="mt-1 text-xs text-muted">{a.channel||'Canal a definir'} · {a.status}</div></div>
          <time className="shrink-0 text-xs text-muted">{a.planned_on?dateBR(a.planned_on):'—'}</time>
        </li>)}</ul>:<p className="py-5 text-sm text-muted">Sem ações futuras cadastradas no calendário.</p>}
      </section>
    </div>
    {social&&<section className="mb-6 rounded-2xl border border-line bg-surface p-5">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-[11px] font-semibold uppercase tracking-wider text-muted">REDES SOCIAIS · MUVENS</p>
          <h2 className="mt-1 text-lg font-semibold">Desempenho em {String(month).padStart(2,'0')}/{year}</h2>
          <p className="mt-1 text-xs text-muted">Instagram, Facebook e LinkedIn · informações registradas, não estimativas</p></div>
        <Link href="/social-insights" className="rounded-xl border border-line px-3 py-2 text-xs font-medium hover:bg-subtle">Gerenciar métricas <ArrowRight className="ml-1 inline h-3 w-3"/></Link>
      </div>
      {metricsError||postsError?<p className="mb-4 rounded-xl bg-amber-500/10 p-3 text-sm">Métricas sociais indisponíveis. Confira a configuração do módulo.</p>:null}
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ['Alcance registrado',metricTotal('reach'),'Somente redes que fornecem alcance verificável'],
          ['Interações',metricTotal('engagements'),'Métricas verificadas por rede'],
          ['Cliques em links',metricTotal('link_clicks'),'Cliques informados nos relatórios'],
        ].map(([label,total,hint])=><div key={label} className="rounded-xl border border-line bg-subtle/40 p-4">
          <div className="text-xs text-muted">{label}</div><div className="mt-2 text-2xl font-semibold tabular-nums">{total}</div>
          <p className="mt-1 text-[11px] text-muted">{hint}</p>
        </div>)}
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div><h3 className="mb-3 text-sm font-semibold">Alcance por canal</h3>
          {channels.length?<div className="space-y-2">{channels.map(p=><div key={p.platform} className="flex items-center justify-between rounded-xl border border-line p-3">
            <div><div className="text-sm font-semibold">{platforms[p.platform]??p.platform}</div><div className="mt-1 text-xs text-muted">{number(p.engagements)} interações</div></div>
            <div className="text-right"><div className="text-sm font-semibold">{observed(p,'reach')?number(p.reach):'—'}</div><div className="text-[10px] text-muted">{observed(p,'reach')?'alcance':p.platform==='linkedin'?'impressões '+number(p.impressions):'alcance indisponível'}</div></div>
          </div>)}</div>:<p className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">Ainda não há alcance registrado neste mês.</p>}
        </div>
        <div><h3 className="mb-3 text-sm font-semibold">Posts em destaque</h3>
          {posts.length?<ol className="space-y-2">{posts.map((p,i)=><li key={p.id} className="flex gap-3 rounded-xl border border-line p-3">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[#DCEA1E]/25 text-xs font-bold">{i+1}</span>
            <div><div className="text-sm font-semibold">{p.post_url?<a href={p.post_url} target="_blank" rel="noopener noreferrer" className="hover:underline">{p.post_title}</a>:p.post_title}</div>
              <p className="mt-1 text-xs text-muted">{platforms[p.platform]??p.platform} · {p.reach>0?number(p.reach)+' alcance':p.views>0?number(p.views)+' visualizações':'Alcance indisponível'} · {number(p.interactions)} interações</p></div>
          </li>)}</ol>:<p className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">Sem posts avaliados neste mês. Adicione dados reais para criar o ranking.</p>}
        </div>
      </div>
      <p className="mt-4 text-[11px] text-muted">Fonte: relatórios manuais ou APIs oficiais autorizadas. Alcance, visualizações e impressões únicas são métricas diferentes; valores não disponíveis aparecem como “—”.</p>
    </section>}
    <div className="grid gap-5 lg:grid-cols-2">
      {sales&&<section className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="mb-4 flex items-center gap-2 text-base font-semibold"><TrendingUp className="h-4 w-4"/> Comercial</h2>
        <div className="grid grid-cols-2 gap-4">
          <div><p className="text-xs text-muted">Negociações abertas</p><p className="mt-1 text-xl font-semibold">{financial.error?'—':number(kpi.negotiations_open)}</p></div>
          <div><p className="text-xs text-muted">Potencial ponderado</p><p className="mt-1 text-xl font-semibold">{financial.error?'—':moneyCompact(value(kpi.pipeline_weighted))}</p></div>
          <div><p className="text-xs text-muted">Leads recebidos</p><p className="mt-1 text-xl font-semibold">{financial.error?'—':number(kpi.leads_received)}</p></div>
          <div><p className="text-xs text-muted">Propostas enviadas</p><p className="mt-1 text-xl font-semibold">{financial.error?'—':number(kpi.proposals_sent)}</p></div>
        </div><Link href="/crm" className="mt-4 inline-flex items-center gap-1 text-xs underline">Ver CRM <ArrowRight className="h-3 w-3"/></Link>
      </section>}
      {finance&&<section className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="mb-4 flex items-center gap-2 text-base font-semibold"><Wallet className="h-4 w-4"/> Financeiro</h2>
        <div className="grid grid-cols-2 gap-4">
          <div><p className="text-xs text-muted">Recebido no mês</p><p className="mt-1 text-xl font-semibold">{financial.error?'—':money(value(kpi.received))}</p></div>
          <div><p className="text-xs text-muted">Receita recorrente</p><p className="mt-1 text-xl font-semibold">{financial.error?'—':money(value(kpi.mrr))}</p></div>
          <div><p className="text-xs text-muted">Contas a receber</p><p className="mt-1 text-xl font-semibold">{financial.error?'—':money(value(kpi.receivable_open))}</p></div>
          <div><p className="text-xs text-muted">Saldo operacional</p><p className="mt-1 text-xl font-semibold">{financial.error?'—':money(value(kpi.received)-value(kpi.expenses_paid))}</p></div>
        </div><Link href="/financeiro" className="mt-4 inline-flex items-center gap-1 text-xs underline">Ver financeiro <ArrowRight className="h-3 w-3"/></Link>
      </section>}
    </div>
    <div className="mt-6 text-right"><Link href="/dashboard" className="inline-flex items-center gap-2 text-xs text-muted underline"><Clock3 className="h-4 w-4"/> Acessar dashboard detalhado</Link></div>
  </>;
}
