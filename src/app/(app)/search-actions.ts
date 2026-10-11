'use server';
import { getSession } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';

export interface SearchHit { type: string; label: string; sub?: string; href: string }

/** Busca global (Ctrl+K). Usa a sessão do usuário: a RLS garante que ele só encontre o que pode ver. */
export async function globalSearch(q: string): Promise<SearchHit[]> {
  const s = await getSession();
  if (!s || s.profile.role === 'cliente' || !s.profile.active) return [];
  const term = q.replace(/[%,()\\]/g, ' ').trim().slice(0, 60);
  if (term.length < 2) return [];
  const db = await createClient();
  const like = `%${term}%`;
  const [clients, leads, proposals, tasks, prospects] = await Promise.all([
    db.from('clients').select('id, name, segment').or(`name.ilike.${like},legal_name.ilike.${like},email.ilike.${like}`).limit(5),
    db.from('leads').select('id, name, company').or(`name.ilike.${like},company.ilike.${like},email.ilike.${like}`).limit(5),
    db.from('proposals').select('id, number, title, client_display_name').or(`title.ilike.${like},client_display_name.ilike.${like}`).limit(5),
    db.from('tasks').select('id, title, projects(name)').ilike('title', like).limit(5),
    db.from('prospects').select('id, name, category').ilike('name', like).limit(5),
  ]);
  const hits: SearchHit[] = [];
  clients.data?.forEach((c) => hits.push({ type: 'Cliente', label: c.name, sub: c.segment ?? undefined, href: `/clientes/${c.id}` }));
  leads.data?.forEach((l) => hits.push({ type: 'Lead', label: l.name, sub: l.company ?? undefined, href: `/crm/${l.id}` }));
  proposals.data?.forEach((p) => hits.push({ type: 'Proposta', label: `#${p.number} · ${p.title}`, sub: p.client_display_name, href: `/propostas/${p.id}` }));
  tasks.data?.forEach((t: any) => hits.push({ type: 'Tarefa', label: t.title, sub: (Array.isArray(t.projects) ? t.projects[0] : t.projects)?.name, href: `/projetos/tarefas/${t.id}` }));
  prospects.data?.forEach((p) => hits.push({ type: 'Prospecto', label: p.name, sub: p.category ?? undefined, href: `/prospeccao/${p.id}` }));
  return hits;
}
