import { FolderTree, Gauge, ListChecks, Settings, Upload, type LucideIcon } from 'lucide-react';

/**
 * Las cinco secciones del panel (docs/especificacion.md §8), declaradas una vez:
 * de aquí salen las rutas, la navegación lateral y la del cajón móvil, así que no
 * pueden desincronizarse.
 */
export interface NavigationItem {
  readonly to: string;
  readonly label: string;
  readonly description: string;
  readonly icon: LucideIcon;
}

export const navigationItems: readonly NavigationItem[] = [
  {
    to: '/',
    label: 'Panel de control',
    description: 'Aciertos, fallos y evolución en el tiempo.',
    icon: Gauge,
  },
  {
    to: '/temas',
    label: 'Temas',
    description: 'Materias, temas y subtemas del contenido.',
    icon: FolderTree,
  },
  {
    to: '/preguntas',
    label: 'Preguntas',
    description: 'Enunciados, opciones, recursos y etiquetas.',
    icon: ListChecks,
  },
  {
    to: '/importacion',
    label: 'Importación',
    description: 'Plantilla, validación y previsualización de lotes.',
    icon: Upload,
  },
  {
    to: '/ajustes',
    label: 'Ajustes',
    description: 'Opciones visibles, ponderación, enfriamiento y frecuencia.',
    icon: Settings,
  },
];
