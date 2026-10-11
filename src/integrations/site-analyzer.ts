import { analyzeHtml, unreachable, type SiteFindings } from '@/lib/prospecting/analysis';
import { safeFetchText, type SafeFetchOptions } from './net-safe';

/** PageSpeed Insights (API do Google; chave opcional). Não testado contra a API real nesta entrega. */
export async function pageSpeedScore(url: string, apiKey = process.env.GOOGLE_PAGESPEED_API_KEY): Promise<number | undefined> {
  try {
    const q = new URLSearchParams({ url, strategy: 'mobile', category: 'performance', ...(apiKey ? { key: apiKey } : {}) });
    const res = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${q}`, { signal: AbortSignal.timeout(25_000) });
    if (!res.ok) return undefined;
    const j = (await res.json()) as { lighthouseResult?: { categories?: { performance?: { score?: number } } } };
    const s = j.lighthouseResult?.categories?.performance?.score;
    return typeof s === 'number' ? Math.round(s * 100) : undefined;
  } catch { return undefined; }
}

export async function analyzeSite(website: string, opts: SafeFetchOptions & { withPageSpeed?: boolean } = {}): Promise<SiteFindings> {
  try {
    const { html, finalUrl } = await safeFetchText(website, opts);
    const f = analyzeHtml(html, finalUrl);
    if (opts.withPageSpeed) f.pageSpeedScore = await pageSpeedScore(finalUrl);
    return f;
  } catch (e) { return unreachable(e instanceof Error ? e.message : 'falha'); }
}
