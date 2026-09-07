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
        detail="La API ya los sirve en GET /settings; la pantalla que los edita llega con su tarea."
        task="SQST-0025"
        icon={Settings}
      />
    </>
  );
}
