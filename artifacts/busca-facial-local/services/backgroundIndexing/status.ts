export type BackgroundIndexStatus =
  | 'idle'
  | 'running'
  | 'paused'
  | 'waiting'
  | 'completed'
  | 'cancelled'
  | 'error';

export type BackgroundIndexScope = 'gallery' | 'album';

export interface BackgroundIndexState {
  status: BackgroundIndexStatus;
  scope: BackgroundIndexScope;
  processedAssets: number;
  totalAssets: number | null;
  lastAssetId: string | null;
  lastStartedAt: number | null;
  lastCompletedAt: number | null;
  lastError: string | null;
}

export type BackgroundIndexStatePatch = Partial<BackgroundIndexState>;