import {
  BarChart3, Calendar, Radar, DoorOpen, FileBarChart, FileSignature, FileText, Kanban, LayoutDashboard, ListChecks, MessageCircle,
  Palette, Settings, Sparkles, Target, Users, Wallet, Workflow, type LucideIcon,
} from 'lucide-react';

const MAP: Record<string, LucideIcon> = {
  'layout-dashboard': LayoutDashboard, kanban: Kanban, 'message-circle': MessageCircle, 'file-text': FileText, 'file-signature': FileSignature,
  users: Users, palette: Palette, 'list-checks': ListChecks, calendar: Calendar, 'bar-chart-3': BarChart3, wallet: Wallet, target: Target,
  'file-bar-chart': FileBarChart, sparkles: Sparkles, 'door-open': DoorOpen, radar: Radar, workflow: Workflow, settings: Settings,
};

export function Icon({ name, className = 'h-[18px] w-[18px]' }: { name: string; className?: string }) {
  const C = MAP[name] ?? LayoutDashboard;
  return <C className={className} strokeWidth={1.6} aria-hidden />;
}
