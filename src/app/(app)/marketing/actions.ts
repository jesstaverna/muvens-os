'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { flash, requireModule } from '@/lib/session';
import { KIND_BY_TAB, type MarketingTab } from '@/lib/marketing';

const optionalText=(limit=4000)=>z.preprocess(
  v=>typeof v==='string' ? v.trim() : '',
  z.string().max(limit)
);
const optionalDate=z.preprocess(v=>v || null,z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable());
const optionalUrl=z.preprocess(v=>{
  const value=String(v??'').trim();
  return value||null;
},z.string().max(1000).url().refine(v=>/^https?:\/\//i.test(v),'Use um endereço HTTP(S).').nullable());
const money=z.preprocess(v=>v===''||v==null?0:Number(String(v).trim().replace(',','.')),z.number().finite().min(0).max(1_000_000));
const optionalMoney=z.preprocess(v=>v===''||v==null?null:Number(String(v).trim().replace(',','.')),z.number().finite().min(0).max(1_000_000).nullable());
const planSchema=z.object({
  title:z.string().trim().min(3).max(160),
  status:z.enum(['rascunho','planejado','ativo','pausado','concluido']),
  objective:optionalText(),offer:optionalText(),audience:optionalText(),
  region:optionalText(500),strategy:optionalText(10000),measurement:optionalText(5000),
  primary_kpi:optionalText(200), landing_url:optionalUrl,
  monthly_budget_min:money,monthly_budget_max:money,
  start_on:optionalDate,end_on:optionalDate,
}).refine(v=>v.monthly_budget_max>=v.monthly_budget_min,{path:['monthly_budget_max'],message:'O teto precisa ser maior ou igual ao valor mínimo.'})
  .refine(v=>!v.start_on||!v.end_on||v.end_on>=v.start_on,{message:'A data final deve ser posterior ao início.'});

const activitySchema=z.object({
  plan_id:z.string().uuid(),id:z.preprocess(v=>v||null,z.string().uuid().nullable()),
  kind:z.enum(['campanha','publico','criativo','conteudo','checklist']),
  title:z.string().trim().min(2).max(180),
  status:z.enum(['ideia','planejado','em_producao','em_revisao','aprovado','ativo','pausado','concluido']),
  channel:optionalText(80),description:optionalText(10000),cta:optionalText(500),
  destination_url:optionalUrl,format:optionalText(100),planned_on:optionalDate,
  monthly_budget:optionalMoney,utm_campaign:optionalText(200),
});

function asObject(fd:FormData) { return Object.fromEntries(fd.entries()); }
function canManagePlan(role:string) {return ['admin','comercial','trafego'].includes(role);}
function canManageActivity(role:string) {return ['admin','comercial','designer','trafego'].includes(role);}
function backTo(planId:string,tab:string){return '/marketing?plan='+encodeURIComponent(planId)+'&tab='+encodeURIComponent(tab);}

export async function saveMarketingPlan(fd:FormData){
  const {supabase,profile}=await requireModule('marketing');
  if(!canManagePlan(profile.role))flash('/marketing','err','Seu perfil não pode editar planos de marketing.');
  const id=String(fd.get('id')??'');
  const parsed=planSchema.safeParse(asObject(fd));
  if(!parsed.success)flash('/marketing?tab=estrategia','err',parsed.error.issues[0]?.message??'Dados inválidos.');
  const channels=fd.getAll('channels').map(String).filter(c=>['instagram','facebook','google','linkedin'].includes(c));
  if(!channels.length)flash('/marketing?tab=estrategia','err','Selecione ao menos um canal.');
  const patch={...parsed.data,channels,updated_at:new Date().toISOString()};
  if(id){
    if(!z.string().uuid().safeParse(id).success)flash('/marketing','err','Plano inválido.');
    const {data,error}=await supabase.from('marketing_plans').update(patch).eq('id',id).select('id').maybeSingle();
    if(error||!data)flash(backTo(id,'estrategia'),'err','Não foi possível salvar o plano.');
    revalidatePath('/marketing');
    flash(backTo(id,'estrategia'),'ok','Planejamento atualizado.');
  }
  const {data,error}=await supabase.from('marketing_plans')
    .insert({...patch,scope:'interno',created_by:profile.id}).select('id').single();
  if(error||!data)flash('/marketing','err','Não foi possível criar o planejamento.');
  revalidatePath('/marketing');
  flash(backTo(data.id,'estrategia'),'ok','Planejamento criado.');
}

export async function saveMarketingActivity(fd:FormData){
  const {supabase,profile}=await requireModule('marketing');
  if(!canManageActivity(profile.role))flash('/marketing','err','Seu perfil não pode editar o calendário.');
  const parsed=activitySchema.safeParse(asObject(fd));
  if(!parsed.success)flash('/marketing','err',parsed.error.issues[0]?.message??'Informações inválidas.');
  const {plan_id,id,...payload}=parsed.data;
  const {data:plan}=await supabase.from('marketing_plans').select('id').eq('id',plan_id).maybeSingle();
  if(!plan)flash('/marketing','err','Este plano não está disponível.');
  const tab=(Object.keys(KIND_BY_TAB) as MarketingTab[]).find(k=>KIND_BY_TAB[k]===payload.kind)??'visao';
  const back=backTo(plan_id,tab);
  const patch={
    ...payload,
    channel:payload.channel||'instagram_facebook',
    cta:payload.cta||null,format:payload.format||null,utm_campaign:payload.utm_campaign||null,
    updated_at:new Date().toISOString(),
  };
  if(id){
    const {data,error}=await supabase.from('marketing_activities')
      .update(patch).eq('id',id).eq('plan_id',plan_id).select('id').maybeSingle();
    if(error||!data)flash(back,'err','Não foi possível atualizar este item.');
  } else {
    const {error}=await supabase.from('marketing_activities')
      .insert({...patch,plan_id,created_by:profile.id});
    if(error)flash(back,'err','Não foi possível adicionar este item.');
  }
  revalidatePath('/marketing');
  flash(back,'ok',id?'Item atualizado.':'Item adicionado ao planejamento.');
}


/** Marcação manual de conferência. Não testa nem instala serviços da Meta. */
export async function toggleMarketingChecklist(planId: string, itemId: string, completed: boolean) {
  const { supabase, profile } = await requireModule('marketing');
  const back = backTo(planId, 'checklist');
  if (!canManageActivity(profile.role)) flash(back, 'err', 'Seu perfil não pode atualizar a preparação.');
  if (!z.string().uuid().safeParse(planId).success || !z.string().uuid().safeParse(itemId).success) {
    flash('/marketing', 'err', 'Identificador de checklist inválido.');
  }
  const { data, error } = await supabase.from('marketing_activities')
    .update({ status: completed ? 'concluido' : 'planejado', updated_at: new Date().toISOString() })
    .eq('id', itemId).eq('plan_id', planId).eq('kind', 'checklist')
    .select('id').maybeSingle();
  if (error || !data) flash(back, 'err', 'Não foi possível atualizar o checklist.');
  revalidatePath('/marketing');
  flash(back, 'ok', completed ? 'Etapa marcada como conferida.' : 'Etapa reaberta.');
}
