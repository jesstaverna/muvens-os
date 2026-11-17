import Link from 'next/link';
import { ArrowUpRight, BarChart3, CalendarDays, CheckCircle2, FileText, Megaphone, Plus, Target } from 'lucide-react';
import { requireModule } from '@/lib/session';
import { Empty, Field, PageHeader, Stat, Tabs } from '@/components/ui';
import { LinkButton } from '@/components/LinkButton';
import { dateBR, money } from '@/lib/format';
import {
 ACTIVITY_STATUS, KIND_BY_TAB, KIND_LABEL, MARKETING_TABS, PLAN_STATUS,
 activitiesOfKind, plannedBudget, planProgress, validHttpUrl, validMarketingTab,
 type MarketingActivity, type MarketingKind, type MarketingPlan, type MarketingTab,
} from '@/lib/marketing';
import { saveMarketingActivity, saveMarketingPlan } from './actions';

export const metadata={title:'Central de Marketing | MUVENS OS'};
type SP={plan?:string;tab?:string};
const kindIcon={campanha:Megaphone,publico:Target,criativo:FileText,conteudo:CalendarDays,checklist:CheckCircle2};
const kindTab:Record<MarketingKind,MarketingTab>={campanha:'campanhas',publico:'publicos',criativo:'criativos',conteudo:'conteudos',checklist:'checklist'};
function href(planId:string,tab:MarketingTab){return '/marketing?plan='+encodeURIComponent(planId)+'&tab='+tab;}
function channelName(value:string){return ({instagram_facebook:'Instagram e Facebook',instagram:'Instagram',facebook:'Facebook',google:'Google Ads',linkedin:'LinkedIn'} as Record<string,string>)[value]??value;}
function Intro({title,subtitle}:{title:string;subtitle:string}) {
 return <div className="mb-5"><h2 className="text-lg font-semibold">{title}</h2><p className="mt-1 text-sm text-muted">{subtitle}</p></div>;
}
function SafeLink({url}:{url:string|null}){
 const safe=validHttpUrl(url);
 return safe?<a className="inline-flex items-center gap-1.5 text-sm font-medium underline underline-offset-4" href={safe} rel="noopener noreferrer" target="_blank">Abrir página<ArrowUpRight className="h-4 w-4"/></a>:<span className="text-xs text-muted">Página não cadastrada</span>;
}

