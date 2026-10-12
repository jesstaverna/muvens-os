import { extractEmails } from './emails';
import { extractWhatsappNumbers, whatsappSignal } from './phone';
import { extractPeople, type Person } from './people';

// Análise de presença digital a partir de informações PÚBLICAS (HTML do site). Funções puras, testadas.
// Regra de redação: só afirmamos o que foi observado ("não encontramos X"), nunca inferimos além disso.

export interface SiteFindings {
  reachable: boolean;
  https: boolean;
  finalUrl?: string;
  title?: string;
  hasMetaDescription: boolean;
  hasViewport: boolean;           // sinal de adaptação para celular
  hasWhatsappLink: boolean;
  emails?: string[];              // e-mails comerciais públicos encontrados no site
  whatsappNumbers?: string[];     // números publicados em links de WhatsApp do site
  contacts?: { email: string; kind: string; page?: string }[];  // e-mails públicos achados no site, rotulados por área
  pagesChecked?: string[];
  people?: Person[];              // diretor comercial / direção citados no site
  hasAdsPixel: boolean;           // Meta Pixel / Google Tag / GTM
  hasContactForm: boolean;
  hasFavicon: boolean;
  hasShareImage: boolean;         // og:image
  socials: { instagram?: string; facebook?: string; linkedin?: string; youtube?: string; tiktok?: string };
  pageSpeedScore?: number;        // 0-100 (Google PageSpeed), quando disponível
  error?: string;
}

const absent = (re: RegExp, html: string) => !re.test(html);
const SOCIAL: Record<string, RegExp> = {
  instagram: /https?:\/\/(?:www\.)?instagram\.com\/[A-Za-z0-9._-]+/i,
  facebook: /https?:\/\/(?:www\.|m\.|pt-br\.)?facebook\.com\/[A-Za-z0-9.\-_/]+/i,
  linkedin: /https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/(?:company|in)\/[A-Za-z0-9\-_%]+/i,
  youtube: /https?:\/\/(?:www\.)?youtube\.com\/(?:@|channel\/|c\/|user\/)[A-Za-z0-9\-_]+/i,
  tiktok: /https?:\/\/(?:www\.)?tiktok\.com\/@[A-Za-z0-9._-]+/i,
};

