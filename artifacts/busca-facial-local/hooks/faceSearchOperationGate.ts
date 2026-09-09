export type FaceSearchOperationKind =
  | 'initializing'
  | 'indexing'
  | 'searching'
  | 'clearing';

export class FaceSearchOperationGate {
  private activeOperation: Promise<unknown> | null = null;
  private pendingClear: Promise<void> | null = null;

  getActiveOperation(): Promise<unknown> | null {
    return this.activeOperation;
  }

  isBusy(): boolean {
    return this.activeOperation !== null;
  }

  async waitForClear(): Promise<void> {
    const pendingClear = this.pendingClear;
    if (pendingClear) {
      await pendingClear;
    }
  }

  run<T>(operation: () => Promise<T>): Promise<T> {
    const pendingClear = this.pendingClear;
    const currentOperation = (async () => {
      if (pendingClear) {
        await pendingClear.catch(() => undefined);
      }
      return operation();
    })();

    this.activeOperation = currentOperation;
    void currentOperation
      .finally(() => {
        if (this.activeOperation === currentOperation) {
          this.activeOperation = null;
        }
      })
      .catch(() => undefined);

    return currentOperation;
  }

  clear(clearAction: () => Promise<void>): Promise<void> {
    if (this.pendingClear) {
      return this.pendingClear;
    }

    const activeOperation = this.activeOperation;
    const clearing = (async () => {
      if (activeOperation) {
        await activeOperation.catch(() => undefined);
      }
      await clearAction();
    })();

    this.pendingClear = clearing;
    this.activeOperation = clearing;
    void clearing
      .finally(() => {
        if (this.pendingClear === clearing) {
          this.pendingClear = null;
        }
        if (this.activeOperation === clearing) {
          this.activeOperation = null;
        }
      })
      .catch(() => undefined);

    return clearing;
  }
}