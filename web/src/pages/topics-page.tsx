import { FolderTree } from 'lucide-react';

import { PageHeader } from '@web/components/layout/page-header';
import { PendingSection } from '@web/components/pending-section';

export function TopicsPage() {
  return (
    <>
      <PageHeader
        title="Temas"
        description="Materias, temas y subtemas: los tres niveles de los que cuelga cada pregunta."
      />
      <PendingSection
        title="Gestión de temas y subtemas"
        description="Alta, edición, publicación, archivado y orden manual de los tres niveles."
        detail="La pantalla de contenido llega con su tarea; el andamiaje y la navegación ya están."
        task="SQST-0010"
        icon={FolderTree}
      />
    </>
  );
}
