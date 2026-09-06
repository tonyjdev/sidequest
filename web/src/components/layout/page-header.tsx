import type { ReactNode } from 'react';

interface PageHeaderProps {
  readonly title: string;
  readonly description?: string;
  readonly children?: ReactNode;
}

/**
 * Encabezado de pantalla: un único `h1` por ruta, con sus acciones a la derecha.
 * Es un `div` y no un `header` a propósito: el único encabezado del panel —el que
 * lee la tecnología asistiva como tal— es el del armazón.
 */
export function PageHeader({ title, description, children }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </div>
  );
}
