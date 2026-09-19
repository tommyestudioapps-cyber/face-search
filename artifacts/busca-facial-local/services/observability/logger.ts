/**
 * Observabilidade DEV-only com amostragem. Durante a indexação da
 * galeria, logar cada foto via WebSocket do Metro pode estourar o
 * buffer do dev server e derrubar o app. Por isso, amostramos.
 */

let photoCount = 0;

export function shouldLogPhoto(): boolean {
  if (!__DEV__) return false;
  photoCount += 1;
  if (photoCount <= 20) return true;
  if (photoCount <= 100) return photoCount % 5 === 0;
  return photoCount % 25 === 0;
}

export function logIndexProgress(
  processed: number,
  total: number,
  elapsedMs: number,
): void {
  if (!__DEV__) return;
  const avgMs = processed > 0 ? elapsedMs / processed : 0;
  console.log(
    `[Index] ${processed}/${total} fotos | ` +
      `${Math.round(avgMs)}ms/foto | ` +
      `decorrido ${Math.round(elapsedMs / 1000)}s`,
  );
}

export interface PhotoTiming {
  assetId: string;
  totalMs: number;
  detectMs: number;
  embedMs: number;
  faceCount: number;
  skipped: boolean;
}

export function logPhotoTiming(timing: PhotoTiming): void {
  if (!__DEV__) return;
  console.log(
    `[Index:photo] ${timing.assetId} | ` +
      `total=${Math.round(timing.totalMs)}ms | ` +
      `detect=${Math.round(timing.detectMs)}ms | ` +
      `embed=${Math.round(timing.embedMs)}ms | ` +
      `faces=${timing.faceCount} | ` +
      `skipped=${timing.skipped}`,
  );
}

/**
 * Cede o thread JS para o event loop. Permite que o GC do Hermes e o
 * Android recuperem memória entre fotos, evitando OOM killer.
 */
export async function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export function logDelegateAttempt(
  delegate: 'GPU' | 'CPU',
  durationMs: number,
  succeeded: boolean,
): void {
  if (!__DEV__) return;
  console.log(
    `[Delegate] ${delegate} ${succeeded ? 'ok' : 'falhou'} ${Math.round(durationMs)}ms`,
  );
}