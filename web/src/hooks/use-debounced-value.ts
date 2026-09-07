import { useEffect, useState } from 'react';

/**
 * El valor, pero quieto: cambia cuando deja de cambiar. Lo usa la búsqueda del
 * listado, que si no pediría una vez por tecla —la petición anterior se cancela,
 * pero viaja igual.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSettled(value);
    }, delayMs);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delayMs]);

  return settled;
}
