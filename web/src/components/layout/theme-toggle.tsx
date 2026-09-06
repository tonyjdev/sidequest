import { Moon, Sun } from 'lucide-react';

import { Button } from '@web/components/ui/button';
import { useTheme } from '@web/lib/theme/theme-context';

export function ThemeToggle() {
  const { resolved, setTheme } = useTheme();
  const next = resolved === 'dark' ? 'light' : 'dark';
  const label = next === 'dark' ? 'Activar el tema oscuro' : 'Activar el tema claro';

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={label}
      title={label}
      onClick={() => {
        setTheme(next);
      }}
    >
      {resolved === 'dark' ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
    </Button>
  );
}
