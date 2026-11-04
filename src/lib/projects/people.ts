// Quem está em cada projeto: equipe (dono do projeto, responsáveis e colaboradores das tarefas), contatos do cliente nas tarefas e usuários do portal.
export interface PTask { id: string; status: string; project_id: string; assignee_id: string | null; co: string[]; contacts: string[] }
export interface PProject { id: string; name: string; status: string; client_id: string; client: string; owner_id: string | null; client_visible: boolean }
export interface PPerson { id: string; name: string }
export interface PContact { id: string; client_id: string; name: string; role_title: string | null; is_primary: boolean }
export interface PPortalUser { id: string; client_id: string | null; name: string; email: string | null; active: boolean }

export interface TeamEntry { id: string; name: string; role: 'Responsável do projeto' | 'Responsável' | 'Colaborador'; tasks: number; open: number }
export interface ProjectPeople {
  project: PProject; team: TeamEntry[];
  contacts: { id: string; name: string; role_title: string | null; tasks: number; primary: boolean }[];
  portalUsers: PPortalUser[];
}
const DONE = ['entregue', 'cancelada'];
const RANK = { 'Responsável do projeto': 0, 'Responsável': 1, 'Colaborador': 2 } as const;

export function peopleByProject(projects: PProject[], tasks: PTask[], team: PPerson[], contacts: PContact[], portalUsers: PPortalUser[]): ProjectPeople[] {
  const name = new Map(team.map((p) => [p.id, p.name]));
  return projects.map((project) => {
    const ts = tasks.filter((t) => t.project_id === project.id && t.status !== 'cancelada');
    const acc = new Map<string, { tasks: number; open: number; principal: number }>();
    const bump = (id: string, t: PTask, principal: boolean) => { const a = acc.get(id) ?? { tasks: 0, open: 0, principal: 0 }; a.tasks++; if (!DONE.includes(t.status)) a.open++; if (principal) a.principal++; acc.set(id, a); };
    for (const t of ts) { if (t.assignee_id) bump(t.assignee_id, t, true); for (const u of t.co) if (u !== t.assignee_id) bump(u, t, false); }
    if (project.owner_id && !acc.has(project.owner_id)) acc.set(project.owner_id, { tasks: 0, open: 0, principal: 0 });
    const teamEntries: TeamEntry[] = [...acc.entries()].filter(([id]) => name.has(id)).map(([id, a]) => ({ id, name: name.get(id)!, tasks: a.tasks, open: a.open, role: id === project.owner_id ? 'Responsável do projeto' as const : a.principal > 0 ? 'Responsável' as const : 'Colaborador' as const }))
      .sort((a, b) => RANK[a.role] - RANK[b.role] || b.open - a.open || a.name.localeCompare(b.name));
    const cc = new Map<string, number>(); for (const t of ts) for (const c of t.contacts) cc.set(c, (cc.get(c) ?? 0) + 1);
    const contactEntries = contacts.filter((c) => c.client_id === project.client_id && cc.has(c.id)).map((c) => ({ id: c.id, name: c.name, role_title: c.role_title, tasks: cc.get(c.id)!, primary: c.is_primary })).sort((a, b) => b.tasks - a.tasks || a.name.localeCompare(b.name));
    return { project, team: teamEntries, contacts: contactEntries, portalUsers: project.client_visible ? portalUsers.filter((u) => u.client_id === project.client_id).sort((a, b) => a.name.localeCompare(b.name)) : [] };
  });
}

/** Inverte: para cada pessoa da equipe, em quais projetos ela está. */
export function projectsByPerson(rows: ProjectPeople[]): { id: string; name: string; projects: { id: string; name: string; client: string; role: TeamEntry['role']; tasks: number; open: number }[] }[] {
  const out = new Map<string, { id: string; name: string; projects: { id: string; name: string; client: string; role: TeamEntry['role']; tasks: number; open: number }[] }>();
  for (const r of rows) for (const p of r.team) { const e = out.get(p.id) ?? { id: p.id, name: p.name, projects: [] }; e.projects.push({ id: r.project.id, name: r.project.name, client: r.project.client, role: p.role, tasks: p.tasks, open: p.open }); out.set(p.id, e); }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}
