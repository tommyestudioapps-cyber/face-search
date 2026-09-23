export function shouldPauseBatch(
  processedAssets: number,
  maxAssets: number,
  elapsedMs: number,
  timeBudgetMs: number,
): boolean {
  return processedAssets >= maxAssets || elapsedMs >= timeBudgetMs;
}