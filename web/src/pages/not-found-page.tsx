import { Compass } from 'lucide-react';
import { Link } from 'react-router';

import { PageHeader } from '@web/components/layout/page-header';
import { EmptyState } from '@web/components/state/empty-state';
import { Button } from '@web/components/ui/button';

export function NotFoundPage() {
  return (
    <>
      <PageHeader title="Sección no encontrada" />
      <EmptyState
        icon={Compass}
        title="Esta dirección no existe en el panel"
        description="Puede que el enlace esté mal escrito o que la sección todavía no se haya construido."
      >
        <Button asChild variant="outline" size="sm">
          <Link to="/">Volver al panel de control</Link>
        </Button>
      </EmptyState>
    </>
  );
}
