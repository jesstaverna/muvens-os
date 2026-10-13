// Perguntas de qualificação enviadas ao lead de anúncio e a pontuação das respostas. Regras simples e editáveis, não estatística.
export const AREAS = [
  { key: 'site_institucional', label: 'Site institucional' }, { key: 'landing_page', label: 'Landing page' }, { key: 'redes_sociais', label: 'Social media (gestão de redes)' },
  { key: 'design_posts', label: 'Design de posts' }, { key: 'branding', label: 'Identidade visual' }, { key: 'trafego_pago', label: 'Tráfego pago (anúncios)' },
  { key: 'rd_marketing', label: 'RD Station / automação de marketing' }, { key: 'ia_aplicada', label: 'Inteligência artificial no negócio' }, { key: 'consultoria', label: 'Consultoria' },
] as const;
export const PRAZO = [{ v: 'agora', l: 'Quero começar agora' }, { v: '30dias', l: 'Nos próximos 30 dias' }, { v: '3meses', l: 'Em até 3 meses' }, { v: 'pesquisando', l: 'Estou só pesquisando' }] as const;
export const INVEST = [{ v: 'nenhum', l: 'Ainda não invisto' }, { v: 'ate1k', l: 'Até R$ 1.000 por mês' }, { v: '1a5k', l: 'De R$ 1.000 a R$ 5.000 por mês' }, { v: 'mais5k', l: 'Mais de R$ 5.000 por mês' }] as const;
export const DECISOR = [{ v: 'sim', l: 'Sim, eu decido' }, { v: 'socio', l: 'Decido junto com sócio ou equipe' }, { v: 'nao', l: 'Não, estou levantando informações' }] as const;
export const CONTATO = [{ v: 'whatsapp', l: 'WhatsApp' }, { v: 'email', l: 'E-mail' }, { v: 'ligacao', l: 'Ligação' }] as const;

export interface Answers { dificuldade: string; precisa: string; areas: string[]; prazo: string; invest: string; decisor: string; contato: string }
export type Fit = 'quente' | 'morno' | 'frio';

const oneOf = <T extends readonly { v: string }[]>(list: T, v: unknown) => (list.some((x) => x.v === v) ? String(v) : '');
const clean = (v: unknown, max = 1200) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

export function parseAnswers(raw: Record<string, unknown>): { ok: true; answers: Answers } | { ok: false; error: string } {
  const areas = (Array.isArray(raw.areas) ? raw.areas : raw.areas ? [raw.areas] : []).map(String).filter((a) => AREAS.some((x) => x.key === a));
  const a: Answers = { dificuldade: clean(raw.dificuldade), precisa: clean(raw.precisa), areas: [...new Set(areas)], prazo: oneOf(PRAZO, raw.prazo), invest: oneOf(INVEST, raw.invest), decisor: oneOf(DECISOR, raw.decisor), contato: oneOf(CONTATO, raw.contato) };
  if (a.dificuldade.length < 5) return { ok: false, error: 'Conte, em poucas palavras, a sua maior dificuldade hoje.' };
  if (a.precisa.length < 5) return { ok: false, error: 'Conte o que você mais precisa resolver.' };
  if (!a.prazo || !a.invest || !a.decisor) return { ok: false, error: 'Responda prazo, investimento e quem decide.' };
  return { ok: true, answers: a };
}

export function scoreAnswers(a: Answers): { score: number; fit: Fit; services: string[]; reasons: string[] } {
  let s = 0; const reasons: string[] = [];
  const add = (n: number, why: string) => { s += n; reasons.push(`${why} (+${n})`); };
  add({ agora: 30, '30dias': 22, '3meses': 10, pesquisando: 0 }[a.prazo] ?? 0, `Prazo: ${PRAZO.find((x) => x.v === a.prazo)?.l ?? '—'}`);
  add({ sim: 25, socio: 15, nao: 0 }[a.decisor] ?? 0, `Decisão: ${DECISOR.find((x) => x.v === a.decisor)?.l ?? '—'}`);
  add({ nenhum: 0, ate1k: 8, '1a5k': 15, mais5k: 20 }[a.invest] ?? 0, `Investimento: ${INVEST.find((x) => x.v === a.invest)?.l ?? '—'}`);
  if (a.areas.length) add(Math.min(10 + (a.areas.length - 1) * 3, 16), `${a.areas.length} área(s) de interesse`);
  if (a.dificuldade.length >= 40) add(5, 'Descreveu a dificuldade'); if (a.precisa.length >= 40) add(5, 'Descreveu a necessidade');
  s = Math.min(100, s);
  return { score: s, fit: s >= 65 ? 'quente' : s >= 35 ? 'morno' : 'frio', services: a.areas, reasons };
}
