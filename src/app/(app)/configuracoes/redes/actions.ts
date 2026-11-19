'use server';
import { revalidatePath } from 'next/cache';
import { flash } from '@/lib/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { decryptSocialSecret, fetchProviderJson, getMetaPages, linkedInHeaders, muvensClientId, putSocialConnection, requireSocialAdmin } from '@/lib/social-auth';
import { syncOneSocialConnection } from '@/lib/social-sync';

const ROOT='/configuracoes/redes';
type OAuthToken={token:string;tokenExpiresAt:string|null};
const uuid=(v:string)=>/^[0-9a-f-]{36}$/i.test(v);
async function pending(id:string,provider:'meta'|'linkedin'){
  const session=await requireSocialAdmin();
  if(!session)flash('/login','err','Entre como administrador.');
  if(!uuid(id))flash(ROOT,'err','Solicitação inválida.');
  const admin=createAdminClient();
  const {data,error}=await admin.from('social_oauth_pending').select('*')
    .eq('id',id).eq('provider',provider).eq('created_by',session!.profile.id)
    .gt('expires_at',new Date().toISOString()).maybeSingle();
  if(error||!data)flash(ROOT,'err','A autorização expirou. Reconecte a conta.');
  const parsed=JSON.parse(decryptSocialSecret(data!.token_ciphertext)) as OAuthToken;
  if(!parsed.token)flash(ROOT,'err','Autorização inválida.');
  return {session:session!,admin,pendingId:id,auth:parsed};
}
export async function finishMetaConnection(fd:FormData){
  const id=String(fd.get('pending')??'');
  const chosen=String(fd.get('page_id')??'');
  const {session,admin,auth}=await pending(id,'meta');
  let pages;
  try{pages=await getMetaPages(auth.token);}catch{flash(ROOT+'?pending='+id,'err','Não foi possível consultar suas Páginas. Confira as permissões.');}
  const page=pages!.find(p=>p.id===chosen);
  if(!page)flash(ROOT+'?pending='+id,'err','Selecione uma das Páginas autorizadas.');
  try{
    const clientId=await muvensClientId();
    await putSocialConnection({clientId,platform:'facebook',remoteId:page!.id,
      displayName:page!.name,token:page!.access_token,userId:session.profile.id});
    if(page!.instagram_business_account?.id){
      await putSocialConnection({clientId,platform:'instagram',remoteId:page!.instagram_business_account!.id,
        displayName:page!.instagram_business_account.username||'Instagram conectado à '+page!.name,
        token:page!.access_token,userId:session.profile.id});
    }
    await admin.from('social_oauth_pending').delete().eq('id',id);
    revalidatePath(ROOT);
    flash(ROOT,'ok',page!.instagram_business_account?.id
      ? 'Facebook e Instagram autorizados. Execute a primeira sincronização.'
      : 'Facebook autorizado. Vincule uma conta profissional do Instagram à Página para incluí-lo.');
  }catch{flash(ROOT,'err','Falha ao salvar a conta. Verifique os parâmetros do servidor.');}
}
export async function finishLinkedInConnection(fd:FormData){
  const id=String(fd.get('pending')??'');
  const orgId=String(fd.get('organization_id')??'').trim();
  const name=String(fd.get('display_name')??'').trim().slice(0,120);
  const {session,admin,auth}=await pending(id,'linkedin');
  if(!/^\d{3,20}$/.test(orgId))flash(ROOT+'?pending='+id,'err','Informe o ID numérico da página empresarial do LinkedIn.');
  if(name.length<2)flash(ROOT+'?pending='+id,'err','Informe o nome da página empresarial.');
  try {
    const url=new URL('https://api.linkedin.com/rest/organizationalEntityShareStatistics');
    url.searchParams.set('q','organizationalEntity');
    url.searchParams.set('organizationalEntity','urn:li:organization:'+orgId);
    await fetchProviderJson(url,{headers:linkedInHeaders(auth.token)});
    const clientId=await muvensClientId();
    await putSocialConnection({
      clientId,platform:'linkedin',remoteId:orgId,displayName:name,
      token:auth.token,tokenExpiresAt:auth.tokenExpiresAt,userId:session.profile.id,
    });
    await admin.from('social_oauth_pending').delete().eq('id',id);
    revalidatePath(ROOT);
    flash(ROOT,'ok','Página LinkedIn autorizada. Execute a primeira sincronização.');
  }catch{flash(ROOT+'?pending='+id,'err','Não foi possível validar a página. Confira o ID, sua função de administrador e as permissões aprovadas pelo LinkedIn.');}
}
export async function disconnectSocialConnection(id:string){
  const session=await requireSocialAdmin();
  if(!session)flash('/login','err','Entre como administrador.');
  if(!uuid(id))flash(ROOT,'err','Conexão inválida.');
  const admin=createAdminClient();
  const clientId=await muvensClientId();
  const {error}=await admin.from('social_connections').delete().eq('id',id).eq('client_id',clientId);
  if(error)flash(ROOT,'err','Não foi possível desconectar.');
  revalidatePath(ROOT);revalidatePath('/inicio');
  flash(ROOT,'ok','Conta desconectada. Os relatórios históricos foram preservados.');
}
export async function syncSocialConnectionNow(id:string) {
  const session=await requireSocialAdmin();
  if(!session)flash('/login','err','Entre como administrador.');
  if(!uuid(id))flash(ROOT,'err','Conexão inválida.');
  const admin=createAdminClient();
  const clientId=await muvensClientId();
  const {data}=await admin.from('social_connections').select('id').eq('id',id).eq('client_id',clientId).maybeSingle();
  if(!data)flash(ROOT,'err','Conexão não encontrada.');
  const result=await syncOneSocialConnection(id);
  revalidatePath(ROOT);revalidatePath('/inicio');revalidatePath('/social-insights');
  flash(ROOT,result.ok?'ok':'err',result.message);
}
