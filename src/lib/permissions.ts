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
  | 'meu-dia' | 'dashboard' | 'alertas'
  | 'crm' | 'prospeccao' | 'atendimento-ia' | 'propostas' | 'contratos'
  | 'clientes' | 'brand' | 'portal'
  | 'projetos' | 'calendario' | 'aprovacoes' | 'equipe'
  | 'conteudos' | 'trafego' | 'relatorios'
  | 'financeiro' | 'metas' | 'rentabilidade'
  | 'ia' | 'automacoes' | 'configuracoes';

export interface ModuleDef {
  key: ModuleKey;
  label: string;
  href: string;
  roles: Role[];
  /** 1 = implementado; 2..4 = fase planejada, exceto se done = true. */
  phase: 1 | 2 | 3 | 4;
  icon: string;
  group: string;
  summary: string;
  planned?: string[];
  done?: boolean;
}

/**
 * Menu por fluxo de trabalho. Permissões aqui controlam visibilidade/navegação;
 * cada rota e operação também exige autorização no servidor e RLS.
 * Links com "view=" reutilizam funcionalidades já existentes, sem duplicar dados.
 */
export const MODULES: ModuleDef[] = [
  { key: 'meu-dia', group: 'Início', label: 'Meu Dia', href: '/meu-dia', roles: STAFF, phase: 1, icon: 'house', summary: 'Tarefas, aprovações e alertas reais.' },
  { key: 'dashboard', group: 'Início', label: 'Dashboard executivo', href: '/dashboard', roles: STAFF, phase: 1, icon: 'layout-dashboard', summary: 'Indicadores executivos e operacionais.' },
  { key: 'alertas', group: 'Início', label: 'Notificações', href: '/alertas', roles: STAFF, phase: 1, icon: 'bell', summary: 'Alertas do sistema.' },

  { key: 'crm', group: 'Comercial', label: 'CRM e Leads', href: '/crm', roles: ['admin', 'comercial'], phase: 1, icon: 'kanban', summary: 'Funil, leads e follow-ups.' },
  { key: 'prospeccao', group: 'Comercial', label: 'Prospecção', href: '/prospeccao', roles: ['admin', 'comercial'], phase: 3, done: true, icon: 'radar', summary: 'Descoberta, análise e abordagem de clientes.' },
  { key: 'propostas', group: 'Comercial', label: 'Propostas', href: '/propostas', roles: ['admin', 'comercial', 'financeiro'], phase: 1, icon: 'file-text', summary: 'Propostas online e aceite.' },
  { key: 'contratos', group: 'Comercial', label: 'Contratos', href: '/contratos', roles: ['admin', 'comercial', 'financeiro'], phase: 2, done: true, icon: 'file-signature', summary: 'Contratos e assinatura manual.' },
  { key: 'atendimento-ia', group: 'Comercial', label: 'Atendimento com IA', href: '/atendimento-ia', roles: ['admin', 'comercial'], phase: 3, icon: 'message-circle', summary: 'Atendimento comercial com IA e RD Conversas.', planned: ['Indicadores de atendimento, qualificação e conversão', 'Regras de transferência para humano', 'Registro de conversas no CRM', 'Integração com RD Conversas, dependente de credenciais'] },

  { key: 'clientes', group: 'Clientes', label: 'Todos os clientes', href: '/clientes', roles: STAFF, phase: 1, icon: 'users', summary: 'Cadastro único de clientes.' },
  { key: 'brand', group: 'Clientes', label: 'Brand Center', href: '/brand', roles: ['admin', 'comercial', 'designer', 'trafego'], phase: 2, done: true, icon: 'palette', summary: 'Biblioteca de identidades visuais por cliente.' },
  { key: 'portal', group: 'Clientes', label: 'Portal do Cliente', href: '/portal', roles: ['admin', 'comercial'], phase: 2, done: true, icon: 'door-open', summary: 'Solicitações, arquivos e acessos do portal.' },

  { key: 'projetos', group: 'Operação', label: 'Projetos e Produção', href: '/projetos', roles: STAFF, phase: 2, done: true, icon: 'list-checks', summary: 'Projetos, Kanban e entregáveis.' },
  { key: 'calendario', group: 'Operação', label: 'Calendário de Produção', href: '/calendario', roles: STAFF, phase: 2, done: true, icon: 'calendar', summary: 'Prazos e entregas operacionais.' },
  { key: 'aprovacoes', group: 'Operação', label: 'Aprovações', href: '/aprovacoes', roles: STAFF, phase: 1, icon: 'clipboard-check', summary: 'Peças em revisão interna ou aguardando aprovação.' },
  { key: 'equipe', group: 'Operação', label: 'Equipe por Projeto', href: '/projetos?view=pessoas', roles: STAFF, phase: 2, done: true, icon: 'users-round', summary: 'Pessoas vinculadas aos projetos; planejamento de capacidade virá depois.' },

  { key: 'conteudos', group: 'Marketing', label: 'Conteúdos', href: '/conteudos', roles: ['admin', 'comercial', 'designer', 'trafego'], phase: 3, icon: 'megaphone', summary: 'Calendário editorial (planejado).', planned: ['Planejamento de conteúdo por cliente e canal', 'Copy, criação, revisão e aprovações', 'Data e link de publicação', 'Visualizações de calendário e lista'] },
  { key: 'trafego', group: 'Marketing', label: 'Tráfego Pago', href: '/trafego', roles: ['admin', 'trafego'], phase: 3, icon: 'bar-chart-3', summary: 'Meta Ads e Google Ads (pendente).', planned: ['Investimento, CTR, CPC, CPM, CPL, ROAS', 'Alertas de orçamento', 'Relatórios por cliente', 'Integrações Meta/Google Ads pendentes'] },
  { key: 'relatorios', group: 'Marketing', label: 'Relatórios de Campanhas', href: '/relatorios', roles: ['admin', 'comercial', 'financeiro', 'trafego'], phase: 4, icon: 'file-bar-chart', summary: 'Relatórios gerenciais e de clientes (planejados).', planned: ['Relatórios de campanhas e performance', 'Filtros de período e cliente', 'Exportação de relatórios'] },

  { key: 'financeiro', group: 'Gestão', label: 'Financeiro', href: '/financeiro', roles: ['admin', 'financeiro'], phase: 1, icon: 'wallet', summary: 'Receitas, despesas e recebimentos.' },
  { key: 'metas', group: 'Gestão', label: 'Metas e Resultados', href: '/metas', roles: ['admin', 'comercial', 'financeiro'], phase: 1, icon: 'target', summary: 'Metas mensais e projeções.' },
  { key: 'rentabilidade', group: 'Gestão', label: 'Rentabilidade', href: '/projetos?view=rentabilidade', roles: ['admin', 'financeiro'], phase: 2, done: true, icon: 'trending-up', summary: 'Margem parcial por cliente, calculada com horas e recebimentos.' },

  { key: 'ia', group: 'Sistema', label: 'MUVENS AI', href: '/ia', roles: ['admin', 'comercial', 'financeiro'], phase: 4, icon: 'sparkles', summary: 'Assistente executivo com IA (planejado).', planned: ['Perguntas em linguagem natural respeitando RLS', 'Resumo diário da operação', 'Rascunhos de propostas com aprovação humana'] },
  { key: 'automacoes', group: 'Sistema', label: 'Automações', href: '/automacoes', roles: ['admin'], phase: 1, icon: 'workflow', summary: 'Fila, logs e retentativas de automações.' },
  { key: 'configuracoes', group: 'Sistema', label: 'Configurações', href: '/configuracoes', roles: ['admin'], phase: 1, icon: 'settings', summary: 'Acessos, funil e integrações.' },
];

export function canAccess(role: Role | null | undefined, key: ModuleKey) {
  if (!role) return false;
  return MODULES.find((m) => m.key === key)?.roles.includes(role) ?? false;
}

export const GROUP_ORDER = ['Início', 'Comercial', 'Clientes', 'Operação', 'Marketing', 'Gestão', 'Sistema'];

export const GROUP_ICONS: Record<string, string> = {
  'Início': 'house',
  'Comercial': 'handshake',
  'Clientes': 'building-2',
  'Operação': 'briefcase-business',
  'Marketing': 'megaphone',
  'Gestão': 'trending-up',
  'Sistema': 'settings',
};
