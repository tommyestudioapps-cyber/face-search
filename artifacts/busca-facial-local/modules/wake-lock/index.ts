import { requireNativeModule } from 'expo';

interface WakeLockNativeModule {
  acquire(timeoutMs: number): boolean;
  release(): boolean;
  isHeld(): boolean;
  isIgnoringBatteryOptimizations?(): boolean;
  requestIgnoreBatteryOptimizations?(): boolean;
  openBatteryOptimizationSettings?(): boolean;
  hasFullGalleryPermission?(): boolean;
  hasAnyGalleryPermission?(): boolean;
  addListener?(eventName: string, listener: (event: { action: string }) => void): { remove: () => void };
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
  hasFullGalleryPermission(): boolean | null {
    const m = getNativeModule();
    if (!m || typeof m.hasFullGalleryPermission !== 'function') {
      return null;
    }
    try {
      return Boolean(m.hasFullGalleryPermission());
    } catch (error) {
      console.warn('[WakeLock] hasFullGalleryPermission falhou', error);
      return null;
    }
  },
  hasAnyGalleryPermission(): boolean | null {
    const m = getNativeModule();
    if (!m || typeof m.hasAnyGalleryPermission !== 'function') {
      return null;
    }
    try {
      return Boolean(m.hasAnyGalleryPermission());
    } catch (error) {
      console.warn('[WakeLock] hasAnyGalleryPermission falhou', error);
      return null;
    }
  },
  addDeviceWakeListener(listener: (event: { action: string }) => void): { remove: () => void } | null {
    const m = getNativeModule();
    if (!m || typeof m.addListener !== 'function') {
      return null;
    }
    try {
      return m.addListener('onDeviceWake', listener);
    } catch (error) {
      console.warn('[WakeLock] addDeviceWakeListener falhou', error);
      return null;
    }
  },
  isAvailable(): boolean {
    return getNativeModule() !== null;
  },
};
