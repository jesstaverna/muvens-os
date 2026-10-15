// Formulário público do site da Muvens (Lovable) → Muvens OS. Sem segredo no navegador: proteção por origem permitida, campo-armadilha, tempo mínimo e limite por IP.

const DEFAULT_ORIGINS = ['https://muvensagencia.com.br', 'https://www.muvensagencia.com.br'];
const PREVIEW = /^https:\/\/[a-z0-9-]+\.(lovable\.app|lovableproject\.com|lovable\.dev)$/i;   // prévias do Lovable, para testar antes de publicar

export function allowedOrigin(origin: string | null | undefined, env = process.env.PUBLIC_FORM_ORIGINS): string | null {
  if (!origin) return null;
  const list = [...DEFAULT_ORIGINS, ...(env ?? '').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean)];
  return list.includes(origin) || PREVIEW.test(origin) ? origin : null;
}

const PLATFORM: [RegExp, string][] = [[/insta|^ig$/i, 'Instagram'], [/face|^fb$|meta/i, 'Facebook'], [/google|gads|adwords/i, 'Google'], [/tiktok/i, 'TikTok'], [/linkedin/i, 'LinkedIn'], [/whats|^wa$/i, 'WhatsApp']];
/** Origem do lead a partir dos parâmetros do link do anúncio. */
export function sourceFromUtm(source?: string | null, medium?: string | null): string {
  const s = (source ?? '').trim(), m = (medium ?? '').trim();
  const name = PLATFORM.find(([re]) => re.test(s))?.[1] ?? (s ? s.slice(0, 40) : '');
  if (!name) return 'Site muvensagencia.com.br';
  return /cpc|paid|ads?|anuncio|patrocin/i.test(m) ? `${name} Ads` : `${name} (link)`;
}

const hits = new Map<string, number[]>();
/** Limite simples por IP (melhor esforço em ambiente serverless): `max` envios por janela. */
export function rateLimited(ip: string, now = Date.now(), max = 6, windowMs = 10 * 60_000): boolean {
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= max) { hits.set(ip, arr); return true; }
  arr.push(now); hits.set(ip, arr); if (hits.size > 5000) hits.clear();
  return false;
}
export const _resetRateLimit = () => hits.clear();
