export const slug = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export interface CampaignLite { id: string; niche: string; city: string; created_at: string }
export interface Group { key: string; niche: string; city: string; ids: string[]; latest: string }

/** Agrupa campanhas por nicho + cidade (sem diferenciar maiúsculas/acentos): "Clínica odontológica (Curitiba)". */
export function groupCampaigns(campaigns: CampaignLite[]): Map<string, Group> {
  const groups = new Map<string, Group>();
  for (const c of campaigns) {
    const key = `${slug(c.niche)}--${slug(c.city)}`;
    const g = groups.get(key) ?? { key, niche: c.niche.trim(), city: c.city.trim(), ids: [] as string[], latest: c.created_at };
    g.ids.push(c.id); if (c.created_at > g.latest) g.latest = c.created_at; groups.set(key, g);
  }
  return groups;
}
