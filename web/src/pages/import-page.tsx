import { Upload } from 'lucide-react';

import { PageHeader } from '@web/components/layout/page-header';
import { PendingSection } from '@web/components/pending-section';

export function ImportPage() {
  return (
    <>
      <PageHeader
        title="Importación"
        description="Dos fases: previsualizar clasifica el lote sin escribir y confirmar guarda lo aceptado."
      />
      <PendingSection
        title="Importación de lotes"
        description="Plantilla y JSON Schema, validación, previsualización y confirmación."
        detail="El formato se fija en SQST-0018 y la pantalla llega después; aquí solo está su sitio."
        task="SQST-0019"
        icon={Upload}
      />
    </>
  );
}
