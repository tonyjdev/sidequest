import { Settings } from 'lucide-react';

import { PageHeader } from '@web/components/layout/page-header';
import { PendingSection } from '@web/components/pending-section';

export function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Ajustes"
        description="Parámetros globales de selección: opciones visibles, ponderación, enfriamiento y frecuencia."
      />
      <PendingSection
        title="Parámetros globales"
        description="Los valores que gobiernan el sorteo se ajustan aquí, sin desplegar."
        detail="La edición de `settings` llega con la tarea de estadísticas y ajustes del panel."
        task="SQST-0016"
        icon={Settings}
      />
    </>
  );
}
