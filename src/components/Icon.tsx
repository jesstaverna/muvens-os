import {
  BarChart3, Bell, BriefcaseBusiness, Building2, Calendar, ClipboardCheck, DoorOpen, FileBarChart,
  FileSignature, FileText, Handshake, House, Kanban, LayoutDashboard, ListChecks, Megaphone,
  MessageCircle, Palette, Radar, Settings, Sparkles, Target, TrendingUp, Users, UsersRound,
  Wallet, Workflow, type LucideIcon,
} from 'lucide-react';

const MAP: Record<string, LucideIcon> = {
  'layout-dashboard': LayoutDashboard,
  'house': House,
  'bell': Bell,
  'handshake': Handshake,
  'building-2': Building2,
  'briefcase-business': BriefcaseBusiness,
  'megaphone': Megaphone,
  'trending-up': TrendingUp,
  'clipboard-check': ClipboardCheck,
  'users-round': UsersRound,
  'kanban': Kanban,
  'message-circle': MessageCircle,
  'file-text': FileText,
  'file-signature': FileSignature,
  'users': Users,
  'palette': Palette,
  'list-checks': ListChecks,
  'calendar': Calendar,
  'bar-chart-3': BarChart3,
  'wallet': Wallet,
  'target': Target,
  'file-bar-chart': FileBarChart,
  'sparkles': Sparkles,
  'door-open': DoorOpen,
  'radar': Radar,
  'workflow': Workflow,
  'settings': Settings,
};

export function Icon({ name, className = 'h-[18px] w-[18px]' }: { name: string; className?: string }) {
  const C = MAP[name] ?? LayoutDashboard;
  return <C className={className} strokeWidth={1.6} aria-hidden />;
}
