import type { RouteObject } from 'react-router';

import { AppShell } from '@web/components/layout/app-shell';
import { DashboardPage } from '@web/pages/dashboard-page';
import { ImportPage } from '@web/pages/import-page';
import { NotFoundPage } from '@web/pages/not-found-page';
import { QuestionsPage } from '@web/pages/questions-page';
import { RouteErrorPage } from '@web/pages/route-error-page';
import { SettingsPage } from '@web/pages/settings-page';
import { TopicsPage } from '@web/pages/topics-page';

/**
 * Las cinco secciones de `navigation.ts`, más el comodín para una dirección que
 * no existe. Todas cuelgan del mismo armazón: navegar cambia el `Outlet`, no la
 * página, así que el panel no se recarga al moverse entre secciones.
 */
export const panelRoutes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'temas', element: <TopicsPage /> },
      { path: 'preguntas', element: <QuestionsPage /> },
      { path: 'importacion', element: <ImportPage /> },
      { path: 'ajustes', element: <SettingsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
