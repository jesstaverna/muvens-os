// Regras puras de negócio (testadas em domain.test.ts). Espelham as regras do banco, que continua sendo a autoridade.

/** Mesma normalização de app.norm_phone (SQL). */
export function normPhone(p: string | null | undefined): string | null {
  if (!p) return null;
  const digits = p.replace(/\D/g, '');
  const n = (digits.length === 12 || digits.length === 13) && digits.startsWith('55') ? digits.slice(2) : digits;
  return n || null;
}
export const normEmail = (e: string | null | undefined) => (e?.trim().toLowerCase() || null);

export interface ItemInput { billing: 'pontual' | 'mensal'; quantity: number; unit_price: number }
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Prévia dos totais da proposta (o banco recalcula via trigger): total = pontual + mensal×vigência − desconto. */
export function proposalTotals(items: ItemInput[], contractMonths: number, discount = 0) {
  const oneTime = round2(items.filter((i) => i.billing === 'pontual').reduce((s, i) => s + round2(i.quantity * i.unit_price), 0));
  const monthly = round2(items.filter((i) => i.billing === 'mensal').reduce((s, i) => s + round2(i.quantity * i.unit_price), 0));
  const gross = round2(oneTime + monthly * contractMonths);
  return { oneTime, monthly, gross, total: Math.max(round2(gross - discount), 0) };
}

/** Parcelas do valor pontual; centavos restantes vão para a última (igual a activate_proposal). */
export function splitInstallments(total: number, n: number): number[] {
  const each = round2(total / n);
  const out = Array.from({ length: n }, () => each);
  out[n - 1] = round2(total - each * (n - 1));
  return out;
}

export type Basis = 'contratado' | 'emitido' | 'recebido';

export interface GoalInput {
  target: number;
  basis: Basis;
  actual: number;               // realizado na base escolhida
  pendingReceivables: number;   // entradas previstas/emitidas com vencimento no período
  weightedPipeline: number;     // pipeline ponderado pela probabilidade de cada etapa
  elapsedFraction: number;      // 0..1 do período já decorrido
}

export function goalProgress({ target, basis, actual, pendingReceivables, weightedPipeline, elapsedFraction }: GoalInput) {
  const percent = target > 0 ? (actual / target) * 100 : 0;
  const remaining = Math.max(target - actual, 0);
  // Projeção: base "contratado" soma o pipeline ponderado; "emitido"/"recebido" soma os recebíveis do período.
  const projected = round2(actual + (basis === 'contratado' ? weightedPipeline : pendingReceivables));
  const expectedNow = target * Math.min(Math.max(elapsedFraction, 0), 1);
  // Em risco: projeção abaixo da meta E realizado abaixo de 80% do ritmo linear esperado.
  const atRisk = target > 0 && projected < target && actual < expectedNow * 0.8;
  return { percent, remaining, projected, expectedNow, atRisk };
}

export function monthRange(year: number, month1: number) {
  const pad = (n: number) => String(n).padStart(2, '0');
  const last = new Date(Date.UTC(year, month1, 0)).getUTCDate();
  return { from: `${year}-${pad(month1)}-01`, to: `${year}-${pad(month1)}-${pad(last)}` };
}

/** Data de hoje (yyyy-mm-dd) em America/Sao_Paulo. */
export function todayBR(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now);
}

export function elapsedFraction(from: string, to: string, today: string) {
  const f = Date.parse(from), t = Date.parse(to) + 86_400_000, n = Date.parse(today) + 86_400_000;
  return Math.min(Math.max((n - f) / (t - f), 0), 1);
}

export const PROPOSAL_STATUS: Record<string, { label: string; tone: string }> = {
  rascunho: { label: 'Rascunho', tone: 'bg-subtle text-muted' },
  enviada: { label: 'Enviada', tone: 'bg-blue-500/10 text-blue-600' },
  visualizada: { label: 'Visualizada', tone: 'bg-violet-500/10 text-violet-600' },
  em_negociacao: { label: 'Em negociação', tone: 'bg-amber-500/15 text-warn' },
  aceita: { label: 'Aceita', tone: 'bg-lime/40 text-fg' },
  recusada: { label: 'Recusada', tone: 'bg-danger/10 text-danger' },
  expirada: { label: 'Expirada', tone: 'bg-subtle text-muted' },
};

