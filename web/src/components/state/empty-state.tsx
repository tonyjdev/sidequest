import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@web/lib/utils';

interface EmptyStateProps {
  readonly icon?: LucideIcon;
  readonly title: string;
  readonly description?: string;
  readonly children?: ReactNode;
  readonly className?: string;
}

/** Hueco con explicación: sin datos, pero diciendo qué falta y qué se puede hacer. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-10 text-center',
        className,
      )}
    >
      {Icon && <Icon className="size-6 text-muted-foreground" aria-hidden="true" />}
      <p className="font-medium">{title}</p>
      {description && <p className="max-w-prose text-sm text-muted-foreground">{description}</p>}
      {children}
    </div>
  );
}
