import { useCallback, useEffect, useState } from 'react';

import { asApiClientError } from '@web/lib/api/errors';
import type { ApiClientError } from '@web/lib/api/errors';

/**
 * Una sola forma de esperar a la API en todo el panel: cargando, error o listo.
 * Las pantallas no guardan banderas sueltas de carga ni cadenas de error, así que
 * los tres estados se dibujan una vez en `AsyncResourceView` y no en cada una.
 */
export type AsyncResource<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly error: ApiClientError }
  | { readonly status: 'ready'; readonly data: T };

export interface AsyncResourceHandle<T> {
  readonly state: AsyncResource<T>;
  readonly reload: () => void;
}

interface Settled<T> {
  readonly load: (signal: AbortSignal) => Promise<T>;
  readonly attempt: number;
  readonly value: AsyncResource<T>;
}

const LOADING = { status: 'loading' } as const;

/**
 * `load` tiene que ser estable —`useCallback`—: es la dependencia que decide
 * cuándo se vuelve a pedir. Cada carga cancela la anterior, para que una
 * respuesta que llega tarde no pise a la de la pantalla que ya se está viendo.
 *
 * «Cargando» no se guarda, se deduce: mientras el resultado que hay no sea el de
 * la petición en curso, la pantalla está esperando. Así un cambio de petición no
 * puede dejar a la vista los datos de la anterior.
 */
export function useAsyncResource<T>(
  load: (signal: AbortSignal) => Promise<T>,
): AsyncResourceHandle<T> {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<Settled<T> | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    void load(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) {
          setSettled({ load, attempt, value: { status: 'ready', data } });
        }
      },
      (error: unknown) => {
        if (!controller.signal.aborted) {
          setSettled({ load, attempt, value: { status: 'error', error: asApiClientError(error) } });
        }
      },
    );

    return () => {
      controller.abort();
    };
  }, [load, attempt]);

  const reload = useCallback(() => {
    setAttempt((value) => value + 1);
  }, []);

  const isCurrent = settled?.load === load && settled?.attempt === attempt;

  return { state: isCurrent && settled ? settled.value : LOADING, reload };
}
