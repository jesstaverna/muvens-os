import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  encryptSocialSecret, fetchProviderJson, providerIsConfigured,
  requireSocialAdmin, socialBaseUrl, socialCallback, type SocialProvider,
} from '@/lib/social-auth';

export const dynamic='force-dynamic';
export const maxDuration=30;
const isProvider=(v:string):v is SocialProvider => v==='meta'||v==='linkedin';
type Token={access_token:string;expires_in?:number};
function safeEq(a:string,b:string) {
  const x=Buffer.from(a),y=Buffer.from(b);
  return x.length===y.length&&x.length===64&&timingSafeEqual(x,y);
}
function outcome(base:string,kind:'ok'|'err',message:string){
  return NextResponse.redirect(new URL('/configuracoes/redes?'+kind+'='+encodeURIComponent(message),base));
}
export async function GET(req:NextRequest,{params}:{params:Promise<{provider:string}>}){
  const {provider}=await params;
  if(!isProvider(provider))return NextResponse.json({error:'invalid_provider'},{status:404});
  const session=await requireSocialAdmin();
  if(!session)return NextResponse.redirect(new URL('/login',req.url));
  let base:string;
  try{base=socialBaseUrl();}catch{return NextResponse.json({error:'base_url_not_configured'},{status:503});}
  const state=req.nextUrl.searchParams.get('state')||'';
  const stored=req.cookies.get('muvens_social_state_'+provider)?.value||'';
  if(!safeEq(state,stored))return outcome(base,'err','Autorização expirada ou inválida. Recomece a conexão.');
  const responseCookie='muvens_social_state_'+provider;
  const error=req.nextUrl.searchParams.get('error');
  if(error){
    const r=outcome(base,'err','A autorização foi cancelada ou recusada pela plataforma.');
    r.cookies.delete(responseCookie);
    return r;
  }
  const code=req.nextUrl.searchParams.get('code');
  if(!code||!providerIsConfigured(provider))return outcome(base,'err','A conexão não foi concluída: código ou credenciais ausentes.');
  try{
    let token:Token;
    if(provider==='meta'){
      const url=new URL('https://graph.facebook.com/'+(process.env.META_GRAPH_VERSION||'v25.0')+'/oauth/access_token');
      url.searchParams.set('client_id',process.env.META_APP_ID!);
      url.searchParams.set('client_secret',process.env.META_APP_SECRET!);
      url.searchParams.set('redirect_uri',socialCallback('meta'));
      url.searchParams.set('code',code);
      const short=await fetchProviderJson<Token>(url);
      const longUrl=new URL('https://graph.facebook.com/'+(process.env.META_GRAPH_VERSION||'v25.0')+'/oauth/access_token');
      longUrl.searchParams.set('grant_type','fb_exchange_token');
      longUrl.searchParams.set('client_id',process.env.META_APP_ID!);
      longUrl.searchParams.set('client_secret',process.env.META_APP_SECRET!);
      longUrl.searchParams.set('fb_exchange_token',short.access_token);
      token=await fetchProviderJson<Token>(longUrl);
    }else{
      const body=new URLSearchParams({
        grant_type:'authorization_code',code,redirect_uri:socialCallback('linkedin'),
        client_id:process.env.LINKEDIN_CLIENT_ID!,client_secret:process.env.LINKEDIN_CLIENT_SECRET!,
      });
      token=await fetchProviderJson<Token>('https://www.linkedin.com/oauth/v2/accessToken',{
        method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body,
      });
    }
    if(!token.access_token)throw new Error('Token ausente na resposta.');
    const tokenExpiresAt=token.expires_in
      ? new Date(Date.now()+Number(token.expires_in)*1000).toISOString():null;
    const admin=createAdminClient();
    const {data,error:dbError}=await admin.from('social_oauth_pending').insert({
      provider,created_by:session.profile.id,
      token_ciphertext:encryptSocialSecret(JSON.stringify({token:token.access_token,tokenExpiresAt})),
      expires_at:new Date(Date.now()+15*60_000).toISOString(),
    }).select('id').single();
    if(dbError||!data)throw new Error('Falha ao guardar a autorização temporária.');
    const redirect=NextResponse.redirect(new URL('/configuracoes/redes?pending='+data.id,base));
    redirect.cookies.delete(responseCookie);
    return redirect;
  }catch{
    const r=outcome(base,'err','Não foi possível concluir a autorização. Confira permissões e URLs no aplicativo oficial.');
    r.cookies.delete(responseCookie);
    return r;
  }
}
