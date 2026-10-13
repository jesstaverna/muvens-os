/**
 * Endereço público do sistema (links de e-mails, landings e descadastro).
 * Usa NEXT_PUBLIC_APP_URL; se faltar, usa o domínio de produção que a própria Vercel informa. Vazio = não foi possível descobrir.
 */
export function appUrl(): string {
  const env = (process.env.NEXT_PUBLIC_APP_URL ?? '').trim().replace(/\/$/, '');
  if (/^https?:\/\//i.test(env)) return env;
  const host = (process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || '').trim().replace(/^https?:\/\//i, '').replace(/\/$/, '');
  return host ? `https://${host}` : '';
}
export const isValidAppUrl = (u: string) => /^https?:\/\/[^\s/]+/i.test(u);
