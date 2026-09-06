/**
 * Sesión de trabajo de un agente (docs/especificacion.md §3.8). Agrupa los
 * intentos, sostiene el control de frecuencia y es donde se persiste la pausa
 * que pide `sidequest_pause`.
 */
export interface Session {
  readonly id: number;
  readonly agent: string;
  /** Identificador de sesión del propio agente. `null` es una sesión anónima. */
  readonly externalRef: string | null;
  readonly startedAt: Date;
  readonly lastSeenAt: Date;
  readonly askedCount: number;
  readonly pausedUntil: Date | null;
  readonly pausedForQuestions: number | null;
}

/**
 * Con qué se abre o se reutiliza una sesión. `(agent, external_ref)` es único:
 * dos llamadas con la misma referencia continúan la misma sesión en vez de
 * partir los contadores en dos.
 */
export interface SessionKey {
  readonly agent: string;
  readonly externalRef: string | null;
}

/** Pausa por tiempo, por número de preguntas, o las dos a la vez. */
export interface SessionPause {
  readonly until: Date | null;
  readonly forQuestions: number | null;
}
