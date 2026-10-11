import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { ICON_PROPS, labelIcon } from './icons';

type Props = Omit<ComponentProps<typeof Link>, 'children'> & { children: ReactNode; icon?: ReturnType<typeof labelIcon> | false };

/** Link com aparência de botão e ícone inferido do texto (ex.: "Novo lead" → +). Passe icon={false} para ocultar. */
export function LinkButton({ children, icon, className = 'btn', ...rest }: Props) {
  const text = typeof children === 'string' ? children : Array.isArray(children) ? children.filter((c) => typeof c === 'string').join('') : '';
  const I = icon === false ? null : icon ?? labelIcon(text);
  const clean = typeof children === 'string' ? children.replace(/^\s*←\s*/, '') : children;
  return <Link className={`${className} ${I ? 'gap-2' : ''}`} {...rest}>{I && <I className="h-4 w-4 shrink-0" {...ICON_PROPS} />}{clean}</Link>;
}
