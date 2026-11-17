import { Field } from '@/components/ui';
import { PLAN_STATUS, type MarketingPlan } from '@/lib/marketing';
import { saveMarketingPlan } from '@/app/(app)/marketing/actions';

function channelName(value:string){return ({instagram:'Instagram',facebook:'Facebook',google:'Google Ads',linkedin:'LinkedIn'} as Record<string,string>)[value]??value;}

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

