import 'server-only';

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';

export type SocialProvider = 'meta' | 'linkedin';
export type SocialPlatform = 'instagram' | 'facebook' | 'linkedin';

export function socialBaseUrl() {
  const value = process.env.SOCIAL_OAUTH_BASE_URL?.trim().replace(/\/+$/,'');
  if (!value) throw new Error('Configure SOCIAL_OAUTH_BASE_URL no servidor antes de conectar redes sociais.');
  const url = new URL(value);
  if (!(url.protocol === 'https:' || (url.protocol === 'http:' && url.hostname === 'localhost'))) {
    throw new Error('SOCIAL_OAUTH_BASE_URL precisa ser HTTPS (exceto localhost).');
  }
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('SOCIAL_OAUTH_BASE_URL deve conter somente origem e domínio, sem caminhos.');
  }
  return url.origin;
}
export function socialCallback(provider: SocialProvider) {
  return socialBaseUrl() + '/api/social/oauth/' + provider + '/callback';
}
export function providerIsConfigured(provider: SocialProvider) {
  return provider === 'meta'
    ? Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET && process.env.SOCIAL_TOKEN_ENCRYPTION_KEY && process.env.SOCIAL_OAUTH_BASE_URL)
    : Boolean(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET && process.env.SOCIAL_TOKEN_ENCRYPTION_KEY && process.env.SOCIAL_OAUTH_BASE_URL);
}
export function metaVersion() {
  const v = process.env.META_GRAPH_VERSION ?? 'v25.0';
  if (!/^v\d{1,2}\.\d{1,2}$/.test(v)) throw new Error('META_GRAPH_VERSION inválida.');
  return v;
}
export function linkedinVersion() {
  const v = process.env.LINKEDIN_API_VERSION ?? '202609';
  if (!/^\d{6}$/.test(v)) throw new Error('LINKEDIN_API_VERSION inválida.');
  return v;
}

function key(): Buffer {
  const v = process.env.SOCIAL_TOKEN_ENCRYPTION_KEY;
  if (!v) throw new Error('SOCIAL_TOKEN_ENCRYPTION_KEY não configurada.');
  const bytes = Buffer.from(v, 'base64');
  if (bytes.length !== 32) throw new Error('SOCIAL_TOKEN_ENCRYPTION_KEY deve ser Base64 de 32 bytes.');
  return bytes;
}
export function encryptSocialSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.');
}
export function decryptSocialSecret(ciphertext: string): string {
  const [version, nonce, tag, data, extra] = ciphertext.split('.');
  if (version !== 'v1' || !nonce || !tag || !data || extra) throw new Error('Token armazenado inválido.');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(nonce, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
}

export async function requireSocialAdmin() {
  const { getSession } = await import('@/lib/session');
  const session = await getSession();
  if (!session || !session.profile.active || session.profile.role !== 'admin') return null;
  return session;
}

export type MetaPage = { id: string; name: string; access_token: string;
  instagram_business_account?: { id:string; username?:string } };
type MetaPages = { data?:MetaPage[]; paging?:{next?:string};error?:unknown };

export async function getMetaPages(userToken:string): Promise<MetaPage[]> {
  const url = new URL('https://graph.facebook.com/' + metaVersion() + '/me/accounts');
  url.searchParams.set('fields','id,name,access_token,instagram_business_account{id,username}');
  url.searchParams.set('limit','100');
  const data = await fetchProviderJson<MetaPages>(url,{headers:{Authorization:'Bearer '+userToken}});
  return (data.data ?? []).filter(p=>/^\d+$/.test(p.id) && Boolean(p.access_token));
}
export function metaOAuthUrl(state:string) {
  const params=new URLSearchParams({
    client_id:process.env.META_APP_ID!,redirect_uri:socialCallback('meta'),
    state,response_type:'code',
    scope:'pages_show_list,pages_read_engagement,read_insights,instagram_basic,instagram_manage_insights',
  });
  return 'https://www.facebook.com/' + metaVersion() + '/dialog/oauth?' + params;
}
export function linkedinOAuthUrl(state:string) {
  const params=new URLSearchParams({
    response_type:'code', client_id:process.env.LINKEDIN_CLIENT_ID!,
    redirect_uri:socialCallback('linkedin'),state,
    scope:'r_organization_admin rw_organization_admin r_organization_social',
  });
  return 'https://www.linkedin.com/oauth/v2/authorization?' + params;
}

export async function fetchProviderJson<T>(url: URL | string, init:RequestInit={}):Promise<T> {
  const res=await fetch(url,{...init,cache:'no-store',signal:AbortSignal.timeout(12_000)});
  if (!res.ok) {
    // Não registrar o corpo bruto: provedores podem incluir tokens e dados pessoais.
    throw new Error('A API da rede social retornou HTTP '+res.status+'. Verifique permissões, token ou limites.');
  }
  return await res.json() as T;
}
export function linkedInHeaders(token:string) {
  return {
    Authorization:'Bearer '+token,
    'Linkedin-Version':linkedinVersion(),
    'X-Restli-Protocol-Version':'2.0.0',
    Accept:'application/json',
  };
}
export async function muvensClientId() {
  const admin=createAdminClient();
  const {data,error}=await admin.from('clients').select('id').eq('name','MUVENS').maybeSingle();
  if(error||!data) throw new Error('O cadastro interno MUVENS não foi encontrado.');
  return data.id as string;
}
export async function putSocialConnection(args:{
  clientId:string; platform:SocialPlatform; remoteId:string; displayName:string;token:string;
  tokenExpiresAt?:string|null; userId:string;
}) {
  const admin=createAdminClient();
  const {data,error}=await admin.from('social_connections').upsert({
    client_id:args.clientId,platform:args.platform,remote_id:args.remoteId,
    display_name:args.displayName,status:'connected',last_error:null,
    created_by:args.userId,updated_at:new Date().toISOString(),
  },{onConflict:'client_id,platform'}).select('id').single();
  if(error||!data)throw new Error('Não foi possível registrar a conta '+args.platform+'.');
  const {error:secretError}=await admin.from('social_connection_secrets').upsert({
    connection_id:data.id,token_ciphertext:encryptSocialSecret(args.token),
    expires_at:args.tokenExpiresAt??null,updated_at:new Date().toISOString(),
  });
  if(secretError){
    // Nunca deixar uma conta marcada conectada sem credencial funcional.
    await admin.from('social_connections').update({status:'error',last_error:'Falha ao proteger o token.'}).eq('id',data.id);
    throw new Error('Não foi possível armazenar as credenciais com segurança.');
  }
}
