import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  IndexCoordinator,
  type IndexOperationStatus,
} from './indexCoordinatorPolicy';

const STATUS_KEY = 'visage.index-coordinator.status.v1';

export const indexCoordinator = new IndexCoordinator(
  (status) => AsyncStorage.setItem(STATUS_KEY, JSON.stringify(status)),
);

export async function getLastIndexOperationStatus(): Promise<IndexOperationStatus | null> {
  const recent = indexCoordinator.getLastStatus();
  if (recent) return recent;
  const saved = await AsyncStorage.getItem(STATUS_KEY);
  if (!saved) return null;
  const status: unknown = JSON.parse(saved);
  if (
    !status ||
    typeof status !== 'object' ||
    !('operation' in status) ||
    !['background', 'manual-index', 'search', 'clear', 'initializing'].includes(String(status.operation)) ||
    !('state' in status) ||
    !['running', 'finished', 'failed'].includes(String(status.state)) ||
    !('updatedAt' in status) ||
    typeof status.updatedAt !== 'number' ||
    !Number.isFinite(status.updatedAt)
  ) {
    throw new Error('O último estado da indexação está inválido.');
  }
  return status as IndexOperationStatus;
}