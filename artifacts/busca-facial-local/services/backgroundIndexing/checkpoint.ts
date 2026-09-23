import AsyncStorage from '@react-native-async-storage/async-storage';
import { faceSearch } from '@/constants/faceSearch';
import { parseCheckpoint } from './checkpointPolicy';

const CURSOR_KEY = 'visage.background-index.cursor.v1';
const INDEX_VERSION = [
  faceSearch.modelVersion,
  faceSearch.embeddingDimension,
  faceSearch.input.width,
  faceSearch.input.height,
  faceSearch.input.channels,
].join(':');

export async function loadBackgroundIndexCursor(): Promise<string | undefined> {
  const stored = await AsyncStorage.getItem(CURSOR_KEY);
  const cursor = parseCheckpoint(stored, INDEX_VERSION);
  if (stored && !cursor) {
    await clearBackgroundIndexCursor();
  }
  return cursor;
}

export function saveBackgroundIndexCursor(cursor: string): Promise<void> {
  return AsyncStorage.setItem(CURSOR_KEY, JSON.stringify({
    version: INDEX_VERSION,
    cursor,
  }));
}

export function clearBackgroundIndexCursor(): Promise<void> {
  return AsyncStorage.removeItem(CURSOR_KEY);
}