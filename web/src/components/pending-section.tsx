import type { LucideIcon } from 'lucide-react';

import { EmptyState } from '@web/components/state/empty-state';
import { Badge } from '@web/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@web/components/ui/card';

interface PendingSectionProps {
  readonly title: string;
  readonly description: string;
  readonly detail: string;
  /** Tarea que trae el contenido real de la sección. */
  readonly task: string;
  readonly icon?: LucideIcon;
}

/**
 * Sección del panel cuyo contenido llega en una tarea posterior. Dice cuál, en
 * vez de dejar una pantalla en blanco que parezca rota.
 */
export function PendingSection({ title, description, detail, task, icon }: PendingSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <EmptyState {...(icon ? { icon } : {})} title="Todavía sin contenido" description={detail}>
          <Badge variant="outline">{task}</Badge>
        </EmptyState>
      </CardContent>
    </Card>
  );
}