export function analyzeHtml(html: string, finalUrl: string): SiteFindings {
  const socials: SiteFindings['socials'] = {};
  for (const [k, re] of Object.entries(SOCIAL)) { const m = html.match(re); if (m) (socials as Record<string, string>)[k] = m[0].replace(/[/.]+$/, ''); }
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, ' ').trim().slice(0, 160);
  return {
    reachable: true,
    https: /^https:/i.test(finalUrl),
    finalUrl,
    title: title || undefined,
    hasMetaDescription: /<meta[^>]+name=["']description["'][^>]*content=["'][^"']{10,}/i.test(html) || /<meta[^>]+content=["'][^"']{10,}["'][^>]*name=["']description["']/i.test(html),
    hasViewport: /<meta[^>]+name=["']viewport["']/i.test(html),
    emails: extractEmails(html),
    whatsappNumbers: extractWhatsappNumbers(html),
    people: extractPeople(html),
    hasWhatsappLink: /(wa\.me\/|api\.whatsapp\.com\/send|web\.whatsapp\.com\/send|whatsapp:\/\/send)/i.test(html),
    hasAdsPixel: /(fbq\(|connect\.facebook\.net\/[^"']*fbevents|googletagmanager\.com\/(gtm|gtag)|gtag\(|google-analytics\.com\/(analytics|ga)|googleadservices\.com)/i.test(html),
    hasContactForm: /<form[\s>]/i.test(html) && /(type=["']email["']|name=["'](email|e-mail|mensagem|message|telefone|phone)["'])/i.test(html),
    hasFavicon: /<link[^>]+rel=["'][^"']*icon[^"']*["']/i.test(html),
    hasShareImage: /<meta[^>]+property=["']og:image["']/i.test(html),
    socials,
  };
}

export const unreachable = (error: string): SiteFindings => ({ reachable: false, https: false, hasMetaDescription: false, hasViewport: false, hasWhatsappLink: false, hasAdsPixel: false, hasContactForm: false, hasFavicon: false, hasShareImage: false, socials: {}, error });

export type ServiceKey = 'site_institucional' | 'landing_page' | 'redes_sociais' | 'trafego_pago' | 'branding' | 'design_posts' | 'consultoria' | 'rd_marketing' | 'rd_conversas' | 'automacao' | 'ia_aplicada';

export interface ScoreInput {
  hasWebsite: boolean;
  site?: SiteFindings | null;
  rating?: number | null;
  reviews?: number | null;
  /** Alcance: quando informado, entra na pontuação (quem dá para contatar vale mais como oportunidade). */
  contact?: { email?: string | null; phone?: string | null };
}
export interface Scored { score: number; service: ServiceKey; reasons: string[]; observations: string[]; need: number; buckets: { site: number; social: number; ads: number; brand: number; convert: number }; contactBonus: number; contactReasons: string[] }

/** Bônus (até +17) ou penalidade (-10) pela facilidade de abordar o prospecto. Não altera o serviço sugerido nem as observações mostradas ao cliente. */
export function contactAdjustment(site: SiteFindings | null | undefined, c: { email?: string | null; phone?: string | null }): { points: number; reasons: string[] } {
  const reasons: string[] = []; let points = 0;
  const wa = whatsappSignal(c.phone, site?.whatsappNumbers ?? []); const hasWa = wa.level === 'confirmado' || wa.level === 'provavel' || wa.level === 'outro';
  const hasPhone = !!c.phone && c.phone.replace(/\D/g, '').length >= 8;
  if (c.email) { points += 6; reasons.push('Tem e-mail para contato (+6)'); }
  if (hasPhone) { points += 2; reasons.push('Tem telefone para ligação (+2)'); }
  if (hasWa) { points += 5; reasons.push(wa.level === 'provavel' ? 'WhatsApp provável (+5)' : 'WhatsApp publicado no site (+5)'); }
  if (site?.people?.length) { points += 2; reasons.push('Decisor citado no site (+2)'); }
  if (site?.socials.linkedin) { points += 2; reasons.push('LinkedIn encontrado (+2)'); }
  if (!c.email && !hasPhone) { points -= 10; reasons.push('Sem e-mail nem telefone: difícil de abordar (-10)'); }
  return { points, reasons };
}

/**
 * Pontuação de oportunidade (0-100): quanto maior, mais espaço para nossos serviços.
 * Pesos são heurísticas editáveis, não estatística — calibre com seus resultados reais.
 */
export function scoreProspect({ hasWebsite, site, rating, reviews, contact }: ScoreInput): Scored {
  let score = 0; const reasons: string[] = []; const obs: string[] = []; const need = { site: 0, social: 0, ads: 0, brand: 0, convert: 0 };
  const add = (pts: number, bucket: keyof typeof need, reason: string, observation: string) => { score += pts; need[bucket] += pts; reasons.push(reason); obs.push(observation); };

  if (!hasWebsite) add(45, 'site', 'Sem site', 'Não encontramos um site da empresa');
  else if (!site || !site.reachable) add(30, 'site', 'Site fora do ar ou inacessível', 'Não conseguimos acessar o site no momento da análise');
  else {
    if (!site.https) add(12, 'site', 'Site sem HTTPS', 'O site abre sem conexão segura (HTTPS)');
    if (!site.hasViewport) add(15, 'site', 'Sem adaptação para celular', 'Não encontramos a configuração de adaptação para celular no site');
    if (!site.hasWhatsappLink) add(8, 'convert', 'Sem WhatsApp no site', 'Não encontramos botão ou link de WhatsApp no site');
    if (!site.hasContactForm) add(4, 'convert', 'Sem formulário de contato', 'Não encontramos formulário de contato no site');
    if (!site.hasAdsPixel) add(8, 'ads', 'Sem pixel/tag de anúncios', 'Não encontramos pixel de anúncios (Meta/Google) nem Tag Manager no site');
    if (!site.hasMetaDescription) add(4, 'site', 'Sem meta descrição', 'O site não tem descrição para o Google (meta description)');
    if (!site.hasShareImage || !site.hasFavicon) add(5, 'brand', 'Poucos elementos de marca no site', 'O site não define ' + [!site.hasFavicon && 'ícone da aba (favicon)', !site.hasShareImage && 'imagem de compartilhamento'].filter(Boolean).join(' nem '));
    if (typeof site.pageSpeedScore === 'number' && site.pageSpeedScore < 50) add(10, 'site', 'Site lento (PageSpeed < 50)', `A nota de velocidade no celular (PageSpeed) foi ${site.pageSpeedScore}/100`);
  }
  if (!site || !site.reachable || Object.keys(site.socials).length === 0) add(10, 'social', 'Sem redes sociais encontradas', hasWebsite && site?.reachable ? 'Não encontramos links de redes sociais no site' : 'Não encontramos redes sociais ligadas ao site');
  if (typeof reviews === 'number' && reviews < 15) add(4, 'brand', 'Poucas avaliações no Google', `Há poucas avaliações no Google (${reviews})`);
  if (typeof rating === 'number' && rating < 4 && (reviews ?? 0) >= 5) add(4, 'brand', 'Nota baixa no Google', `A nota no Google é ${rating.toFixed(1).replace('.', ',')}`);

  score = Math.min(score, 100); const need0 = score;
  const adj = contact ? contactAdjustment(site, contact) : { points: 0, reasons: [] as string[] };
  score = Math.max(0, Math.min(100, score + adj.points));
  const top = (Object.entries(need).sort((a, b) => b[1] - a[1])[0] ?? ['site', 0]) as [keyof typeof need, number];
  const service: ServiceKey = top[1] === 0 ? 'branding' : ({ site: hasWebsite ? 'site_institucional' : 'site_institucional', social: 'redes_sociais', ads: 'trafego_pago', brand: 'branding', convert: 'landing_page' } as const)[top[0]];
  return { score, service, reasons, observations: obs, need: need0, buckets: { ...need }, contactBonus: adj.points, contactReasons: adj.reasons };
}
