import { requireNativeModule } from 'expo';

interface WakeLockNativeModule {
  acquire(timeoutMs: number): boolean;
  release(): boolean;
  isHeld(): boolean;
}

let nativeModule: WakeLockNativeModule | null = null;
let loadAttempted = false;

function getNativeModule(): WakeLockNativeModule | null {
  if (loadAttempted) return nativeModule;
  loadAttempted = true;
  try {
    nativeModule = requireNativeModule<WakeLockNativeModule>('WakeLock');
    return nativeModule;
  } catch (error) {
    console.warn(
      '[WakeLock] módulo nativo indisponível; wake lock desabilitado.',
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }
}

export const WakeLock = {
  acquire(timeoutMs: number): boolean {
    const m = getNativeModule();
    if (!m) return false;
    try {
      return m.acquire(timeoutMs);
    } catch (error) {
      console.warn('[WakeLock] acquire falhou', error);
      return false;
    }
  },
  release(): boolean {
    const m = getNativeModule();
    if (!m) return false;
    try {
      return m.release();
    } catch (error) {
      console.warn('[WakeLock] release falhou', error);
      return false;
    }
  },
  isHeld(): boolean {
    const m = getNativeModule();
    if (!m) return false;
    try {
      return m.isHeld();
    } catch {
      return false;
    }
  },
  isAvailable(): boolean {
    return getNativeModule() !== null;
  },
};
