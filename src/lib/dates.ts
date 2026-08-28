export function daysBetween(fromIso: string, toIso: string): number {
  const elapsedMs = new Date(toIso).getTime() - new Date(fromIso).getTime();
  return Math.max(0, Math.floor(elapsedMs / (1000 * 60 * 60 * 24)));
}
