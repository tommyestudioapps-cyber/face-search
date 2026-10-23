export const DEFAULT_PRECISION_LEVEL = 6;
export const MIN_PRECISION_LEVEL = 0;
export const MAX_PRECISION_LEVEL = 10;
export const BASE_THRESHOLD = 0.50;
export const STEP_THRESHOLD = 0.01;
export const PRECISION_STORAGE_KEY = 'visage.search.precision_level';

/**
 * Converte o nível inteiro do slider (0 a 10) para o limiar de similaridade de cosseno (0.50 a 0.60).
 * Nível 0 = 0.50 (Baixa)
 * Nível 6 = 0.56 (Padrão de fábrica, destacado em vermelho)
 * Nível 10 = 0.60 (Alta)
 */
export function precisionLevelToThreshold(level: number): number {
  const safeLevel = Number.isFinite(level) ? level : DEFAULT_PRECISION_LEVEL;
  const clamped = Math.min(Math.max(Math.round(safeLevel), MIN_PRECISION_LEVEL), MAX_PRECISION_LEVEL);
  return Number((BASE_THRESHOLD + clamped * STEP_THRESHOLD).toFixed(2));
}