export default async function Marketing({searchParams}:{searchParams:Promise<SP>}) {
 const {supabase,profile}=await requireModule('marketing');
 const sp=await searchParams;const tab=validMarketingTab(sp.tab);
 const canPlan=['admin','comercial','trafego'].includes(profile.role);
 const canItem=['admin','comercial','designer','trafego'].includes(profile.role);
 const [pRes,crmRes]=await Promise.all([
  supabase.from('marketing_plans').select('*').order('updated_at',{ascending:false}).limit(75),
  ['admin','comercial'].includes(profile.role)
   ? supabase.from('leads').select('id',{count:'exact',head:true})
   : Promise.resolve({count:null,error:null}),
 ]);
 const plans=(pRes.data??[]) as MarketingPlan[];
 const plan=plans.find(p=>p.id===sp.plan)??plans[0]??null;
 const aRes=plan?await supabase.from('marketing_activities').select('*').eq('plan_id',plan.id).order('created_at').limit(300):{data:[] as MarketingActivity[],error:null};
 const activities=(aRes.data??[]) as MarketingActivity[];
 const progress=planProgress(activities);
 const spend=plannedBudget(activities);
 const max=Number(plan?.monthly_budget_max??0);
 const error=Boolean(pRes.error||aRes.error||crmRes.error);
 const url=(selected:MarketingTab)=>plan?href(plan.id,selected):'/marketing?tab='+selected;
 const canSeeCrm=['admin','comercial'].includes(profile.role);
 return <>
  <PageHeader title="Central de Marketing" subtitle="Estratégia, campanhas, criativos, calendário e resultados planejados no mesmo ambiente."
    actions={<><LinkButton href="/projetos" className="btn">Produção</LinkButton>{canSeeCrm&&<LinkButton href="/crm" className="btn">CRM e Leads</LinkButton>}</>}/>
  {error&&<p role="alert" className="mb-5 rounded-xl border border-danger/40 bg-danger/10 p-4 text-sm text-danger">Algumas informações não foram carregadas. Confira o acesso e atualize a página.</p>}

  <section aria-label="Planejamentos" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-4">
   <div><div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted">Planejamento selecionado</div>
    <div className="flex flex-wrap items-center gap-2"><strong className="text-sm">{plan?.title??'Nenhum planejamento cadastrado'}</strong>{plan&&<span className="badge">{PLAN_STATUS[plan.status]}</span>}</div></div>
   <div className="flex flex-wrap items-center gap-2">
    {plans.length>1&&<details className="relative"><summary className="btn btn-sm cursor-pointer">Trocar planejamento</summary>
      <div className="absolute right-0 top-full z-20 mt-2 w-72 max-w-[80vw] rounded-xl border border-line bg-surface p-2 shadow-xl">
      {plans.map(p=><Link key={p.id} href={href(p.id,'visao')} className="block rounded-lg px-3 py-2 text-sm hover:bg-subtle">{p.title}</Link>)}</div>
     </details>}
    {canPlan&&<Link href="/marketing/novo" className="btn btn-sm"><Plus className="h-3.5 w-3.5"/>Novo planejamento</Link>}
   </div>
  </section>

  {plan?<>
   <Tabs current={tab} items={MARKETING_TABS.map(t=>({...t,href:url(t.key)}))}/>
   {tab==='visao'&&<div className="space-y-6">
     <section className="rounded-2xl bg-black p-7 text-white sm:p-9">
       <div className="text-[11px] font-semibold uppercase tracking-[0.15em] text-lime">Planejamento estratégico · {plan.scope==='interno'?'MUVENS':'Cliente'}</div>
       <h2 className="mt-3 max-w-3xl text-2xl font-semibold sm:text-3xl">{plan.offer||plan.title}</h2>
       <p className="mt-3 max-w-3xl text-sm text-white/70">{plan.objective||'Defina o objetivo da campanha na aba Estratégia.'}</p>
       <div className="mt-6 flex flex-wrap items-center gap-3"><Link href={url('estrategia')} className="btn btn-primary btn-sm">Abrir estratégia</Link>
        <span className="text-xs text-white/60">{plan.channels.map(channelName).join(' · ')}</span></div>
     </section>
     <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indicadores do planejamento">
       <Stat label="Orçamento mensal previsto" value={money(max)} hint={'Faixa: '+money(Number(plan.monthly_budget_min))+' a '+money(max)} />
       <Stat label="Mídia planejada por campanhas" value={money(spend)} hint={spend>max?'Acima do teto definido':money(Math.max(max-spend,0))+' ainda não distribuídos'} tone={spend>max?'danger':undefined}/>
       <Stat label="Itens de criação" value={activities.filter(a=>a.kind==='criativo'||a.kind==='conteudo').length} hint="Criativos e publicações planejados"/>
       <Stat label="Checklist de lançamento" value={progress.total?progress.done+' de '+progress.total:'Não criado'} hint="Etapas concluídas"/>
     </section>
     <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{([
       ['estrategia','Estratégia','Objetivo, oferta, público e posicionamento',Target],
       ['campanhas','Tráfego pago','Campanhas, investimento e destino',Megaphone],
       ['criativos','Criativos','Conceitos, formatos, mensagens e CTA',FileText],
       ['conteudos','Calendário editorial','Conteúdos por canal e data',CalendarDays],
       ['checklist','Pré-lançamento','O que validar antes de anunciar',CheckCircle2],
       ['resultados','Resultados','CRM e mensuração sem métricas simuladas',BarChart3],
     ] as const).map(([key,title,desc,Icon])=><Link key={key} href={url(key)}
      className="group flex items-center gap-3 rounded-2xl border border-line bg-surface p-5 transition hover:border-fg/40 hover:bg-subtle/50">
       <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-subtle"><Icon className="h-5 w-5"/></span>
       <span className="flex-1"><span className="block text-sm font-semibold">{title}</span><span className="mt-1 block text-xs text-muted">{desc}</span></span><ArrowUpRight className="h-4 w-4 text-muted"/></Link>)}</div>
     <div className="rounded-xl border border-line p-4 text-sm"><b>Destino da campanha: </b><SafeLink url={plan.landing_url}/></div>
   </div>}

   {tab==='estrategia'&&<div className="grid gap-6 xl:grid-cols-[1.45fr_1fr]">
    <section className="card"><Intro title="Planejamento estratégico" subtitle="Os valores são projeções de orçamento, não investimento realizado."/>
      <PlanForm plan={plan} canEdit={canPlan}/></section>
    <section className="card h-fit space-y-4"><h2 className="text-base font-semibold">Direção do plano</h2>
      <div><div className="label">Objetivo</div><p className="whitespace-pre-wrap text-sm">{plan.objective||'Não informado'}</p></div>
      <div><div className="label">Público</div><p className="whitespace-pre-wrap text-sm">{plan.audience||'Não informado'}</p></div>
      <div><div className="label">Medição</div><p className="whitespace-pre-wrap text-sm">{plan.measurement||'Ainda não definido'}</p></div>
      <div className="border-t border-line pt-4"><SafeLink url={plan.landing_url}/></div>
    </section>
   </div>}

   {tab in KIND_BY_TAB&&<ActivitySection kind={KIND_BY_TAB[tab]!} planId={plan.id}
     activities={activities} canEdit={canItem}/>}

   {tab==='resultados'&&<div className="space-y-6">
     <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
       <Stat label="Orçamento de referência" value={money(max)} hint="Planejado; não é gasto realizado" />
       <Stat label="Leads atuais no CRM" value={crmCount===null?'Acesso restrito':crmCount} hint="Quantidade geral do CRM; não atribuída à campanha"/>
       <Stat label="KPI principal" value={plan.primary_kpi||'Leads qualificados'} hint="A mensuração por origem depende das UTMs e integração do formulário"/>
     </section>
     <div className="card space-y-3">
       <Intro title="Mensuração e integração com o CRM" subtitle="Nenhuma campanha foi publicada e o MUVENS OS ainda não recebe dados do Gerenciador de Anúncios da Meta."/>
       <p className="text-sm">Antes do lançamento, confirme o Pixel da Meta, o evento de conversão do formulário, os parâmetros UTM e o registro da origem dos contatos no CRM. Conte os leads qualificados e as propostas somente após validar sua atribuição.</p>
       {canSeeCrm&&<Link href="/crm" className="btn btn-sm">Abrir CRM</Link>}
       <div className="rounded-xl bg-subtle p-4 text-xs text-muted">Impressões, alcance, CTR, CPC, CPL e investimento realizado permanecerão indisponíveis até existir integração ou lançamento auditável dos resultados.</div>
     </div>
   </div>}
  </>:<Empty title="Comece com um planejamento de marketing" text="Crie um plano para organizar oferta, público, orçamento, criativos, mídia paga, checklist e conteúdo."
   action={canPlan?<Link href="/marketing/novo" className="btn btn-primary">Criar planejamento</Link>:undefined}/>}
 </>;
}

