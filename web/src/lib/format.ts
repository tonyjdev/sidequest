/** Duración en segundos como texto breve: `45 s`, `12 min`, `3 h 07 min`. */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));

  if (total < 60) return `${String(total)} s`;

  const minutes = Math.floor(total / 60);

  if (minutes < 60) return `${String(minutes)} min`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  return `${String(hours)} h ${String(rest).padStart(2, '0')} min`;
}
