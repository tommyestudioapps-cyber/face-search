export type IndexOperation = 'background' | 'manual-index' | 'search' | 'clear' | 'initializing';
type CoordinatedOperation = IndexOperation | 'dispose';
export type IndexOperationState = 'running' | 'finished' | 'failed';

export interface IndexOperationStatus {
  operation: IndexOperation;
  state: IndexOperationState;
  updatedAt: number;
}

interface PendingOperation {
  kind: CoordinatedOperation;
  execute: () => void;
}

// Serializes native model use in one JS runtime. SQLite still owns the
// cross-runtime gallery generation reservation.
export class IndexCoordinator {
  private active: CoordinatedOperation | null = null;
  private pending: PendingOperation[] = [];
  private lastStatus: IndexOperationStatus | null = null;
  private pendingStatusWrite: Promise<void> = Promise.resolve();

  constructor(
    private readonly saveStatus: (status: IndexOperationStatus) => Promise<void>,
  ) {}

  getLastStatus(): IndexOperationStatus | null {
    return this.lastStatus;
  }

  waitForStatusPersistence(): Promise<void> {
    return this.pendingStatusWrite;
  }

  shouldYieldBackground(): boolean {
    return this.active === 'background' &&
      this.pending.some(({ kind }) => kind === 'search' || kind === 'clear' || kind === 'manual-index');
  }

  run<T>(kind: CoordinatedOperation, action: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const execute = () => {
        void (async () => {
          try {
            if (kind !== 'dispose') this.updateStatus(kind, 'running');
            const result = await action();
            if (kind !== 'dispose') this.updateStatus(kind, 'finished');
            resolve(result);
          } catch (error) {
            if (kind !== 'dispose') this.updateStatus(kind, 'failed');
            reject(error);
          } finally {
            this.active = null;
            this.dispatchNext();
          }
        })();
      };
      this.pending.push({ kind, execute });
      this.dispatchNext();
    });
  }

  private updateStatus(
    operation: IndexOperation,
    state: IndexOperationState,
  ): void {
    const status = { operation, state, updatedAt: Date.now() };
    this.lastStatus = status;
    this.pendingStatusWrite = this.pendingStatusWrite
      .catch(() => undefined)
      .then(() => this.saveStatus(status))
      .catch((error) => {
        console.warn('[IndexCoordinator] Não foi possível salvar o estado.', error);
      });
  }

  private dispatchNext(): void {
    if (this.active !== null || this.pending.length === 0) return;
    const manualIndex = this.pending.findIndex(({ kind }) => kind !== 'background');
    const [next] = this.pending.splice(manualIndex === -1 ? 0 : manualIndex, 1);
    this.active = next.kind;
    next.execute();
  }
}