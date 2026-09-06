import { AlertTriangle, RotateCw } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@web/components/ui/alert';
import { Button } from '@web/components/ui/button';
import type { ApiClientError } from '@web/lib/api/errors';

interface ErrorStateProps {
  readonly error: ApiClientError;
  readonly title?: string;
  readonly onRetry?: () => void;
}

/**
 * El mensaje que se enseña es **el del servidor**. La API ya explica en su
 * envoltorio qué ha rechazado y por qué (docs/especificacion.md §5); sustituirlo
 * por un «ha ocurrido un error» tiraría justo la parte accionable.
 */
export function ErrorState({
  error,
  title = 'No se pudo completar la operación',
  onRetry,
}: ErrorStateProps) {
  const issues = error.fieldIssues;

  return (
    <Alert variant="destructive">
      <AlertTriangle />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <p>{error.message}</p>
        {issues.length > 0 && (
          <ul className="list-disc pl-4">
            {issues.map((issue) => (
              <li key={`${issue.field}:${issue.message}`}>
                <span className="font-medium">{issue.field}</span>: {issue.message}
              </li>
            ))}
          </ul>
        )}
        {onRetry && (
          <Button variant="outline" size="sm" className="mt-1" onClick={onRetry}>
            <RotateCw />
            Reintentar
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
