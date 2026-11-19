'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { flash, requireModule } from '@/lib/session';

const PATH='/social-insights';
const platforms=z.enum(['instagram','facebook','linkedin']);
const nonNegative=z.coerce.number().int().min(0).max(100_000_000_000);
const text=(fd:FormData,key:string)=>String(fd.get(key)??'').trim();
const integer=(fd:FormData,key:string)=>{
  const raw=text(fd,key);
  return nonNegative.safeParse(raw===''?0:raw);
};
function monthDates(value:string) {
  const match=/^(\d{4})-(0[1-9]|1[0-2])$/.exec(value);
  if(!match)return null;
  const year=Number(match[1]), month=Number(match[2]);
  if(year<2020||year>2100)return null;
  return { start:value+'-01',end:new Date(Date.UTC(year,month,0)).toISOString().slice(0,10) };
}
async function muvensClient(){
  const {supabase,profile}=await requireModule('social-insights');
  const {data,error}=await supabase.from('clients').select('id').eq('name','MUVENS').maybeSingle();
  if(error||!data) flash(PATH,'err','Cadastre o cliente interno MUVENS antes de registrar resultados.');
  return {supabase,profile,clientId:data.id as string};
}

/** Resultados coletados manualmente nos relatórios da plataforma, sem estimativas. */
export async function saveSocialPeriod(fd:FormData){
  const {supabase,profile,clientId}=await muvensClient();
  const platform=platforms.safeParse(text(fd,'platform'));
  const month=monthDates(text(fd,'month'));
  if(!platform.success||!month) flash(PATH,'err','Selecione uma rede e um mês válidos.');
  const fields=['reach','impressions','engagements','profile_visits','link_clicks','followers'] as const;
  const values:Record<string,number|null>={};
  for(const k of fields){
    if(k==='followers'&&text(fd,k)===''){values[k]=null;continue;}
    const n=integer(fd,k);
    if(!n.success)flash(PATH,'err','Informe uma quantidade válida para '+k+'.');
    values[k]=n.data;
  }
  const {error}=await supabase.from('social_period_metrics').upsert({
    client_id:clientId,platform:platform.data,period_start:month.start,period_end:month.end,
    reach:values.reach,impressions:values.impressions,engagements:values.engagements,
    profile_visits:values.profile_visits,link_clicks:values.link_clicks,followers:values.followers,
    source:'manual',created_by:profile.id,updated_at:new Date().toISOString(),
  },{onConflict:'client_id,platform,period_start,period_end'});
  if(error)flash(PATH,'err','Não foi possível salvar o resumo. Verifique as permissões.');
  revalidatePath('/inicio');revalidatePath(PATH);
  flash(PATH+'?m='+month.start.slice(0,7),'ok','Resultados mensais registrados.');
}

export async function saveSocialPost(fd:FormData){
  const {supabase,profile,clientId}=await muvensClient();
  const platform=platforms.safeParse(text(fd,'platform'));
  const post_title=text(fd,'post_title').slice(0,220);
  const published_on=text(fd,'published_on');
  const validDate=/^\d{4}-\d{2}-\d{2}$/.test(published_on) &&
    !Number.isNaN(Date.parse(published_on)) && published_on<='2100-12-31';
  if(!platform.success||post_title.length<3||!validDate)flash(PATH,'err','Preencha rede, título e data da publicação.');
  let post_url:string|null=text(fd,'post_url')||null;
  if(post_url){
    try{
      const u=new URL(post_url);
      if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw Error('invalid');
      post_url=u.toString();
    }catch{flash(PATH,'err','O link do post precisa ser um endereço HTTPS válido.');}
  }
  const fields=['reach','views','interactions','likes','comments','shares','saves'] as const;
  const values:Record<string,number>={};
  for(const k of fields){
    const n=integer(fd,k);
    if(!n.success)flash(PATH,'err','Quantidade inválida para '+k+'.');
    values[k]=n.data;
  }
  const {error}=await supabase.from('social_post_metrics').insert({
    client_id:clientId,platform:platform.data,post_title,published_on,post_url,
    ...values,source:'manual',created_by:profile.id,
  });
  if(error)flash(PATH,'err','Não foi possível salvar a publicação.');
  revalidatePath('/inicio');revalidatePath(PATH);
  flash(PATH,'ok','Publicação registrada para o ranking de desempenho.');
}

export async function deleteSocialPost(id:string){
  const {supabase,clientId}=await muvensClient();
  if(!/^[a-f0-9-]{36}$/i.test(id))flash(PATH,'err','Publicação inválida.');
  const {error}=await supabase.from('social_post_metrics').delete().eq('id',id).eq('client_id',clientId);
  if(error)flash(PATH,'err','Não foi possível excluir a publicação.');
  revalidatePath('/inicio');revalidatePath(PATH);
  flash(PATH,'ok','Publicação excluída.');
}
