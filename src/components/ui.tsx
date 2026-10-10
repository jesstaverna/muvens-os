import Link from 'next/link';
import type { ReactNode } from 'react';

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div><h1 className="h1">{title}</h1>{subtitle && <p className="mt-1.5 text-sm text-muted">{subtitle}</p>}</div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Stat({ label, value, hint, tone, href }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'danger' | 'ok' | 'lime'; href?: string }) {
  const body = (
    <div className={`card h-full ${tone === 'lime' ? 'bg-lime text-black border-transparent' : ''}`}>
      <div className={`text-xs font-medium uppercase tracking-wider ${tone === 'lime' ? 'text-black/60' : 'text-muted'}`}>{label}</div>
      <div className={`mt-3 text-2xl font-semibold tracking-tight ${tone === 'danger' ? 'text-danger' : ''}`}>{value}</div>
      {hint && <div className={`mt-1.5 text-xs ${tone === 'lime' ? 'text-black/60' : 'text-muted'}`}>{hint}</div>}
    </div>
  );
  return href ? <Link href={href} className="block transition hover:opacity-90">{body}</Link> : body;
}

export function Empty({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line px-6 py-14 text-center">
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

export function Tabs({ items, current }: { items: { key: string; label: string; href: string }[]; current: string }) {
  return (
    <div className="mb-6 flex gap-1 overflow-x-auto border-b border-line">
      {items.map((t) => (
        <Link key={t.key} href={t.href} className={`whitespace-nowrap px-4 py-2.5 text-sm ${current === t.key ? 'border-b-2 border-fg font-medium' : 'text-muted hover:text-fg'}`}>{t.label}</Link>
      ))}
    </div>
  );
}
