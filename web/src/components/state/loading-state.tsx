import { Skeleton } from '@web/components/ui/skeleton';

interface LoadingStateProps {
  /** Cuántas líneas dibuja el esqueleto; ajústalo a lo que ocupará el contenido. */
  readonly lines?: number;
  readonly label?: string;
}

/**
 * Espera con forma: un esqueleto de la altura aproximada del contenido, para que
 * la pantalla no salte al llegar los datos. El texto solo lo lee el lector de
 * pantalla, que si no anunciaría un cambio sin decir cuál.
 */
export function LoadingState({ lines = 3, label = 'Cargando…' }: LoadingStateProps) {
  return (
    <div className="space-y-3" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} className="h-4 w-full last:w-2/3" />
      ))}
    </div>
  );
}
