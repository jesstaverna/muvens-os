import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { decryptSocialSecret, fetchProviderJson, linkedInHeaders, metaVersion, type SocialPlatform } from '@/lib/social-auth';

type Connection = {id:string;client_id:string;platform:SocialPlatform;remote_id:string;display_name:string;status:string};
type GraphMetric={name:string;values?:Array<{value:number|Record<string,number>}>;total_value?:{value:number|Record<string,number>}};
type GraphInsights={data?:GraphMetric[]};
type GraphMedia={data?:Array<Record<string,unknown>>};
type LinkedInResult={elements?:Array<{totalShareStatistics?:Record<string,number>}>};
type PeriodData={reach:number;impressions:number;engagements:number;profile_visits:number;link_clicks:number;followers:number|null;metric_flags:Record<string,unknown>};
type PostData={external_post_id:string;post_title:string;published_on:string;post_url:string|null;reach:number;views:number;interactions:number;likes:number;comments:number;shares:number;saves:number};
const zero=():PeriodData=>({
  reach:0,impressions:0,engagements:0,profile_visits:0,link_clicks:0,followers:null,metric_flags:{},
});
const count=(v:unknown)=>{
  const n=Number(v);
  return Number.isFinite(n)&&n>=0?Math.round(n):0;
};
const monthWindow=()=>{
  const local=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const [y,m]=local.slice(0,7).split('-').map(Number);
  const start=local.slice(0,7)+'-01';
  const end=new Date(Date.UTC(y,m,0)).toISOString().slice(0,10);
  const cutOff=new Date(Date.UTC(Number(local.slice(0,4)),Number(local.slice(5,7))-1,Number(local.slice(8,10))+1)).toISOString().slice(0,10);
  return {start,end,cutOff};
};
function apiGraph(path:string,token:string,query:Record<string,string>={}) {
  const url=new URL('https://graph.facebook.com/'+metaVersion()+'/'+path.replace(/^\//,''));
  Object.entries(query).forEach(([key,val])=>url.searchParams.set(key,val));
  return fetchProviderJson<any>(url,{headers:{Authorization:'Bearer '+token}});
}
function readMetric(data:GraphInsights,name:string):number|null{
  const row=data.data?.find(r=>r.name===name);
  if(!row)return null;
  const v=row.total_value?.value??row.values?.[0]?.value;
  return typeof v==='number'&&Number.isFinite(v)?count(v):null;
}
async function metaInsight(path:string,metric:string,token:string,query:Record<string,string>):Promise<number|null>{
  try{
    const data=await apiGraph(path,token,{metric,...query}) as GraphInsights;
    return readMetric(data,metric);
  }catch{return null;} // Métricas indisponíveis são explicitamente sinalizadas, nunca inventadas.
}
function parseGraphDate(input:unknown){
  const date=String(input||'').slice(0,10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date)?date:null;
}
async function instagram(conn:Connection,token:string,start:string,cutOff:string):Promise<{period:PeriodData;posts:PostData[];warnings:string[]}>{
  const period=zero(),warnings:string[]=[];
  const dimensions=['reach','total_interactions','profile_views','website_clicks'] as const;
  const results=await Promise.all(dimensions.map(metric=>
    metaInsight(conn.remote_id+'/insights',metric,token,{
      period:'total_over_range',metric_type:'total_value',since:start,until:cutOff,
    })
  ));
  const [reach,interactions,visits,clicks]=results;
  if(reach!==null){period.reach=reach;period.metric_flags.reach=true;}
  else warnings.push('Alcance de Instagram indisponível para o intervalo solicitado.');
  if(interactions!==null){period.engagements=interactions;period.metric_flags.engagements=true;}
  if(visits!==null){period.profile_visits=visits;period.metric_flags.profile_visits=true;}
  if(clicks!==null){period.link_clicks=clicks;period.metric_flags.link_clicks=true;}
  try{
    const profile=await apiGraph(conn.remote_id,token,{fields:'username,followers_count'});
    if(profile.followers_count!==undefined){period.followers=count(profile.followers_count);period.metric_flags.followers=true;}
  }catch{}
  const recent=await apiGraph(conn.remote_id+'/media',token,{fields:'id,caption,timestamp,permalink,like_count,comments_count,media_type',limit:'20'}) as GraphMedia;
  const available=(recent.data??[]).filter(m=>{
    const date=parseGraphDate(m.timestamp);
    return date!==null&&date>=start&&date<cutOff;
  }).slice(0,8);
  const posts=await Promise.all(available.map(async m=>{
    const external_post_id=String(m.id||'');
    const reach=await metaInsight(external_post_id+'/insights','reach',token,{});
    const likes=count(m.like_count),comments=count(m.comments_count);
    const title=String(m.caption||'Publicação no Instagram').replace(/\s+/g,' ').slice(0,180);
    return {
      external_post_id,post_title:title.length>=3?title:'Publicação no Instagram',
      published_on:parseGraphDate(m.timestamp)!,post_url:typeof m.permalink==='string'?m.permalink:null,
      reach:reach??0,views:0,interactions:likes+comments,likes,comments,shares:0,saves:0,
      hasReach:reach!==null,
    };
  }));
  if(!posts.some(p=>p.hasReach))warnings.push('Não foi possível consultar o alcance individual dos posts do Instagram.');
  return {period,posts:posts.map(({hasReach,...post})=>post),warnings};
}
async function facebook(conn:Connection,token:string,start:string,cutOff:string):Promise<{period:PeriodData;posts:PostData[];warnings:string[]}>{
  const period=zero(),warnings=[
    'A Meta descontinuou métricas antigas de alcance da Página. Não foram estimadas pessoas alcançadas a partir de visualizações.',
  ];
  // Interações diárias podem ser somadas; pessoas únicas ao longo de dias NÃO.
  try{
    const insights=await apiGraph(conn.remote_id+'/insights',token,{
      metric:'page_post_engagements',period:'day',since:start,until:cutOff,
    }) as GraphInsights;
    const vals=insights.data?.find(r=>r.name==='page_post_engagements')?.values??[];
    period.engagements=vals.reduce((n,r)=>n+(typeof r.value==='number'?count(r.value):0),0);
    if(vals.length)period.metric_flags.engagements=true;
  }catch{warnings.push('Interações da Página indisponíveis para o período.');}
  const listed=await apiGraph(conn.remote_id+'/posts',token,{
    fields:'id,message,created_time,permalink_url,shares,likes.summary(true),comments.summary(true)',limit:'20',
  }) as GraphMedia;
  const recent=(listed.data??[]).filter(p=>{
    const date=parseGraphDate(p.created_time);
    return date!==null&&date>=start&&date<cutOff;
  }).slice(0,8);
  const posts=await Promise.all(recent.map(async p=>{
    const id=String(p.id||'');
    const uniqueViews=await metaInsight(id+'/insights','post_total_media_view_unique',token,{});
    const likes=count((p.likes as {summary?:{total_count?:number}}|undefined)?.summary?.total_count);
    const comments=count((p.comments as {summary?:{total_count?:number}}|undefined)?.summary?.total_count);
    const shares=count((p.shares as {count?:number}|undefined)?.count);
    const title=String(p.message||'Publicação da Página').replace(/\s+/g,' ').slice(0,180);
    return {
      external_post_id:id,post_title:title.length>=3?title:'Publicação da Página',
      published_on:parseGraphDate(p.created_time)!,
      post_url:typeof p.permalink_url==='string'?p.permalink_url:null,
      reach:0,views:uniqueViews??0,interactions:likes+comments+shares,likes,comments,shares,saves:0,
    };
  }));
  return {period,posts,warnings};
}
async function linkedin(conn:Connection,token:string,start:string,cutOff:string):Promise<{period:PeriodData;posts:PostData[];warnings:string[]}>{
  const period=zero();
  const urn='urn:li:organization:'+conn.remote_id;
  const url=new URL('https://api.linkedin.com/rest/organizationalEntityShareStatistics');
  url.searchParams.set('q','organizationalEntity');
  url.searchParams.set('organizationalEntity',urn);
  const fromMs=Date.parse(start+'T00:00:00Z'),untilMs=Date.parse(cutOff+'T00:00:00Z');
  url.searchParams.set('timeIntervals',
    '(timeRange:(start:'+fromMs+',end:'+untilMs+'),timeGranularityType:MONTH)');
  const result=await fetchProviderJson<LinkedInResult>(url,{headers:linkedInHeaders(token)});
  const stats=result.elements?.[0]?.totalShareStatistics;
  if(!stats)throw new Error('LinkedIn não retornou estatísticas nesta janela.');
  period.impressions=count(stats.impressionCount);
  period.engagements=count(stats.clickCount)+count(stats.likeCount)+count(stats.commentCount)+count(stats.shareCount);
  period.link_clicks=count(stats.clickCount);
  period.metric_flags={impressions:true,engagements:true,link_clicks:true,
    unique_impressions:count(stats.uniqueImpressionsCount),reach:false};
  // Impressões únicas do LinkedIn não equivalem ao alcance de contas IG.
  return {period,posts:[],warnings:['O LinkedIn fornece impressões únicas e não alcance diretamente comparável ao Instagram. Ranking de posts do LinkedIn será habilitado após aprovação de acesso às APIs de conteúdo.']};
}
export type SyncResult={ok:boolean;message:string;warnings?:string[]};
export async function syncOneSocialConnection(id:string):Promise<SyncResult>{
  const admin=createAdminClient();
  const {data:conn,error}=await admin.from('social_connections').select('*').eq('id',id).maybeSingle();
  if(error||!conn)return {ok:false,message:'Conexão não encontrada.'};
  const connection=conn as Connection;
  const {data:secret}=await admin.from('social_connection_secrets').select('*').eq('connection_id',id).maybeSingle();
  if(!secret)return {ok:false,message:'Token não encontrado para esta conexão.'};
  if(secret.expires_at&&Date.parse(secret.expires_at)<=Date.now()){
    await admin.from('social_connections').update({status:'expired',last_error:'Autorização expirada: reconecte a conta.'}).eq('id',id);
    return {ok:false,message:'Autorização expirada. Reconecte a conta em Configurações.'};
  }
  try{
    const token=decryptSocialSecret(secret.token_ciphertext);
    const {start,end,cutOff}=monthWindow();
    const synced=connection.platform==='instagram'
      ?await instagram(connection,token,start,cutOff)
      :connection.platform==='facebook'
        ?await facebook(connection,token,start,cutOff)
        :await linkedin(connection,token,start,cutOff);
    // Não salvar um zero fictício: só persistir quando a rede forneceu ao menos
    // uma métrica confiável, ou posts verificáveis.
    if(!Object.keys(synced.period.metric_flags).length && !synced.posts.length) {
      throw new Error('Nenhuma métrica retornada. Verifique acesso e permissões.');
    }
    const {error:periodError}=await admin.from('social_period_metrics').upsert({
      client_id:connection.client_id,platform:connection.platform,
      period_start:start,period_end:end,...synced.period,
      source:'api',created_by:null,last_synced_at:new Date().toISOString(),
    },{onConflict:'client_id,platform,period_start,period_end'});
    if(periodError)throw new Error('Falha ao gravar o resumo de métricas.');
    for(const p of synced.posts){
      const {error:postError}=await admin.from('social_post_metrics').upsert({
        client_id:connection.client_id,platform:connection.platform,
        ...p,source:'api',created_by:null,
      },{onConflict:'client_id,platform,external_post_id'});
      if(postError)throw new Error('Falha ao registrar posts. Confira o índice unique do banco.');
    }
    await admin.from('social_connections').update({
      status:'connected',last_error:synced.warnings.join(' ').slice(0,700)||null,
      last_sync_at:new Date().toISOString(),updated_at:new Date().toISOString(),
    }).eq('id',id);
    return {ok:true,message:'Sincronização concluída para '+connection.platform+'.',warnings:synced.warnings};
  }catch(e){
    const msg=e instanceof Error?e.message:'Falha ao consultar a rede social.';
    const safe=msg.includes('HTTP ')?msg:'Não foi possível sincronizar: '+msg;
    await admin.from('social_connections').update({status:'error',last_error:safe.slice(0,700)}).eq('id',id);
    return {ok:false,message:safe};
  }
}
export async function syncAllSocialConnections(){
  const admin=createAdminClient();
  const {data,error}=await admin.from('social_connections').select('id').in('status',['connected','error']);
  if(error)throw new Error('Não foi possível consultar as conexões cadastradas.');
  const results:SyncResult[]=[];
  // Limite defensivo para evitar ultrapassar tempo de execução do cron.
  for(const conn of (data??[]).slice(0,6)){
    results.push(await syncOneSocialConnection(conn.id));
  }
  return {total:results.length,ok:results.filter(r=>r.ok).length,failed:results.filter(r=>!r.ok).length};
}