export const TX_STATUS_LABEL = (direction: 'in' | 'out', status: string) =>
  ({ previsto: 'Previsto', emitido: 'Emitido', cancelado: 'Cancelado', liquidado: direction === 'in' ? 'Recebido' : 'Pago' }[status] ?? status);

export const CONTRACT_STATUS: Record<string, { label: string; tone: string }> = {
  rascunho: { label: 'Rascunho', tone: 'bg-subtle text-muted' }, em_revisao: { label: 'Em revisão', tone: 'bg-amber-500/15 text-warn' },
  aprovado: { label: 'Aprovado', tone: 'bg-blue-500/10 text-blue-600' }, enviado_assinatura: { label: 'Enviado p/ assinatura', tone: 'bg-violet-500/10 text-violet-600' },
  assinado: { label: 'Assinado', tone: 'bg-lime/40' }, cancelado: { label: 'Cancelado', tone: 'bg-danger/10 text-danger' },
};

export const TASK_STATUS: Record<string, { label: string; tone: string }> = {
  a_fazer: { label: 'A fazer', tone: 'bg-subtle text-muted' },
  em_andamento: { label: 'Em andamento', tone: 'bg-blue-500/10 text-blue-600' },
  produzido: { label: 'Produzido (revisão interna)', tone: 'bg-violet-500/10 text-violet-600' },
  enviado: { label: 'Enviado ao cliente', tone: 'bg-amber-500/15 text-warn' },
  ajustes: { label: 'Ajustes solicitados', tone: 'bg-danger/10 text-danger' },
  aprovado: { label: 'Aprovado', tone: 'bg-lime/40' },
  entregue: { label: 'Entregue', tone: 'bg-lime/60' },
  cancelada: { label: 'Cancelada', tone: 'bg-subtle text-muted' },
};
export const TASK_FLOW = ['a_fazer', 'em_andamento', 'produzido', 'enviado', 'ajustes', 'aprovado', 'entregue'] as const;
export const PRIORITY: Record<string, { label: string; tone: string }> = {
  baixa: { label: 'Baixa', tone: 'text-muted' }, media: { label: 'Média', tone: '' }, alta: { label: 'Alta', tone: 'text-warn' }, urgente: { label: 'Urgente', tone: 'text-danger font-medium' },
};
export const PROJECT_STATUS: Record<string, string> = { planejamento: 'Planejamento', em_andamento: 'Em andamento', pausado: 'Pausado', concluido: 'Concluído', cancelado: 'Cancelado' };

/** "1,5" ou "1.5" (horas) ou "1:30" → minutos; null se inválido. */
export function parseDuration(input: string): number | null {
  const t = input.trim();
  if (!t) return null;
  const hm = /^(\d{1,2}):([0-5]\d)$/.exec(t);
  const m = hm ? Number(hm[1]) * 60 + Number(hm[2]) : /^\d+([.,]\d+)?$/.test(t) ? Math.round(Number(t.replace(',', '.')) * 60) : null;
  return m && m > 0 && m <= 1440 ? m : null;
}
export const fmtMinutes = (m: number) => `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;

/** Rótulos de status mostrados ao cliente (sem jargão interno). */
export const CLIENT_TASK_STATUS: Record<string, { label: string; tone: string }> = {
  a_fazer: { label: 'Na fila', tone: 'bg-subtle text-muted' }, em_andamento: { label: 'Em produção', tone: 'bg-blue-500/10 text-blue-600' },
  produzido: { label: 'Em produção', tone: 'bg-blue-500/10 text-blue-600' }, enviado: { label: 'Aguardando sua aprovação', tone: 'bg-amber-500/15 text-warn' },
  ajustes: { label: 'Ajustes em andamento', tone: 'bg-violet-500/10 text-violet-600' }, aprovado: { label: 'Aprovado', tone: 'bg-lime/40' }, entregue: { label: 'Entregue', tone: 'bg-lime/60' },
};
export const REQUEST_KIND: Record<string, string> = { briefing: 'Briefing', alteracao: 'Solicitação de alteração', atendimento: 'Atendimento' };
export const REQUEST_STATUS: Record<string, string> = { aberta: 'Aberta', em_andamento: 'Em andamento', resolvida: 'Resolvida' };
