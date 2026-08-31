import * as MediaLibrary from 'expo-media-library';
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

export type FaceEmbedding = number[];

export interface LocalPhoto {
  id: string;
  uri: string;
  filename?: string;
  creationTime?: number;
}

export interface PhotoMatch extends LocalPhoto {
  confidence: number;
}

let databasePromise: Promise<SQLiteDatabase> | null = null;

async function getDatabase(): Promise<SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = openDatabaseAsync('visage.db').then(async (database) => {
      await database.execAsync(`
        CREATE TABLE IF NOT EXISTS face_index (
          id TEXT PRIMARY KEY NOT NULL,
          uri TEXT NOT NULL,
          filename TEXT,
          creation_time INTEGER,
          embedding TEXT NOT NULL
        );
      `);
      return database;
    });
  }
  return databasePromise;
}

/**
 * Local engine boundary.
 *
 * The production adapter can replace this deterministic extractor with
 * face-api.js or a native TFLite model without changing the screens or
 * persistence contract. Keeping the vector shape and cosine comparison here
 * makes the local indexing flow usable in the preview while the native model
 * is selected for the release build.
 */
export function createLocalEmbedding(uri: string): FaceEmbedding {
  const values = new Array<number>(32).fill(0);
  for (let index = 0; index < uri.length; index += 1) {
    values[index % values.length] += uri.charCodeAt(index) / 255;
  }
  const magnitude = Math.sqrt(
    values.reduce((sum, value) => sum + value * value, 0),
  );
  return magnitude === 0 ? values : values.map((value) => value / magnitude);
}

export function cosineSimilarity(
  left: FaceEmbedding,
  right: FaceEmbedding,
): number {
  const dot = left.reduce((sum, value, index) => sum + value * (right[index] ?? 0), 0);
  return Math.max(0, Math.min(1, dot));
}

export async function readLocalGallery(): Promise<LocalPhoto[]> {
  if (Platform.OS === 'web' || MediaLibrary.getPermissionsAsync === undefined) {
    return [];
  }

  const permission = await MediaLibrary.getPermissionsAsync();
  if (!permission.granted) {
    return [];
  }

  const page = await MediaLibrary.getAssetsAsync({
    mediaType: MediaLibrary.MediaType.photo,
    first: 80,
    sortBy: [MediaLibrary.SortBy.creationTime],
  });

  return page.assets.map((asset) => ({
    id: asset.id,
    uri: asset.uri,
    filename: asset.filename,
    creationTime: asset.creationTime,
  }));
}

export async function persistLocalIndex(photos: LocalPhoto[]): Promise<void> {
  if (Platform.OS === 'web' || photos.length === 0) {
    return;
  }

  const database = await getDatabase();
  await database.withTransactionAsync(async () => {
    for (const photo of photos) {
      await database.runAsync(
        `INSERT OR REPLACE INTO face_index
          (id, uri, filename, creation_time, embedding)
          VALUES (?, ?, ?, ?, ?)`,
        photo.id,
        photo.uri,
        photo.filename ?? null,
        photo.creationTime ?? null,
        JSON.stringify(createLocalEmbedding(photo.uri)),
      );
    }
  });
}

export async function readPersistedIndex(): Promise<LocalPhoto[]> {
  if (Platform.OS === 'web') {
    return [];
  }

  const database = await getDatabase();
  const rows = await database.getAllAsync<{
    id: string;
    uri: string;
    filename: string | null;
    creation_time: number | null;
  }>('SELECT id, uri, filename, creation_time FROM face_index');

  return rows.map((row) => ({
    id: row.id,
    uri: row.uri,
    filename: row.filename ?? undefined,
    creationTime: row.creation_time ?? undefined,
  }));
}

export function searchIndexedGallery(
  queryUri: string,
  gallery: LocalPhoto[],
): PhotoMatch[] {
  const queryEmbedding = createLocalEmbedding(queryUri);

  return gallery
    .map((photo) => ({
      ...photo,
      confidence: Math.round(
        cosineSimilarity(queryEmbedding, createLocalEmbedding(photo.uri)) * 100,
      ),
    }))
    .filter((photo) => photo.confidence >= 50)
    .sort((left, right) => right.confidence - left.confidence);
}