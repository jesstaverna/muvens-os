'use client';
import { useFormStatus } from 'react-dom';
import type { ReactNode } from 'react';
import { ICON_PROPS, labelIcon } from './icons';

export function SubmitButton({ children, className = 'btn btn-primary', pendingText = 'Salvando…', confirm, icon }: { children: ReactNode; className?: string; pendingText?: string; confirm?: string; icon?: ReturnType<typeof labelIcon> | false }) {
  const { pending } = useFormStatus();
  const I = icon === false ? null : icon ?? (typeof children === 'string' ? labelIcon(children) : null);
  return (
    <button type="submit" disabled={pending} className={`${className} gap-2`}
      onClick={(e) => { if (confirm && !window.confirm(confirm)) e.preventDefault(); }}>
      {pending ? <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />{pendingText}</> : <>{I && <I className="h-4 w-4 shrink-0" {...ICON_PROPS} />}{children}</>}
    </button>
  );
}
