/** Classificação da natureza do trabalho, separada da etapa do Kanban. */
export const TASK_CATEGORIES = {
  interno: 'Interno',
  automacao_nutricao: 'Automação e Nutrição',
  branding_identidade: 'Branding e Identidade',
  campanha_revops: 'Campanha RevOps',
  diagnostico_gratuito: 'Diagnóstico Gratuito',
  landing_page: 'Landing Page',
  site: 'Site',
  trafego_pago: 'Tráfego Pago',
  social_media: 'Social Media',
  estrategia: 'Estratégia',
} as const;
export type TaskCategory = keyof typeof TASK_CATEGORIES;
export function taskCategoryLabel(value: string | null | undefined): string {
  return value && value in TASK_CATEGORIES ? TASK_CATEGORIES[value as TaskCategory] : '';
}
