/** Links de campanha são só parâmetros de rastreamento. Não registram leads por si. */
export function safeCampaignSlug(text: string) {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 100);
}

export type PaidSocialSource = 'instagram' | 'facebook';

export function buildPaidSocialUrl(
  rawBase: string,
  source: PaidSocialSource,
  rawCampaign: string,
  rawContent: string,
): string | null {
  try {
    const url = new URL(rawBase.trim());
    if (!['https:', 'http:'].includes(url.protocol)) return null;
    if (!url.hostname || url.username || url.password) return null;
    const campaign = safeCampaignSlug(rawCampaign);
    const content = safeCampaignSlug(rawContent);
    if (!campaign || !content) return null;
    url.searchParams.set('utm_source', source);
    url.searchParams.set('utm_medium', 'paid_social');
    url.searchParams.set('utm_campaign', campaign);
    url.searchParams.set('utm_content', content);
    // Não encaminha fragmentos de ancoragem como parte do identificador de campanha.
    return url.toString();
  } catch {
    return null;
  }
}

export function monthlyToDaily(monthly: number, days = 30) {
  return days > 0 && Number.isFinite(monthly) && monthly >= 0
    ? Math.round((monthly / days) * 100) / 100
    : null;
}
