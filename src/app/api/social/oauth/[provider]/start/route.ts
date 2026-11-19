import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { linkedinOAuthUrl, metaOAuthUrl, providerIsConfigured, requireSocialAdmin, socialBaseUrl, type SocialProvider } from '@/lib/social-auth';

export const dynamic='force-dynamic';
const isProvider=(value:string):value is SocialProvider => value==='meta'||value==='linkedin';
export async function GET(req:NextRequest,{params}:{params:Promise<{provider:string}>}){
  const {provider}=await params;
  if(!isProvider(provider)) return NextResponse.json({error:'invalid_provider'},{status:404});
  const session=await requireSocialAdmin();
  if(!session)return NextResponse.redirect(new URL('/login',req.url));
  try{
    const expected=socialBaseUrl();
    if(req.nextUrl.origin!==expected){
      return NextResponse.redirect(new URL('/configuracoes/redes?err=Use%20o%20dominio%20oficial%20configurado',expected));
    }
    if(!providerIsConfigured(provider))throw new Error('Credenciais de '+provider+' ainda não foram configuradas.');
    const state=randomBytes(32).toString('hex');
    const target=provider==='meta'?metaOAuthUrl(state):linkedinOAuthUrl(state);
    const response=NextResponse.redirect(target);
    response.cookies.set('muvens_social_state_'+provider,state,{
      httpOnly:true,secure:expected.startsWith('https:'),sameSite:'lax',path:'/api/social/oauth/'+provider,
      maxAge:600,
    });
    return response;
  }catch(e){
    const message=e instanceof Error?e.message:'Não foi possível iniciar a conexão.';
    return NextResponse.redirect(new URL('/configuracoes/redes?err='+encodeURIComponent(message),req.url));
  }
}
