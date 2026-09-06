import { Menu } from 'lucide-react';
import { useState } from 'react';
import { Outlet } from 'react-router';

import { SidebarNav } from '@web/components/layout/sidebar-nav';
import { ThemeToggle } from '@web/components/layout/theme-toggle';
import { Button } from '@web/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@web/components/ui/sheet';
import { PANEL_SUBTITLE, PANEL_TITLE } from '@web/panel-info';

/**
 * Armazón del panel: navegación lateral fija a partir de `md` y cajón sobre la
 * pantalla por debajo. El contenido de cada ruta entra por el `Outlet`, así que
 * cambiar de sección no vuelve a montar la cabecera ni la navegación.
 */
export function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-svh bg-background text-foreground md:grid md:grid-cols-[16rem_1fr]">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:shadow"
      >
        Saltar al contenido
      </a>

      <aside className="sticky top-0 hidden h-svh flex-col border-r bg-sidebar text-sidebar-foreground md:flex">
        <div className="flex flex-col gap-0.5 border-b px-5 py-4">
          <span className="font-heading text-base font-semibold">{PANEL_TITLE}</span>
          <span className="text-xs text-muted-foreground">{PANEL_SUBTITLE}</span>
        </div>
        <SidebarNav />
      </aside>

      <div className="flex min-h-svh flex-col">
        <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur md:px-8">
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                aria-label="Abrir la navegación"
              >
                <Menu aria-hidden="true" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 gap-0 p-0">
              <SheetHeader className="border-b">
                <SheetTitle>{PANEL_TITLE}</SheetTitle>
                <SheetDescription>{PANEL_SUBTITLE}</SheetDescription>
              </SheetHeader>
              {/* El cajón se cierra al elegir sección: si no, taparía la pantalla recién abierta. */}
              <SidebarNav
                onNavigate={() => {
                  setMenuOpen(false);
                }}
              />
            </SheetContent>
          </Sheet>

          <span className="font-heading font-semibold md:hidden">{PANEL_TITLE}</span>

          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </header>

        <main id="contenido" className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 md:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