export function PlanForm({plan,canEdit=true}:{plan:MarketingPlan|null;canEdit?:boolean}){
 if(!canEdit)return <p className="text-sm text-muted">Seu perfil pode consultar, mas não editar a estratégia.</p>;
 return <form action={saveMarketingPlan} className="space-y-4">
  {plan&&<input type="hidden" name="id" value={plan.id}/>}
  <div className="grid gap-4 sm:grid-cols-2">
   <Field label="Nome do planejamento"><input required minLength={3} maxLength={160} name="title" defaultValue={plan?.title??''} className="input" placeholder="Aquisição Muvens · Meta Ads"/></Field>
   <Field label="Status"><select name="status" defaultValue={plan?.status??'rascunho'} className="input">{Object.entries(PLAN_STATUS).map(([v,l])=><option value={v} key={v}>{l}</option>)}</select></Field>
  </div>
  <Field label="Objetivo"><textarea name="objective" rows={2} defaultValue={plan?.objective??''} className="input"/></Field>
  <Field label="Oferta e mensagem principal"><textarea name="offer" rows={2} defaultValue={plan?.offer??''} className="input"/></Field>
  <Field label="Público-alvo"><textarea name="audience" rows={3} defaultValue={plan?.audience??''} className="input"/></Field>
  <div className="grid gap-4 sm:grid-cols-2">
   <Field label="Região"><input name="region" defaultValue={plan?.region??''} className="input"/></Field>
   <Field label="KPI principal"><input name="primary_kpi" defaultValue={plan?.primary_kpi??'Leads qualificados'} className="input"/></Field>
   <Field label="Orçamento mínimo mensal (R$)"><input type="number" min={0} step="0.01" name="monthly_budget_min" defaultValue={Number(plan?.monthly_budget_min??600)} className="input"/></Field>
   <Field label="Orçamento máximo mensal (R$)"><input type="number" min={0} step="0.01" name="monthly_budget_max" defaultValue={Number(plan?.monthly_budget_max??1000)} className="input"/></Field>
   <Field label="Data inicial"><input type="date" name="start_on" defaultValue={plan?.start_on??''} className="input"/></Field>
   <Field label="Data final"><input type="date" name="end_on" defaultValue={plan?.end_on??''} className="input"/></Field>
  </div>
  <fieldset><legend className="label">Canais planejados</legend><div className="flex flex-wrap gap-4 text-sm">{['instagram','facebook','google','linkedin'].map(c=>
   <label key={c} className="flex items-center gap-2"><input type="checkbox" name="channels" value={c} defaultChecked={plan?plan.channels.includes(c):['instagram','facebook'].includes(c)}/>{channelName(c)}</label>)}</div></fieldset>
  <Field label="URL da landing page"><input type="url" name="landing_url" defaultValue={plan?.landing_url??''} className="input"/></Field>
  <Field label="Estratégia e hipóteses"><textarea name="strategy" rows={6} defaultValue={plan?.strategy??''} className="input"/></Field>
  <Field label="Mensuração e regras de decisão"><textarea name="measurement" rows={5} defaultValue={plan?.measurement??''} className="input"/></Field>
  <button className="btn btn-primary" type="submit">Salvar planejamento</button>
 </form>;
}

