import { faceSearchRepository } from '@/services/faceSearch/repository';

export async function reconcileOrphanRunningState(
  repository: typeof faceSearchRepository = faceSearchRepository,
): Promise<void> {
  const state = await repository.getBackgroundIndexState();
  if (state.status !== 'running') return;

  const generation = await repository.getActiveScanGeneration();
  if (generation === null) {
    await repository.updateBackgroundIndexState({
      status: 'paused',
      lastError: null,
    });
    return;
  }

  const aborted = await repository.abortScanIfUnleased(generation);
  if (!aborted) return;

  await repository.updateBackgroundIndexState({
    status: 'paused',
    lastError: null,
  });
}