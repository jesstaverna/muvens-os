export type MarketingTab = 'visao' | 'estrategia' | 'campanhas' | 'publicos' | 'criativos' | 'conteudos' | 'checklist' | 'rastreamento' | 'resultados';
export type MarketingKind = 'campanha' | 'publico' | 'criativo' | 'conteudo' | 'checklist';
export type MarketingStatus = 'rascunho' | 'planejado' | 'ativo' | 'pausado' | 'concluido';
export type ActivityStatus = 'ideia' | 'planejado' | 'em_producao' | 'em_revisao' | 'aprovado' | 'ativo' | 'pausado' | 'concluido';

export interface MarketingPlan {
  id: string; title: string; client_id: string | null; scope: 'interno' | 'cliente';
  status: MarketingStatus; objective: string; offer: string; audience: string;
  region: string; landing_url: string | null; channels: string[];
  monthly_budget_min: number; monthly_budget_max: number; primary_kpi: string;
  strategy: string; measurement: string; start_on: string | null; end_on: string | null;
  created_at: string; updated_at: string;
}
export interface MarketingActivity {
  id: string; plan_id: string; kind: MarketingKind; title: string;
  channel: string; status: ActivityStatus; description: string;
  cta: string | null; destination_url: string | null; format: string | null;
  planned_on: string | null; monthly_budget: number | null;
  utm_campaign: string | null; created_at: string;
}

export const MARKETING_TABS: {key:MarketingTab; label:string}[] = [
  {key:'visao',label:'Visão geral'}, {key:'estrategia',label:'Estratégia'},
  {key:'campanhas',label:'Tráfego pago'}, {key:'publicos',label:'Públicos'},
  {key:'criativos',label:'Criativos'}, {key:'conteudos',label:'Calendário editorial'},
  {key:'checklist',label:'Pré-lançamento'}, {key:'rastreamento',label:'Links e UTMs'},
  {key:'resultados',label:'Resultados'},
];
export const KIND_BY_TAB: Partial<Record<MarketingTab,MarketingKind>> = {
  campanhas:'campanha',publicos:'publico',criativos:'criativo',
  conteudos:'conteudo',checklist:'checklist',
};
export const KIND_LABEL: Record<MarketingKind,string> = {
  campanha:'Campanha',publico:'Público',criativo:'Criativo',conteudo:'Conteúdo',checklist:'Checklist',
};
export const ACTIVITY_STATUS: Record<ActivityStatus,string> = {
  ideia:'Ideia',planejado:'Planejado',em_producao:'Em produção',em_revisao:'Em revisão',
  aprovado:'Aprovado',ativo:'Ativo',pausado:'Pausado',concluido:'Concluído',
};
export const PLAN_STATUS: Record<MarketingStatus,string> = {
  rascunho:'Rascunho',planejado:'Planejado',ativo:'Em andamento',pausado:'Pausado',concluido:'Concluído',
};
export function validMarketingTab(value:string|undefined):MarketingTab {
  return MARKETING_TABS.some(t=>t.key===value) ? value as MarketingTab:'visao';
}
export function activitiesOfKind(activities:MarketingActivity[],kind:MarketingKind){
  return activities.filter(a=>a.kind===kind).sort((a,b)=>(a.planned_on??'9999-12-31').localeCompare(b.planned_on??'9999-12-31'));
}
export function plannedBudget(activities:MarketingActivity[]) {
  return activities.filter(a=>a.kind==='campanha' && a.status!=='pausado' && a.status!=='concluido')
    .reduce((sum,a)=>sum+(Number(a.monthly_budget)||0),0);
}
export function planProgress(activities:MarketingActivity[]) {
  const checklist=activities.filter(a=>a.kind==='checklist');
  return {done:checklist.filter(a=>a.status==='concluido').length,total:checklist.length};
}
export function validHttpUrl(raw:string|null|undefined) {
  if(!raw) return null;
  try {const parsed=new URL(raw);return ['https:','http:'].includes(parsed.protocol)?parsed.toString():null;}
  catch{return null;}
}