function ActivitySection({kind,planId,activities,canEdit}:{kind:MarketingKind;planId:string;activities:MarketingActivity[];canEdit:boolean}){
 const items=activitiesOfKind(activities,kind),Icon=kindIcon[kind];
 const subtitle=({campanha:'Configure campanhas e orçamentos previstos; nenhuma mídia é ativada pelo MUVENS OS.',
 publico:'Defina hipóteses de audiência sem inventar interesses ou segmentações não validadas.',
 criativo:'Documente conceitos, formato, mensagem, imagem e CTA para produzir as peças.',
 conteudo:'Planeje pautas por canal e data. Publicação e agendamento ainda não estão integrados.',
 checklist:'Etapas para verificar landing page, Pixel, UTMs e formulários antes do lançamento.'} as Record<MarketingKind,string>)[kind];
 return <div className="space-y-5">
  <Intro title={kind==='conteudo'?'Calendário editorial':kind==='campanha'?'Tráfego Pago':KIND_LABEL[kind]+'s'} subtitle={subtitle}/>
  {kind==='conteudo'&&<Link href="/calendario" className="text-xs text-muted underline underline-offset-4">Calendário operacional de tarefas (separado do editorial)</Link>}
  <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
   {items.map(a=><article key={a.id} className="card flex flex-col !p-4">
    <div className="mb-3 flex items-center justify-between gap-2"><Icon className="h-5 w-5 text-muted"/><span className="badge">{ACTIVITY_STATUS[a.status]??a.status}</span></div>
    <h3 className="text-sm font-semibold">{a.title}</h3>
    <p className="mt-1 whitespace-pre-wrap text-xs text-muted">{a.description||'Sem descrição'}</p>
    <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted"><span>{channelName(a.channel)}</span>
      {a.format&&<span>· {a.format}</span>}{a.planned_on&&<span>· {dateBR(a.planned_on)}</span>}
      {a.monthly_budget!=null&&<span>· Previsto {money(Number(a.monthly_budget))}</span>}</div>
    {a.cta&&<div className="mt-3 text-xs"><strong>CTA:</strong> {a.cta}</div>}
    {a.destination_url&&<div className="mt-2"><SafeLink url={a.destination_url}/></div>}
    {canEdit&&<details className="mt-auto pt-4"><summary className="cursor-pointer text-xs font-medium underline underline-offset-4">Editar item</summary>
     <div className="mt-3"><ActivityForm kind={kind} planId={planId} item={a}/></div>
    </details>}
   </article>)}
  </section>
  {!items.length&&<Empty title={'Nenhum item de '+KIND_LABEL[kind].toLowerCase()} text="Adicione a primeira etapa ao planejamento."/>}
  {canEdit&&<details className="rounded-2xl border border-line bg-surface p-5">
    <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold"><Plus className="h-4 w-4"/>Adicionar {KIND_LABEL[kind].toLowerCase()}</summary>
    <div className="mt-4 max-w-2xl"><ActivityForm kind={kind} planId={planId} item={null}/></div>
   </details>}
 </div>;
}

