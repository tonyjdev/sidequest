import type { ReactNode } from 'react';

import { EmptyState } from '@web/components/state/empty-state';
import { ErrorState } from '@web/components/state/error-state';
import { LoadingState } from '@web/components/state/loading-state';
import type { AsyncResourceHandle } from '@web/hooks/use-async-resource';

interface AsyncResourceViewProps<T> {
  readonly resource: AsyncResourceHandle<T>;
  readonly children: (data: T) => ReactNode;
  readonly errorTitle?: string;
  readonly loadingLines?: number;
  /** Cuándo los datos, aunque hayan llegado, no tienen nada que enseñar. */
  readonly isEmpty?: (data: T) => boolean;
  readonly empty?: ReactNode;
}

/**
 * El único sitio donde se decide qué se ve mientras se espera, cuando falla y
 * cuando no hay nada. Las pantallas describen su contenido y nada más; así los
 * tres estados no se resuelven distinto en cada una.
 */
export function AsyncResourceView<T>({
  resource,
  children,
  errorTitle,
  loadingLines,
  isEmpty,
  empty,
}: AsyncResourceViewProps<T>) {
  const { state } = resource;

  if (state.status === 'loading')
    return <LoadingState {...(loadingLines ? { lines: loadingLines } : {})} />;

  if (state.status === 'error') {
    return (
      <ErrorState
        error={state.error}
        onRetry={resource.reload}
        {...(errorTitle ? { title: errorTitle } : {})}
      />
    );
  }

  if (isEmpty?.(state.data) === true) {
    return <>{empty ?? <EmptyState title="Todavía no hay nada aquí" />}</>;
  }

  return <>{children(state.data)}</>;
}
