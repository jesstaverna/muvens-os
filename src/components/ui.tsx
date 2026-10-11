import Link from 'next/link';
import type { ReactNode } from 'react';
import { EmptyIcon, ICON_PROPS, statIcon, tabIcon, titleIcon, type LucideIcon } from './icons';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';

export function PageHeader({ title, subtitle, actions, icon }: { title: string; subtitle?: string; actions?: ReactNode; icon?: LucideIcon | false }) {
  const I = icon === false ? null : icon ?? titleIcon(title);
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="flex items-start gap-4">{I && <span className="mt-1 grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-lime text-black"><I className="h-5 w-5" {...ICON_PROPS} /></span>}<div><h1 className="h1">{title}</h1>{subtitle && <p className="mt-1.5 text-sm text-muted">{subtitle}</p>}</div></div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Stat({ label, value, hint, tone, href, icon, delta }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'danger' | 'ok' | 'lime'; href?: string; icon?: LucideIcon | false; delta?: { pct: number | null; goodWhenUp?: boolean } }) {
  const I = icon === false ? null : icon ?? statIcon(label);
  const body = (
    <div className={`card h-full ${tone === 'lime' ? 'bg-lime text-black border-transparent' : ''}`}>
      <div className="flex items-start justify-between gap-2"><div className={`text-xs font-medium uppercase tracking-wider ${tone === 'lime' ? 'text-black/60' : 'text-muted'}`}>{label}</div>
        {I && <I className={`h-[18px] w-[18px] shrink-0 ${tone === 'lime' ? 'text-black/60' : tone === 'danger' ? 'text-danger' : 'text-muted'}`} {...ICON_PROPS} />}</div>
      <div className={`mt-3 text-2xl font-semibold tracking-tight ${tone === 'danger' ? 'text-danger' : ''}`}>{value}</div>
      {delta && delta.pct != null && Number.isFinite(delta.pct) && (() => { const up = delta.pct >= 0; const good = (delta.goodWhenUp ?? true) ? up : !up; const D = up ? ArrowUpRight : ArrowDownRight; return <div className={`mt-1.5 flex items-center gap-1 text-xs font-medium ${tone === 'lime' ? 'text-black/70' : good ? 'text-ok' : 'text-danger'}`}><D className="h-3.5 w-3.5" {...ICON_PROPS} />{Math.abs(Math.round(delta.pct))}% vs. período anterior</div>; })()}
      {hint && <div className={`mt-1.5 text-xs ${tone === 'lime' ? 'text-black/60' : 'text-muted'}`}>{hint}</div>}
    </div>
  );
  return href ? <Link href={href} className="block transition hover:opacity-90">{body}</Link> : body;
}

export function Empty({ title, text, action, icon }: { title: string; text?: string; action?: ReactNode; icon?: LucideIcon }) {
  const I = icon ?? EmptyIcon;
  return (
    <div className="rounded-2xl border border-dashed border-line px-6 py-14 text-center">
      <span className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-subtle text-muted"><I className="h-6 w-6" {...ICON_PROPS} /></span>
      <div className="text-base font-medium">{title}</div>
      {text && <p className="mx-auto mt-1.5 max-w-md text-sm text-muted">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Pending({ children }: { children: ReactNode }) {
  return <span className="badge border-amber-500/40 bg-amber-500/10 text-warn">{children}</span>;
}

export function Tabs({ items, current }: { items: { key: string; label: string; href: string; icon?: LucideIcon }[]; current: string }) {
  return (
    <div className="mb-6 flex gap-1 overflow-x-auto border-b border-line">
      {items.map((t) => { const I = t.icon ?? tabIcon(t.label); return (
        <Link key={t.key} href={t.href} className={`flex items-center gap-2 whitespace-nowrap px-4 py-2.5 text-sm ${current === t.key ? 'border-b-2 border-fg font-medium' : 'text-muted hover:text-fg'}`}>{I && <I className="h-4 w-4" {...ICON_PROPS} />}{t.label}</Link>); })}
    </div>
  );
}