function ActivityForm({kind,planId,item}:{kind:MarketingKind;planId:string;item:MarketingActivity|null}){
 return <form action={saveMarketingActivity} className="space-y-3">
  <input type="hidden" name="plan_id" value={planId}/><input type="hidden" name="kind" value={kind}/>
  {item&&<input type="hidden" name="id" value={item.id}/>}
  <Field label="Título"><input name="title" className="input" required maxLength={180} defaultValue={item?.title??''}/></Field>
  <div className="grid gap-3 sm:grid-cols-2">
   <Field label="Status"><select name="status" defaultValue={item?.status??'ideia'} className="input">
    {Object.entries(ACTIVITY_STATUS).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></Field>
   <Field label="Canal"><select name="channel" defaultValue={item?.channel??'instagram_facebook'} className="input">
    {['instagram_facebook','instagram','facebook','google','linkedin'].map(v=><option key={v} value={v}>{channelName(v)}</option>)}</select></Field>
  </div>
  <Field label="Detalhes / copy"><textarea name="description" rows={4} className="input" defaultValue={item?.description??''}/></Field>
  <div className="grid gap-3 sm:grid-cols-2">
   <Field label="Formato"><input name="format" className="input" defaultValue={item?.format??''} placeholder="1080 × 1350"/></Field>
   <Field label="Data planejada"><input type="date" name="planned_on" className="input" defaultValue={item?.planned_on??''}/></Field>
   <Field label="Orçamento mensal previsto (R$)"><input type="number" min={0} step="0.01" name="monthly_budget" className="input" defaultValue={item?.monthly_budget??''}/></Field>
   <Field label="CTA"><input name="cta" className="input" defaultValue={item?.cta??''}/></Field>
   <Field label="Destino (URL)"><input name="destination_url" type="url" className="input" defaultValue={item?.destination_url??''}/></Field>
   <Field label="UTM campaign"><input name="utm_campaign" className="input" defaultValue={item?.utm_campaign??''}/></Field>
  </div>
  <button type="submit" className="btn btn-primary btn-sm">{item?'Salvar alterações':'Adicionar ao planejamento'}</button>
 </form>;
}
