import { faceSearchRepository } from '@/services/faceSearch/repository';

/**
 * Reconcilia estado órfão de indexação no boot.
 *
 * Quando o processo é encerrado abruptamente, o SQLite pode ficar com
 * status='running' mas nenhum loop realmente ativo. Este reconcile marca
 * o status como 'paused' para a UI não mostrar "em andamento" sem que
 * nada esteja rodando.
 *
 * IMPORTANTE: NÃO chamamos abortScanIfUnleased. A geração ativa precisa
 * ser preservada para que o próximo batchRunner possa retomar de onde
 * parou. O claimScan já lida com leases expiradas naturalmente, assumindo
 * a geração existente e o cursor salvo.
 */
export async function reconcileOrphanRunningState(
  repository: typeof faceSearchRepository = faceSearchRepository,
): Promise<void> {
  const state = await repository.getBackgroundIndexState();
  if (state.status !== 'running') return;

  if (__DEV__) {
    console.log(
      '[Reconcile] estado órfão detectado; marcando paused sem abortar geração',
    );
  }
  await repository.updateBackgroundIndexState({
    status: 'paused',
    lastError: null,
  });
}