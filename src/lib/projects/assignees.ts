const UUID = /^[0-9a-f-]{36}$/;
/** Responsáveis de um formulário: `assignee` (várias pessoas marcadas) e `assignee_primary` (quem é o principal). O principal sempre entra na lista;
 *  sem principal escolhido, vale o primeiro marcado. O principal fica em tasks.assignee_id (métricas e avisos); os demais em task_assignees. */
export function resolveAssignees(fd: { getAll(k: string): unknown[]; get(k: string): unknown }): { principal: string | null; others: string[] } {
  const ids = [...new Set(fd.getAll('assignee').map(String).filter((u) => UUID.test(u)))];
  const pick = String(fd.get('assignee_primary') ?? '');
  const principal = UUID.test(pick) ? pick : ids[0] ?? null;
  return { principal, others: ids.filter((u) => u !== principal) };
}
