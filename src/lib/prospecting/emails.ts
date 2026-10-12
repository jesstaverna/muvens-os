// E-mails comerciais PÚBLICOS encontrados no site da própria empresa (links mailto: e e-mails escritos na página).

const BAD_LOCAL = /^(noreply|no-reply|donotreply|do-not-reply|mailer-daemon|postmaster|abuse|webmaster|root|admin@wix|sentry|example|test|teste|seu|seuemail|email|nome|usuario|user|name|info@example)$/i;
const BAD_DOMAIN = /(example\.|sentry\.|wixpress\.|wix\.com|sentry-next|domain\.com|email\.com|seudominio|yourdomain|schema\.org|w3\.org|googleusercontent|gstatic|cloudflare|godaddy|squarespace|shopify)/i;
const IMG_SUFFIX = /\.(png|jpe?g|gif|webp|svg|css|js)$/i;
// ordem de preferência para o 1º contato comercial (mais genérico/comercial primeiro)
const PREFERRED = ['contato', 'comercial', 'atendimento', 'vendas', 'orcamento', 'orcamentos', 'marketing', 'fale', 'ola', 'oi', 'info', 'clinica', 'escritorio', 'administrativo', 'adm', 'secretaria', 'recepcao', 'financeiro'];

export function extractEmails(html: string): string[] {
  const found = new Set<string>();
  const text = html.replace(/&#64;|&commat;|\[at\]|\(at\)/gi, '@');
  for (const m of text.matchAll(/mailto:([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi)) found.add(m[1].toLowerCase());
  for (const m of text.matchAll(/[A-Z0-9._%+-]{2,}@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,}/gi)) found.add(m[0].toLowerCase());
  return [...found].filter((e) => { const [local, domain] = e.split('@'); return !IMG_SUFFIX.test(e) && !BAD_LOCAL.test(local) && !BAD_DOMAIN.test(domain) && local.length <= 40 && !/@\d+x/.test(e); }).slice(0, 5);
}

/** Escolhe o melhor e-mail de contato: do mesmo domínio do site e com nome "comercial" (contato@, comercial@…). */
export function pickBestEmail(emails: string[], websiteDomain?: string | null): string | null {
  if (!emails.length) return null;
  const dom = (websiteDomain ?? '').replace(/^www\./, '').toLowerCase();
  const score = (e: string) => { const [l, d] = e.split('@'); const i = PREFERRED.findIndex((p) => l === p || l.startsWith(p)); return (dom && (d === dom || d.endsWith('.' + dom) || dom.endsWith('.' + d)) ? 100 : 0) + (i >= 0 ? PREFERRED.length - i : 0); };
  return [...emails].sort((a, b) => score(b) - score(a))[0];
}
