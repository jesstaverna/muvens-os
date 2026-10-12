// Páginas públicas do próprio site onde empresas costumam publicar contatos (contato, equipe, sobre, comercial, compras…).
const KEYWORDS = /(contato|contact|fale-?conosco|equipe|time|quem-?somos|sobre|institucional|diretoria|comercial|vendas|compras|fornecedor|suprimentos|trabalhe|atendimento|orcamento|representante)/i;
const SKIP = /\.(png|jpe?g|gif|webp|svg|pdf|zip|css|js|ico|mp4)(\?|$)/i;

/** Links do mesmo domínio que provavelmente têm contatos. No máximo `max`, priorizando contato/comercial/compras/equipe. */
export function pickContactLinks(html: string, baseUrl: string, max = 3): string[] {
  let base: URL; try { base = new URL(baseUrl); } catch { return []; }
  const host = base.hostname.replace(/^www\./, '');
  const out: { url: string; w: number }[] = []; const seen = new Set<string>([base.pathname.replace(/\/$/, '') || '/']);
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["']/gi)) {
    let u: URL; try { u = new URL(m[1], base); } catch { continue; }
    if (!/^https?:$/.test(u.protocol) || u.hostname.replace(/^www\./, '') !== host || SKIP.test(u.pathname) || !KEYWORDS.test(u.pathname)) continue;
    const key = u.pathname.replace(/\/$/, '') || '/'; if (seen.has(key)) continue; seen.add(key);
    const w = /(comercial|vendas|compras|suprimentos|fornecedor|orcamento)/i.test(u.pathname) ? 3 : /(contato|contact|fale)/i.test(u.pathname) ? 2 : 1;
    out.push({ url: u.origin + u.pathname + u.search, w });
  }
  return out.sort((a, b) => b.w - a.w).slice(0, max).map((x) => x.url);
}
