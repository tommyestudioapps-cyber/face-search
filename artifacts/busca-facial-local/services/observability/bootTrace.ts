const bootStart = Date.now();

export function bootMark(tag: string): void {
  const elapsed = Date.now() - bootStart;
  console.warn(`[BOOT] ${tag} (+${elapsed}ms, t=${Date.now()})`);
}
