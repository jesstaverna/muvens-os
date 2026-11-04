// Mover um cartão entre colunas = percorrer, em ordem, as transições que o banco permite (o banco continua sendo a autoridade).
import type { ColumnKey } from './board';

/** Transições "para a frente" que o banco exige: enviado só vem de produzido/ajustes; ajustes e aprovado só de enviado; entregue só de aprovado. */
const FORWARD: Record<string, string[]> = {
  solicitada: ['a_fazer'], aguardando_cliente: ['a_fazer'], a_fazer: ['em_andamento'], em_andamento: ['produzido'], produzido: ['enviado'],
  enviado: ['aprovado', 'ajustes'], ajustes: ['produzido', 'enviado'], aprovado: ['entregue'], entregue: [],
};
const RANK: Record<string, number> = { solicitada: 0, aguardando_cliente: 0, a_fazer: 1, em_andamento: 2, produzido: 3, enviado: 4, ajustes: 4.5, aprovado: 5, entregue: 6 };

/** Caminho de status entre dois status (inclui o destino; vazio se já está nele; null se impossível, ex.: reabrir entregue).
 *  Para trás vai direto (o banco permite); para a frente passa por todas as etapas, para o histórico e as métricas ficarem fiéis. */
export function statusPath(from: string, to: string): string[] | null {
  if (from === to) return [];
  if (from === 'entregue' || from === 'cancelada' || !(from in RANK) || !(to in RANK)) return null;
  if (RANK[to] < RANK[from]) {
    if (['solicitada', 'aguardando_cliente', 'a_fazer', 'em_andamento', 'produzido'].includes(to) || (from === 'ajustes' && to === 'enviado')) return [to];
    return ['produzido', ...(statusPath('produzido', to) ?? [])];   // enviado/ajustes/aprovado só se alcançam "para a frente" a partir de produzido/enviado
  }
  const prev = new Map<string, string | null>([[from, null]]); const queue = [from];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const n of FORWARD[cur] ?? []) {
      if (prev.has(n)) continue;
      prev.set(n, cur);
      if (n === to) { const out: string[] = []; for (let x: string | null = n; x && x !== from; x = prev.get(x) ?? null) out.unshift(x); return out; }
      queue.push(n);
    }
  }
  return null;
}

/** O que acontece ao soltar/criar um cartão numa coluna. */
export function columnTarget(col: ColumnKey): { status: string; area?: 'diagramacao' | 'social_media' | 'outro' } {
  switch (col) {
    case 'diagramacao': return { status: 'a_fazer', area: 'diagramacao' };
    case 'social_media': return { status: 'a_fazer', area: 'social_media' };
    case 'outro': return { status: 'a_fazer', area: 'outro' };
    case 'andamento': return { status: 'em_andamento' };
    case 'aprovacao': return { status: 'enviado' };
    case 'ajustes': return { status: 'ajustes' };
    case 'aprovados': return { status: 'aprovado' };
    case 'finalizados': return { status: 'entregue' };
  }
}
