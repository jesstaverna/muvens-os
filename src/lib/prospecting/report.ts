import type { ServiceKey, SiteFindings } from './analysis';

// Diagnóstico em formato de landing page, montado só com o que foi observado (dados públicos). Sem IA, sem inferências.
export type Status = 'ok' | 'atencao' | 'ausente' | 'desconhecido';
export interface Pillar { key: string; title: string; status: Status; summary: string; items: { label: string; ok: boolean | null }[] }
export interface Report {
  headline: string; level: 'alta' | 'media' | 'baixa' | 'indefinida'; score: number | null;
  pillars: Pillar[]; opportunities: string[]; service: ServiceKey | null; strengths: string[];
}
export interface ReportInput {
  name: string; category?: string | null; website?: string | null; rating?: number | null; reviews?: number | null; score?: number | null;
  service?: string | null; site: SiteFindings | null; observations: string[]; analyzed: boolean;
}

const worst = (items: { ok: boolean | null }[]): Status => {
  const known = items.filter((i) => i.ok !== null); if (!known.length) return 'desconhecido';
  const bad = known.filter((i) => !i.ok).length; return bad === 0 ? 'ok' : bad === known.length ? 'ausente' : 'atencao';
};

export function buildReport(i: ReportInput): Report {
  const s = i.site; const reach = !!s?.reachable; const hasSite = !!i.website;
  const k = (v: boolean | undefined): boolean | null => (reach ? !!v : null);
  const siteItems = hasSite
    ? [{ label: 'Site acessível', ok: i.analyzed ? reach : null }, { label: 'Conexão segura (HTTPS)', ok: k(s?.https) }, { label: 'Adaptado para celular', ok: k(s?.hasViewport) }, { label: 'Descrição para o Google', ok: k(s?.hasMetaDescription) },
        ...(typeof s?.pageSpeedScore === 'number' ? [{ label: `Velocidade no celular (${s.pageSpeedScore}/100)`, ok: s.pageSpeedScore >= 50 }] : [])]
    : [{ label: 'Site da empresa', ok: false }];
  const socials = s?.socials ?? {}; const social = (n: keyof SiteFindings['socials'], l: string) => ({ label: l, ok: reach ? !!socials[n] : null });
  const pillars: Pillar[] = [
    { key: 'site', title: 'Site', items: siteItems },
    { key: 'redes', title: 'Redes sociais', items: [social('instagram', 'Instagram'), social('facebook', 'Facebook'), social('linkedin', 'LinkedIn'), social('youtube', 'YouTube')] },
    { key: 'conversao', title: 'Conversão', items: [{ label: 'WhatsApp no site', ok: k(s?.hasWhatsappLink) }, { label: 'Formulário de contato', ok: k(s?.hasContactForm) }] },
    { key: 'anuncios', title: 'Anúncios e métricas', items: [{ label: 'Pixel / Tag Manager', ok: k(s?.hasAdsPixel) }] },
    { key: 'marca', title: 'Marca e reputação', items: [{ label: 'Ícone da aba (favicon)', ok: k(s?.hasFavicon) }, { label: 'Imagem de compartilhamento', ok: k(s?.hasShareImage) },
        { label: i.reviews != null ? `Avaliações no Google (${i.reviews}${i.rating ? ` · nota ${String(i.rating).replace('.', ',')}` : ''})` : 'Avaliações no Google', ok: i.reviews == null ? null : i.reviews >= 15 && (i.rating ?? 5) >= 4 }] },
  ].map((p) => {
    const st = worst(p.items);
    const bad = p.items.filter((x) => x.ok === false).map((x) => x.label.toLowerCase());
    return { ...p, status: st, summary: st === 'desconhecido' ? 'Ainda não analisado' : st === 'ok' ? 'Tudo certo no que verificamos' : `Pontos a melhorar: ${bad.join(', ')}` };
  });
  const score = i.score ?? null;
  const level = score == null ? 'indefinida' : score >= 60 ? 'alta' : score >= 30 ? 'media' : 'baixa';
  const headline = !i.analyzed ? `Diagnóstico de presença digital de ${i.name}` :
    level === 'alta' ? `${i.name} tem bastante espaço para crescer no digital` : level === 'media' ? `${i.name} tem boas oportunidades de melhoria no digital` : `${i.name} já tem uma boa base digital, com ajustes pontuais`;
  const strengths = pillars.flatMap((p) => p.items.filter((x) => x.ok === true).map((x) => x.label));
  return { headline, level, score, pillars, opportunities: i.observations, service: (i.service as ServiceKey) ?? null, strengths };
}
