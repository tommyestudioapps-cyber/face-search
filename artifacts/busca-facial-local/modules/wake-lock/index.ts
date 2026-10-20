import { requireNativeModule } from 'expo';

interface WakeLockNativeModule {
  acquire(timeoutMs: number): boolean;
  release(): boolean;
  isHeld(): boolean;
  isIgnoringBatteryOptimizations?(): boolean;
  requestIgnoreBatteryOptimizations?(): boolean;
  openBatteryOptimizationSettings?(): boolean;
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
  isIgnoringBatteryOptimizations(): boolean {
    const m = getNativeModule();
    if (!m || typeof m.isIgnoringBatteryOptimizations !== 'function') {
      return false;
    }
    try {
      return Boolean(m.isIgnoringBatteryOptimizations());
    } catch (error) {
      console.warn('[WakeLock] isIgnoringBatteryOptimizations falhou', error);
      return false;
    }
  },
  requestIgnoreBatteryOptimizations(): boolean {
    const m = getNativeModule();
    if (!m || typeof m.requestIgnoreBatteryOptimizations !== 'function') {
      return false;
    }
    try {
      return Boolean(m.requestIgnoreBatteryOptimizations());
    } catch (error) {
      console.warn('[WakeLock] requestIgnoreBatteryOptimizations falhou', error);
      return false;
    }
  },
  openBatteryOptimizationSettings(): boolean {
    const m = getNativeModule();
    if (!m || typeof m.openBatteryOptimizationSettings !== 'function') {
      return false;
    }
    try {
      return Boolean(m.openBatteryOptimizationSettings());
    } catch (error) {
      console.warn('[WakeLock] openBatteryOptimizationSettings falhou', error);
      return false;
    }
  },
  isAvailable(): boolean {
    return getNativeModule() !== null;
  },
};
