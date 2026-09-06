import { RouterProvider, createBrowserRouter } from 'react-router';

import { ThemeProvider } from '@web/components/theme-provider';
import { panelRoutes } from '@web/routes';

const router = createBrowserRouter(panelRoutes);

export function App() {
  return (
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>
  );
}
