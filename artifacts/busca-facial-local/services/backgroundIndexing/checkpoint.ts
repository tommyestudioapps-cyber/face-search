import AsyncStorage from '@react-native-async-storage/async-storage';
import { faceSearch } from '@/constants/faceSearch';
import { parseCheckpoint } from './checkpointPolicy';

const CURSOR_KEY = 'visage.background-index.cursor.v1';
const INDEX_VERSION = [
  faceSearch.modelVersion,
  faceSearch.pipelineVersion,
  faceSearch.embeddingDimension,
  faceSearch.input.width,
  faceSearch.input.height,
  faceSearch.input.channels,
].join(':');

export async function loadBackgroundIndexCursor(): Promise<
  { cursor: string; generation: number; processedAssets?: number | null } | undefined
> {
  const stored = await AsyncStorage.getItem(CURSOR_KEY);
  const cursor = parseCheckpoint(stored, INDEX_VERSION);
  if (stored && !cursor) {
    await clearBackgroundIndexCursor();
    return undefined;
  }
  if (!cursor || !stored) return cursor;

  // parseCheckpoint validates the cursor and generation but returns only those
  // fields. Preserve the optional progress count from the same stored record.
  const parsed = JSON.parse(stored) as { processedAssets?: unknown };
  if (parsed.processedAssets === null) {
    return { ...cursor, processedAssets: null };
  }
  if (
    typeof parsed.processedAssets === 'number' &&
    Number.isSafeInteger(parsed.processedAssets) &&
    parsed.processedAssets >= 0
  ) {
    return { ...cursor, processedAssets: parsed.processedAssets };
  }
  return cursor;
}

export function saveBackgroundIndexCursor(
  cursor: string,
  generation: number,
  processedAssets?: number,
): Promise<void> {
  return AsyncStorage.setItem(CURSOR_KEY, JSON.stringify({
    version: INDEX_VERSION,
    cursor,
    generation,
    processedAssets: processedAssets ?? null,
  }));
}

export function clearBackgroundIndexCursor(): Promise<void> {
  return AsyncStorage.removeItem(CURSOR_KEY);
}