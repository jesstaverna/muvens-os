import type { SupabaseClient } from '@supabase/supabase-js';
import { personName } from '@/lib/people';
import { peopleByProject, type ProjectPeople } from './people';

const one = <T,>(v: T | T[] | null | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

/** Carrega e monta as pessoas de cada projeto (equipe, contatos do cliente e usuários do portal). Filtra por projeto ou cliente. */
export async function loadProjectPeople(supabase: SupabaseClient, f: { projectId?: string; clientId?: string } = {}): Promise<ProjectPeople[]> {
  let pq = supabase.from('projects').select('id, name, status, client_id, owner_id, client_visible, clients(name)').neq('status', 'cancelado').order('name');
  if (f.projectId) pq = pq.eq('id', f.projectId); if (f.clientId) pq = pq.eq('client_id', f.clientId);
  const { data: projects } = await pq;
  if (!projects?.length) return [];
  const ids = projects.map((p) => p.id as string); const clientIds = [...new Set(projects.map((p) => p.client_id as string))];
  const [{ data: tasks }, { data: team }, { data: contacts }, { data: portal }] = await Promise.all([
    supabase.from('tasks').select('id, status, project_id, assignee_id, co:task_assignees(user_id), tc:task_contacts(contact_id)').in('project_id', ids).neq('status', 'cancelada').limit(5000),
    supabase.from('profiles').select('id, full_name, email').neq('role', 'cliente'),
    supabase.from('client_contacts').select('id, client_id, name, role_title, is_primary').in('client_id', clientIds),
    supabase.from('profiles').select('id, full_name, email, client_id, active').eq('role', 'cliente').in('client_id', clientIds),
  ]);
  return peopleByProject(
    projects.map((p) => ({ id: p.id, name: p.name, status: p.status, client_id: p.client_id, client: one(p.clients as { name: string } | { name: string }[] | null)?.name ?? '', owner_id: p.owner_id, client_visible: p.client_visible })),
    (tasks ?? []).map((t) => ({ id: t.id, status: t.status, project_id: t.project_id, assignee_id: t.assignee_id, co: ((t.co ?? []) as { user_id: string }[]).map((x) => x.user_id), contacts: ((t.tc ?? []) as { contact_id: string }[]).map((x) => x.contact_id) })),
    (team ?? []).map((p) => ({ id: p.id, name: personName(p) })),
    (contacts ?? []) as never,
    (portal ?? []).map((u) => ({ id: u.id, client_id: u.client_id, name: personName(u), email: u.email, active: u.active })),
  );
}
