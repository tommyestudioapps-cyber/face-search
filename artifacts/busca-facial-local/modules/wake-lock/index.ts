import { requireNativeModule } from 'expo';

interface WakeLockNativeModule {
  acquire(timeoutMs: number): boolean;
  release(): boolean;
  isHeld(): boolean;
}

const nativeModule = requireNativeModule<WakeLockNativeModule>('WakeLock');

export const WakeLock = {
  acquire(timeoutMs: number): boolean {
    return nativeModule.acquire(timeoutMs);
  },
  release(): boolean {
    return nativeModule.release();
  },
  isHeld(): boolean {
    return nativeModule.isHeld();
  },
};
