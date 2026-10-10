export type Role = 'admin' | 'comercial' | 'financeiro' | 'designer' | 'trafego' | 'cliente';

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Administrador',
  comercial: 'Comercial',
  financeiro: 'Financeiro',
  designer: 'Designer',
  trafego: 'Gestor de Tráfego',
  cliente: 'Cliente',
};

export const STAFF: Role[] = ['admin', 'comercial', 'financeiro', 'designer', 'trafego'];

export type ModuleKey =
  | 'dashboard' | 'crm' | 'atendimento-ia' | 'propostas' | 'contratos' | 'clientes' | 'brand' | 'projetos'
  | 'calendario' | 'trafego' | 'financeiro' | 'metas' | 'relatorios' | 'ia' | 'portal' | 'automacoes' | 'configuracoes';

export interface ModuleDef {
  key: ModuleKey;
  label: string;
  href: string;
  roles: Role[];
  /** 1 = implementado nesta entrega; 2..4 = fase planejada (página honesta de "em construção") */
  phase: 1 | 2 | 3 | 4;
  icon: string;
  group: string;
  summary: string;
  planned?: string[];
  /** true = módulo de fase futura que já foi entregue */
  done?: boolean;
}

export const MODULES: ModuleDef[] = [
  { key: 'dashboard', group: 'Visão geral', label: 'Dashboard', href: '/dashboard', roles: STAFF, phase: 1, icon: 'layout-dashboard', summary: 'Visão executiva com dados reais.' },
  { key: 'crm', group: 'Comercial', label: 'CRM e Leads', href: '/crm', roles: ['admin', 'comercial'], phase: 1, icon: 'kanban', summary: 'Funil, leads e follow-ups.' },
  { key: 'atendimento-ia', group: 'Comercial', label: 'Atendimento com IA', href: '/atendimento-ia', roles: ['admin', 'comercial'], phase: 3, icon: 'message-circle', summary: 'MUVENS AI — Atendimento Comercial via RD Conversas.',
    planned: ['Indicadores: leads atendidos pela IA, qualificados, transferidos, propostas originadas, conversões, faturamento atribuído', 'Regras de transferência para humano', 'Respeito à janela de 24h e templates do WhatsApp', 'Registro automático no CRM'] },
  { key: 'propostas', group: 'Comercial', label: 'Propostas Comerciais', href: '/propostas', roles: ['admin', 'comercial', 'financeiro'], phase: 1, icon: 'file-text', summary: 'Propostas online com link exclusivo e aceite.' },
  { key: 'contratos', group: 'Comercial', label: 'Contratos', href: '/contratos', roles: ['admin', 'comercial', 'financeiro'], phase: 2, done: true, icon: 'file-signature', summary: 'Contratos gerados a partir das propostas aceitas.' },
  { key: 'clientes', group: 'Clientes e produção', label: 'Clientes', href: '/clientes', roles: STAFF, phase: 1, icon: 'users', summary: 'Cadastro e visão 360° de cada cliente.' },
  { key: 'brand', group: 'Clientes e produção', label: 'Brand Center / KV', href: '/brand', roles: ['admin', 'comercial', 'designer', 'trafego'], phase: 2, done: true, icon: 'palette', summary: 'Biblioteca de identidade visual por cliente.' },
  { key: 'projetos', group: 'Clientes e produção', label: 'Projetos e Tarefas', href: '/projetos', roles: STAFF, phase: 2, done: true, icon: 'list-checks', summary: 'Kanban, lista e controle de entregáveis.' },
  { key: 'calendario', group: 'Clientes e produção', label: 'Calendário de Produção', href: '/calendario', roles: STAFF, phase: 2, done: true, icon: 'calendar', summary: 'Prazos e entregas de produção.' },

  { key: 'trafego', group: 'Marketing', label: 'Tráfego Pago', href: '/trafego', roles: ['admin', 'trafego'], phase: 3, icon: 'bar-chart-3', summary: 'Meta Ads e Google Ads por cliente.',
    planned: ['Investimento, CTR, CPC, CPM, CPL, ROAS', 'Alertas de custo por lead e orçamento', 'Relatórios compartilháveis', 'Integrações pendentes: contas e tokens Meta/Google'] },
  { key: 'financeiro', group: 'Finanças', label: 'Financeiro', href: '/financeiro', roles: ['admin', 'financeiro'], phase: 1, icon: 'wallet', summary: 'Entradas, saídas, recorrências e previsão.' },
  { key: 'metas', group: 'Finanças', label: 'Metas e Resultados', href: '/metas', roles: ['admin', 'comercial', 'financeiro'], phase: 1, icon: 'target', summary: 'Metas mensais/anuais e projeções.' },
  { key: 'relatorios', group: 'Marketing', label: 'Relatórios', href: '/relatorios', roles: ['admin', 'comercial', 'financeiro', 'trafego'], phase: 4, icon: 'file-bar-chart', summary: 'Relatórios gerenciais e de clientes.', planned: ['Relatórios financeiros, comerciais e de performance exportáveis'] },
  { key: 'ia', group: 'Inteligência e sistema', label: 'Inteligência Artificial', href: '/ia', roles: ['admin', 'comercial', 'financeiro'], phase: 4, icon: 'sparkles', summary: 'MUVENS AI executiva.',
    planned: ['Perguntas em linguagem natural sobre dados reais (RLS do usuário)', 'Resumo diário automático', 'Rascunhos de proposta — sem ações críticas sem autorização'] },
  { key: 'portal', group: 'Clientes e produção', label: 'Portal do Cliente', href: '/portal', roles: ['admin', 'comercial'], phase: 2, done: true, icon: 'door-open', summary: 'Gestão do portal: solicitações, documentos e acessos.' },
  { key: 'automacoes', group: 'Inteligência e sistema', label: 'Automações', href: '/automacoes', roles: ['admin'], phase: 1, icon: 'workflow', summary: 'Fila de processamento, logs e retentativas.' },
  { key: 'configuracoes', group: 'Inteligência e sistema', label: 'Configurações', href: '/configuracoes', roles: ['admin'], phase: 1, icon: 'settings', summary: 'Usuários, funil e integrações.' },
];

export function canAccess(role: Role | null | undefined, key: ModuleKey) {
  if (!role) return false;
  return MODULES.find((m) => m.key === key)?.roles.includes(role) ?? false;
}

export const GROUP_ORDER = ['Visão geral', 'Comercial', 'Clientes e produção', 'Marketing', 'Finanças', 'Inteligência e sistema'];
