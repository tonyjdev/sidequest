import { ListChecks } from 'lucide-react';

import { PageHeader } from '@web/components/layout/page-header';
import { PendingSection } from '@web/components/pending-section';

export function QuestionsPage() {
  return (
    <>
      <PageHeader
        title="Preguntas"
        description="Enunciados con sus opciones, recursos y etiquetas, agrupados por subtema."
      />
      <PendingSection
        title="Gestión de preguntas y respuestas"
        description="La pregunta es un agregado: sus opciones y sus recursos se editan con ella."
        detail="La pantalla de preguntas llega con su tarea; el andamiaje y la navegación ya están."
        task="SQST-0011"
        icon={ListChecks}
      />
    </>
  );
}
