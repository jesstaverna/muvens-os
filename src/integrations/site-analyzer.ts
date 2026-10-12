import { analyzeHtml, unreachable, type SiteFindings } from '@/lib/prospecting/analysis';
import { classifyEmail, extractEmails } from '@/lib/prospecting/emails';
import { pickContactLinks } from '@/lib/prospecting/contacts';
import { extractPeople } from '@/lib/prospecting/people';
import { extractWhatsappNumbers } from '@/lib/prospecting/phone';
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

export async function analyzeSite(website: string, opts: SafeFetchOptions & { withPageSpeed?: boolean; deep?: boolean } = {}): Promise<SiteFindings> {
  try {
    const { html, finalUrl } = await safeFetchText(website, opts);
    const f = analyzeHtml(html, finalUrl);
    // páginas de contato/equipe/comercial/compras do próprio site (até 3, mesmo domínio, leitura pública)
    const pages = opts.deep === false ? [] : pickContactLinks(html, finalUrl, 3);
    const extra = await Promise.all(pages.map((u) => safeFetchText(u, { ...opts, timeoutMs: Math.min(opts.timeoutMs ?? 8000, 6000), maxBytes: 600_000 }).then((r) => ({ u, html: r.html })).catch(() => null)));
    const all = [{ u: finalUrl, html }, ...extra.filter((x): x is { u: string; html: string } => !!x)];
    const seen = new Map<string, string>();
    for (const pg of all) for (const e of extractEmails(pg.html)) if (!seen.has(e)) seen.set(e, pg.u);
    f.contacts = [...seen].map(([email, page]) => ({ email, kind: classifyEmail(email), page })).slice(0, 15);
    f.emails = [...seen.keys()].slice(0, 15);
    f.pagesChecked = all.map((x) => x.u);
    const people = [...(f.people ?? [])]; const keys = new Set(people.map((x) => x.role + (x.name ?? x.title).toLowerCase()));
    for (const pg of extra) if (pg) for (const x of extractPeople(pg.html)) { const k = x.role + (x.name ?? x.title).toLowerCase(); if (!keys.has(k)) { keys.add(k); people.push(x); } }
    f.people = people.slice(0, 8);
    f.whatsappNumbers = [...new Set([...(f.whatsappNumbers ?? []), ...extra.flatMap((x) => (x ? extractWhatsappNumbers(x.html) : []))])].slice(0, 5);
    if (opts.withPageSpeed) f.pageSpeedScore = await pageSpeedScore(finalUrl);
    return f;
  } catch (e) { return unreachable(e instanceof Error ? e.message : 'falha'); }
}
