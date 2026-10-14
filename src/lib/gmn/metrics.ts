// Relatório mensal do Google Meu Negócio: números copiados pela equipe do painel do Google (desempenho do perfil). Sem integração automática.
export const METRICS = [
  { key: 'views_search', label: 'Visualizações na Pesquisa do Google', group: 'alcance' }, { key: 'views_maps', label: 'Visualizações no Google Maps', group: 'alcance' },
  { key: 'calls', label: 'Ligações', group: 'acao' }, { key: 'directions', label: 'Pedidos de rota', group: 'acao' }, { key: 'site_clicks', label: 'Cliques no site', group: 'acao' }, { key: 'messages', label: 'Mensagens', group: 'acao' },
  { key: 'new_reviews', label: 'Novas avaliações', group: 'reputacao' }, { key: 'total_reviews', label: 'Total de avaliações', group: 'reputacao' }, { key: 'rating', label: 'Nota média', group: 'reputacao' },
  { key: 'photos_added', label: 'Fotos adicionadas', group: 'trabalho' }, { key: 'posts_published', label: 'Publicações feitas', group: 'trabalho' },
] as const;
export type MetricKey = (typeof METRICS)[number]['key'];
export type Metrics = Partial<Record<MetricKey, number>>;
export const GROUP_LABEL: Record<string, string> = { alcance: 'Alcance', acao: 'Ações dos clientes', reputacao: 'Reputação', trabalho: 'O que fizemos no mês' };

/** Lê os números do formulário (aceita vírgula decimal). Vazio = não informado. */
export function parseMetrics(get: (k: string) => unknown): { ok: true; metrics: Metrics } | { ok: false; error: string } {
  const m: Metrics = {};
  for (const { key, label } of METRICS) {
    const raw = String(get(key) ?? '').trim().replace(',', '.'); if (!raw) continue;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0 || n > 10_000_000) return { ok: false, error: `Valor inválido em "${label}".` };
    if (key === 'rating' && n > 5) return { ok: false, error: 'A nota média vai de 0 a 5.' };
    m[key] = key === 'rating' ? Math.round(n * 10) / 10 : Math.round(n);
  }
  return { ok: true, metrics: m };
}

/** Variação em relação ao mês anterior: percentual para contagens, diferença para a nota. */
export function delta(key: MetricKey, cur?: number, prev?: number): { text: string; up: boolean } | null {
  if (cur == null || prev == null) return null;
  if (key === 'rating') { const d = Math.round((cur - prev) * 10) / 10; return d === 0 ? { text: 'igual ao mês anterior', up: true } : { text: `${d > 0 ? '+' : ''}${String(d).replace('.', ',')} vs. mês anterior`, up: d > 0 }; }
  if (prev === 0) return cur === 0 ? { text: 'igual ao mês anterior', up: true } : { text: 'novo no mês', up: true };
  const p = Math.round(((cur - prev) / prev) * 100); return { text: `${p > 0 ? '+' : ''}${p}% vs. mês anterior`, up: p >= 0 };
}
export const monthLabel = (period: string) => new Date(`${period}T12:00:00Z`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
export const monthStart = (ym: string) => (/^\d{4}-\d{2}$/.test(ym) ? `${ym}-01` : null);
