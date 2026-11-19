import { z } from 'zod';

export const DIAGNOSTIC_AREAS = {
  site: 'Site institucional',
  landing_page: 'Landing page',
  identidade_visual: 'Identidade visual',
  instagram: 'Feed do Instagram',
  trafego_pago: 'Tráfego pago',
  google_business: 'Perfil da Empresa no Google',
} as const;
export type DiagnosticArea = keyof typeof DIAGNOSTIC_AREAS;
export const AREA_KEYS = Object.keys(DIAGNOSTIC_AREAS) as DiagnosticArea[];

export const findingSchema = z.object({
  title: z.string().trim().min(3).max(180),
  evidence: z.string().trim().min(3).max(900),
  impact: z.string().trim().min(3).max(600),
  recommendation: z.string().trim().min(3).max(1000),
  priority: z.enum(['alta', 'media', 'baixa']),
});
export const reportSchema = z.object({
  headline: z.string().trim().min(4).max(190),
  executive_summary: z.string().trim().min(10).max(3000),
  sections: z.array(z.object({
    area: z.enum(AREA_KEYS as [DiagnosticArea, ...DiagnosticArea[]]),
    strengths: z.array(z.string().trim().min(3).max(400)).max(7),
    findings: z.array(findingSchema).max(12),
    limitations: z.array(z.string().trim().min(3).max(500)).max(6),
  })).min(1).max(6),
  next_steps: z.array(z.string().trim().min(4).max(500)).min(1).max(8),
});
export type DiagnosticReport = z.infer<typeof reportSchema>;

export function clientMessage(company: string, name: string | null, url: string): string {
  const greeting = name?.trim() ? `Olá, ${name.trim().split(/\s+/)[0]}! Tudo bem?` : 'Olá, tudo bem?';
  return [
    greeting, '',
    `Preparei um diagnóstico estratégico da presença digital da ${company}, com os principais pontos observados e sugestões práticas de melhoria.`,
    '', `Você pode acessar a análise neste link: ${url}`, '',
    'Se fizer sentido, podemos conversar sobre quais oportunidades merecem prioridade para o negócio.',
    '', 'Um abraço,', 'Equipe Muvens',
  ].join('\n');
}
