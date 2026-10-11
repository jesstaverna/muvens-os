/** Executa `fn` sobre os itens com no máximo `limit` em paralelo e para de INICIAR novos itens depois de `deadlineMs`. */
export async function runPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>, deadlineMs = Infinity): Promise<{ results: R[]; skipped: T[] }> {
  const started = Date.now(); const results: R[] = []; const queue = [...items]; const skipped: T[] = [];
  const worker = async () => {
    for (;;) {
      const item = queue.shift(); if (item === undefined) return;
      if (Date.now() - started > deadlineMs) { skipped.push(item); continue; }
      results.push(await fn(item));
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return { results, skipped };
}
