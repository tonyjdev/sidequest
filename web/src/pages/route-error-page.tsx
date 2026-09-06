import { isRouteErrorResponse, useRouteError } from 'react-router';

import { PageHeader } from '@web/components/layout/page-header';
import { ErrorState } from '@web/components/state/error-state';
import { ApiClientError, asApiClientError } from '@web/lib/api/errors';

/**
 * Última red del enrutador: un fallo al renderizar una ruta se enseña con su
 * mensaje en lugar de dejar la pantalla en blanco.
 */
export function RouteErrorPage() {
  const error = useRouteError();

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-8">
      <PageHeader title="Algo ha fallado en el panel" />
      <ErrorState error={toError(error)} title="La sección no se pudo mostrar" />
    </div>
  );
}

function toError(error: unknown): ApiClientError {
  if (isRouteErrorResponse(error)) {
    return new ApiClientError(
      'invalid_response',
      `${String(error.status)} ${error.statusText}`,
      error.status,
      error.data,
    );
  }

  return asApiClientError(error);
}
