import {
  ArrowLeft, ArrowRightLeft, BarChart3, Ban, Bell, Briefcase, Calendar, Check, CheckCheck, CheckCircle2, Clock, Columns3, Copy, CopyPlus, Download, Eraser, ExternalLink, Eye, FileCheck, FileSignature, FileText,
  Filter, FolderKanban, HandCoins, Handshake, Inbox, KeyRound, LayoutDashboard, List, ListChecks, LogIn, LogOut, Mail, Megaphone, MessageSquare, MessageSquareWarning, PackageCheck, Palette, Pause, Pencil, Play,
  Plus, Printer, Radar, Receipt, Repeat, Save, ScanSearch, Search, Send, Settings, ShieldCheck, Sparkles, Target, Trash2, TrendingDown, TrendingUp, Upload, UserPlus, Users, Wallet, Workflow, X, type LucideIcon,
} from 'lucide-react';

export type { LucideIcon };
export const ICON_PROPS = { strokeWidth: 1.7, 'aria-hidden': true } as const;

type Rule = [RegExp, LucideIcon];
const pick = (rules: Rule[], text: string): LucideIcon | null => { const t = text.toLowerCase(); for (const [re, I] of rules) if (re.test(t)) return I; return null; };

/** Ícone a partir do rótulo de um botão (ação). Ordem importa: o primeiro que casar vence. */
const BUTTON_RULES: Rule[] = [
  [/^\s*←|voltar/, ArrowLeft], [/excluir|remover|apagar/, Trash2], [/cancelar|descartar|recusad/, X], [/duplicar/, CopyPlus], [/copiar/, Copy], [/imprimir|pdf|salvar pdf/, Printer],
  [/baixar|download|exportar/, Download], [/enviar arquivo|publicar|upload/, Upload], [/bloquear/, Ban], [/pausar/, Pause], [/reativar|iniciar/, Play], [/marcar todos|lid/, CheckCheck],
  [/converter/, ArrowRightLeft], [/analisar|reanalisar/, ScanSearch], [/aprovar|aceitar|aprovação|concluir|registrar aceite|recebido|pago|entregue/, CheckCircle2], [/ajustes/, MessageSquareWarning],
  [/buscar|pesquisar/, Search], [/filtrar|aplicar/, Filter], [/limpar/, Eraser], [/entrar/, LogIn], [/sair/, LogOut], [/editar/, Pencil], [/abrir|ver |visualizar|pré-visualizar/, Eye],
  [/enviar|gerar|marcar como enviada|emitido/, Send], [/novo|nova|adicionar|criar|cadastrar|apontar|anexar/, Plus], [/salvar|registrar|definir/, Save], [/ativar/, Check],
];
export const labelIcon = (label: string) => pick(BUTTON_RULES, label);

const TITLE_RULES: Rule[] = [
  [/dashboard|visão geral/, LayoutDashboard], [/crm|lead/, Handshake], [/prospec/, Radar], [/proposta/, FileText], [/contrato/, FileSignature], [/cliente|portal/, Users], [/brand|kv|marca/, Palette],
  [/projeto|tarefa/, FolderKanban], [/calend/, Calendar], [/tráfego|trafego/, Megaphone], [/financ|lançamento/, Wallet], [/meta|resultado/, Target], [/relat/, BarChart3], [/intelig|ia\b/, Sparkles],
  [/automa/, Workflow], [/configura|modelo/, Settings], [/alerta|notifica/, Bell], [/atendimento|mensagem|solicita/, MessageSquare], [/acesso|usu/, KeyRound],
];
export const titleIcon = (title: string) => pick(TITLE_RULES, title);

const STAT_RULES: Rule[] = [
  [/contratad/, FileSignature], [/emitid/, Receipt], [/a receber|inadimpl/, HandCoins], [/recebid/, Wallet], [/recorrente|mrr/, Repeat], [/despesa|a pagar|pago/, TrendingDown], [/resultado|margem|ticket/, TrendingUp],
  [/lead/, UserPlus], [/prospect|analisad/, Radar], [/contatad/, Send], [/respond|solicita/, MessageSquare], [/proposta/, FileText], [/negocia|convers|fechad|viraram/, Handshake], [/contrato|assinad/, FileCheck],
  [/cliente|acesso/, Users], [/projeto/, FolderKanban], [/atrasad|vencem|sem acompanhamento/, Clock], [/tarefa|revisão|rascunho/, ListChecks], [/aprova/, CheckCircle2], [/entreg/, PackageCheck],
  [/pipeline|meta/, Target], [/document/, FileText], [/e-?mail|fila/, Mail], [/pendente|jobs|execu|esgotad|falha/, Workflow], [/segur|bloque/, ShieldCheck], [/hora|tempo/, Clock], [/pontua|oportunid/, Briefcase],
];
export const statIcon = (label: string): LucideIcon => pick(STAT_RULES, label) ?? BarChart3;

const TAB_RULES: Rule[] = [
  [/kanban/, Columns3], [/lista|todos/, List], [/calend/, Calendar], [/propostas?$/, FileText], [/entreg/, PackageCheck], [/renta|financ|receber|pagar|lançamento/, Wallet], [/arquivo|documento/, FileText],
  [/regra|config|ajuste/, Settings], [/conhecimento|ia\b/, Sparkles], [/paleta|marca|cores/, Palette], [/solicita|briefing|mensagem/, MessageSquare], [/campanha|prospect/, Radar], [/bloqueio/, Ban], [/fila|e-?mail/, Mail],
  [/acesso/, KeyRound], [/servi|recorr|assinatura/, Repeat], [/projeto|produção/, FolderKanban], [/dados|geral/, Users], [/novo|cadastrar/, Plus],
];
export const tabIcon = (label: string) => pick(TAB_RULES, label);

export const EmptyIcon = Inbox;
export const SearchIcon = Search;
export { Bell, Check, ExternalLink, X };
