import { Platform } from 'react-native';
import {
  openDatabaseAsync,
  type SQLiteDatabase,
} from 'expo-sqlite';
import { faceSearch } from '@/constants/faceSearch';
import {
  FaceRecognitionError,
  type FaceEmbedding,
  type FaceSearchModelMetadata,
  type IndexedFace,
  type IndexedPhoto,
} from './types';

const DATABASE_NAME = 'face-search.sqlite';
const SCHEMA_VERSION = 1;
const INDEXED_STATUS = 'indexed';

interface Dimensions {
  width: number;
  height: number;
}

interface IndexedFaceRow {
  face_id: string;
  asset_id: string;
  face_index: number;
  bounding_box_json: string;
  embedding_blob: Uint8Array;
  face_model_version: string;
  face_created_at: number;
  photo_uri: string;
  photo_file_name: string | null;
  photo_created_at: number | null;
  photo_updated_at: number | null;
  photo_dimensions: string;
  photo_indexing_status: string;
  photo_model_version: string;
}

interface IndexedPhotoRow {
  id_media_library: string;
  uri_local: string;
  file_name: string | null;
  created_at: number | null;
  updated_at: number | null;
  dimensions: string;
  indexing_status: string;
  model_version: string;
}

interface ModelVersionRow {
  model_version: string;
}

let databasePromise: Promise<SQLiteDatabase> | null = null;

function unsupportedOnWeb(): FaceRecognitionError {
  return new FaceRecognitionError(
    'web-unsupported',
    'O índice facial local está disponível somente no APK.',
  );
}

function storageError(message: string, cause?: unknown): FaceRecognitionError {
  return new FaceRecognitionError('storage-failed', message, cause);
}

function getModelStorageVersion(model: FaceSearchModelMetadata): string {
  const { width, height, channels } = model.input;
  return `${model.version}:${model.embeddingDimension}:${width}x${height}x${channels}`;
}

function serializeDimensions(width: number, height: number): string {
  return JSON.stringify({ width, height });
}

function parseDimensions(value: string): Dimensions {
  try {
    const dimensions = JSON.parse(value) as Partial<Dimensions>;
    if (
      typeof dimensions.width !== 'number' ||
      !Number.isFinite(dimensions.width) ||
      typeof dimensions.height !== 'number' ||
      !Number.isFinite(dimensions.height)
    ) {
      throw new Error('Invalid dimensions');
    }
    return { width: dimensions.width, height: dimensions.height };
  } catch (cause) {
    throw storageError('As dimensões armazenadas da foto são inválidas.', cause);
  }
}

function serializeEmbedding(embedding: FaceEmbedding): Uint8Array {
  if (embedding.values.length !== embedding.model.embeddingDimension) {
    throw storageError('A dimensão do embedding não corresponde ao modelo.');
  }

  const values = new Float32Array(embedding.values.length);
  for (let index = 0; index < embedding.values.length; index += 1) {
    const value = embedding.values[index];
    if (!Number.isFinite(value)) {
      throw storageError('O embedding contém um valor não numérico.');
    }
    values[index] = value;
  }
  return new Uint8Array(values.buffer);
}

function deserializeEmbedding(
  blob: unknown,
  modelVersion: string,
): FaceEmbedding {
  let bytes: Uint8Array;

  if (blob instanceof Uint8Array) {
    bytes = new Uint8Array(blob.byteLength);
    bytes.set(blob);
  } else if (blob instanceof ArrayBuffer) {
    bytes = new Uint8Array(blob.slice(0));
  } else {
    throw storageError('O embedding armazenado não está em formato binário.');
  }

  if (bytes.byteLength === 0 || bytes.byteLength % Float32Array.BYTES_PER_ELEMENT !== 0) {
    throw storageError('O blob do embedding tem tamanho inválido.');
  }

  const values = new Float32Array(bytes.buffer);
  if (values.length !== faceSearch.embeddingDimension) {
    throw storageError('O embedding armazenado tem dimensão incompatível.');
  }

  return {
    values,
    model: {
      name: 'MobileFaceNet',
      version: modelVersion.split(':')[0],
      input: faceSearch.input,
      embeddingDimension: faceSearch.embeddingDimension,
      pixelNormalization: faceSearch.pixelNormalization,
    },
    normalized: true,
  };
}

function parseBoundingBox(value: string): IndexedFace['boundingBox'] {
  try {
    const boundingBox = JSON.parse(value) as IndexedFace['boundingBox'];
    if (
      !boundingBox ||
      typeof boundingBox.x !== 'number' ||
      typeof boundingBox.y !== 'number' ||
      typeof boundingBox.width !== 'number' ||
      typeof boundingBox.height !== 'number' ||
      (boundingBox.coordinateSpace !== 'normalized' &&
        boundingBox.coordinateSpace !== 'pixels')
    ) {
      throw new Error('Invalid bounding box');
    }
    return boundingBox;
  } catch (cause) {
    throw storageError('A caixa do rosto armazenada é inválida.', cause);
  }
}

function mapPhoto(row: IndexedFaceRow): IndexedPhoto {
  const dimensions = parseDimensions(row.photo_dimensions);
  return {
    assetId: row.asset_id,
    uri: row.photo_uri,
    filename: row.photo_file_name,
    creationTime: row.photo_created_at,
    modificationTime: row.photo_updated_at,
    width: dimensions.width,
    height: dimensions.height,
    modelVersion: row.photo_model_version,
    indexedAt: row.face_created_at,
    faceCount: 0,
  };
}

function mapIndexedPhotoRow(row: IndexedPhotoRow): IndexedPhoto {
  const dimensions = parseDimensions(row.dimensions);
  return {
    assetId: row.id_media_library,
    uri: row.uri_local,
    filename: row.file_name,
    creationTime: row.created_at,
    modificationTime: row.updated_at,
    width: dimensions.width,
    height: dimensions.height,
    modelVersion: row.model_version,
    indexedAt: row.updated_at ?? 0,
    faceCount: 0,
  };
}

function mapFace(row: IndexedFaceRow): IndexedFace {
  return {
    id: row.face_id,
    assetId: row.asset_id,
    faceIndex: row.face_index,
    boundingBox: parseBoundingBox(row.bounding_box_json),
    embedding: deserializeEmbedding(row.embedding_blob, row.face_model_version),
    modelVersion: row.face_model_version,
    indexedAt: row.face_created_at,
  };
}

async function migrateSchema(database: SQLiteDatabase): Promise<void> {
  await database.execAsync('PRAGMA foreign_keys = ON;');
  const versionRow = await database.getFirstAsync<{ user_version: number }>(
    'PRAGMA user_version;',
  );
  const currentVersion = Number(versionRow?.user_version ?? 0);

  if (currentVersion > SCHEMA_VERSION) {
    throw storageError(
      `A versão do banco local (${currentVersion}) é mais nova que a suportada.`,
    );
  }

  if (currentVersion === 0) {
    await database.withExclusiveTransactionAsync(async (transaction) => {
      await transaction.execAsync(`
        CREATE TABLE IF NOT EXISTS indexed_photos (
          id_media_library TEXT PRIMARY KEY NOT NULL,
          uri_local TEXT NOT NULL,
          file_name TEXT,
          created_at INTEGER,
          updated_at INTEGER,
          dimensions TEXT NOT NULL,
          indexing_status TEXT NOT NULL,
          model_version TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS face_embeddings (
          id TEXT PRIMARY KEY NOT NULL,
          photo_id TEXT NOT NULL,
          face_index INTEGER NOT NULL,
          bounding_box_json TEXT NOT NULL,
          embedding_blob BLOB NOT NULL,
          model_version TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          FOREIGN KEY (photo_id)
            REFERENCES indexed_photos (id_media_library)
            ON DELETE CASCADE,
          UNIQUE (photo_id, face_index)
        );

        CREATE INDEX IF NOT EXISTS face_embeddings_model_version_idx
          ON face_embeddings (model_version);

        CREATE INDEX IF NOT EXISTS face_embeddings_photo_id_idx
          ON face_embeddings (photo_id);

        PRAGMA user_version = ${SCHEMA_VERSION};
      `);
    });
  }
}

async function getDatabase(): Promise<SQLiteDatabase> {
  if (Platform.OS === 'web') {
    throw unsupportedOnWeb();
  }

  if (!databasePromise) {
    databasePromise = openDatabaseAsync(DATABASE_NAME)
      .then(async (database) => {
        await migrateSchema(database);
        return database;
      })
      .catch((cause) => {
        databasePromise = null;
        if (cause instanceof FaceRecognitionError) {
          throw cause;
        }
        throw storageError('O banco local de reconhecimento não pôde ser inicializado.', cause);
      });
  }

  return databasePromise;
}

export interface IndexedFaceWithPhoto {
  face: IndexedFace;
  photo: IndexedPhoto;
}

export class FaceSearchRepository {
  async initialize(): Promise<void> {
    await getDatabase();
  }

  async saveIndexedPhoto(
    photo: IndexedPhoto,
    faces: IndexedFace[],
  ): Promise<void> {
    const database = await getDatabase();
    const dimensions = serializeDimensions(photo.width, photo.height);

    try {
      await database.withExclusiveTransactionAsync(async (transaction) => {
        await transaction.runAsync(
          `
            INSERT INTO indexed_photos (
              id_media_library,
              uri_local,
              file_name,
              created_at,
              updated_at,
              dimensions,
              indexing_status,
              model_version
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id_media_library) DO UPDATE SET
              uri_local = excluded.uri_local,
              file_name = excluded.file_name,
              created_at = excluded.created_at,
              updated_at = excluded.updated_at,
              dimensions = excluded.dimensions,
              indexing_status = excluded.indexing_status,
              model_version = excluded.model_version
          `,
          [
            photo.assetId,
            photo.uri,
            photo.filename,
            photo.creationTime,
            photo.modificationTime,
            dimensions,
            INDEXED_STATUS,
            photo.modelVersion,
          ],
        );

        await transaction.runAsync(
          'DELETE FROM face_embeddings WHERE photo_id = ?',
          [photo.assetId],
        );

        const embeddingModelVersion = faces.length
          ? getModelStorageVersion(faces[0].embedding.model)
          : null;

        for (const face of faces) {
          if (face.assetId !== photo.assetId) {
            throw storageError('O rosto indexado não pertence à foto informada.');
          }

          const faceModelVersion = getModelStorageVersion(face.embedding.model);
          if (embeddingModelVersion && faceModelVersion !== embeddingModelVersion) {
            throw storageError(
              'Os rostos da foto foram gerados por versões incompatíveis do modelo.',
            );
          }

          const embeddingBlob = serializeEmbedding(face.embedding);
          await transaction.runAsync(
            `
              INSERT INTO face_embeddings (
                id,
                photo_id,
                face_index,
                bounding_box_json,
                embedding_blob,
                model_version,
                created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?)
            `,
            [
              `${photo.assetId}:${face.faceIndex}`,
              photo.assetId,
              face.faceIndex,
              JSON.stringify(face.boundingBox),
              embeddingBlob,
              faceModelVersion,
              face.indexedAt,
            ],
          );
        }
      });
    } catch (cause) {
      if (cause instanceof FaceRecognitionError) {
        throw cause;
      }
      throw storageError('Não foi possível salvar a foto e seus rostos no índice local.', cause);
    }
  }

  async getIndexedEmbeddings(
    modelVersion?: string,
  ): Promise<IndexedFaceWithPhoto[]> {
    const database = await getDatabase();
    const rows = modelVersion
      ? await database.getAllAsync<IndexedFaceRow>(
          `
            SELECT
              fe.id AS face_id,
              fe.photo_id AS asset_id,
              fe.face_index,
              fe.bounding_box_json,
              fe.embedding_blob,
              fe.model_version AS face_model_version,
              fe.created_at AS face_created_at,
              ip.uri_local AS photo_uri,
              ip.file_name AS photo_file_name,
              ip.created_at AS photo_created_at,
              ip.updated_at AS photo_updated_at,
              ip.dimensions AS photo_dimensions,
              ip.indexing_status AS photo_indexing_status,
              ip.model_version AS photo_model_version
            FROM face_embeddings fe
            INNER JOIN indexed_photos ip
              ON ip.id_media_library = fe.photo_id
            WHERE ip.indexing_status = ? AND fe.model_version = ?
            ORDER BY fe.photo_id, fe.face_index
          `,
          [INDEXED_STATUS, modelVersion],
        )
      : await database.getAllAsync<IndexedFaceRow>(
          `
            SELECT
              fe.id AS face_id,
              fe.photo_id AS asset_id,
              fe.face_index,
              fe.bounding_box_json,
              fe.embedding_blob,
              fe.model_version AS face_model_version,
              fe.created_at AS face_created_at,
              ip.uri_local AS photo_uri,
              ip.file_name AS photo_file_name,
              ip.created_at AS photo_created_at,
              ip.updated_at AS photo_updated_at,
              ip.dimensions AS photo_dimensions,
              ip.indexing_status AS photo_indexing_status,
              ip.model_version AS photo_model_version
            FROM face_embeddings fe
            INNER JOIN indexed_photos ip
              ON ip.id_media_library = fe.photo_id
            WHERE ip.indexing_status = ?
            ORDER BY fe.photo_id, fe.face_index
          `,
          [INDEXED_STATUS],
        );

    const photoFaceCounts = new Map<string, number>();
    for (const row of rows) {
      photoFaceCounts.set(
        row.asset_id,
        (photoFaceCounts.get(row.asset_id) ?? 0) + 1,
      );
    }

    return rows.map((row) => ({
      face: mapFace(row),
      photo: {
        ...mapPhoto(row),
        faceCount: photoFaceCounts.get(row.asset_id) ?? 0,
      },
    }));
  }

  async getIndexedPhotos(): Promise<IndexedPhoto[]> {
    const database = await getDatabase();
    const rows = await database.getAllAsync<IndexedPhotoRow>(
      `
        SELECT
          id_media_library,
          uri_local,
          file_name,
          created_at,
          updated_at,
          dimensions,
          indexing_status,
          model_version
        FROM indexed_photos
        WHERE indexing_status = ?
        ORDER BY id_media_library
      `,
      [INDEXED_STATUS],
    );

    return rows.map(mapIndexedPhotoRow);
  }

  async getStoredModelVersion(): Promise<string | null> {
    const database = await getDatabase();
    const rows = await database.getAllAsync<ModelVersionRow>(
      `
        SELECT DISTINCT fe.model_version
        FROM face_embeddings fe
        INNER JOIN indexed_photos ip
          ON ip.id_media_library = fe.photo_id
        WHERE ip.indexing_status = ?
      `,
      [INDEXED_STATUS],
    );

    if (rows.length === 0) {
      return null;
    }
    if (rows.length > 1) {
      throw storageError('O índice local contém versões diferentes do modelo.');
    }
    return rows[0].model_version;
  }

  async invalidateIfModelChanged(
    model: FaceSearchModelMetadata,
  ): Promise<boolean> {
    const storedVersion = await this.getStoredModelVersion();
    const expectedVersion = getModelStorageVersion(model);

    if (!storedVersion || storedVersion === expectedVersion) {
      return false;
    }

    await this.clearIndex();
    return true;
  }

  async removeOrphanedPhotos(assetIds: string[]): Promise<number> {
    const database = await getDatabase();

    try {
      return await this.deleteOutsideAssetSet(database, assetIds);
    } catch (cause) {
      if (cause instanceof FaceRecognitionError) {
        throw cause;
      }
      throw storageError('Não foi possível limpar fotos órfãs do índice local.', cause);
    }
  }

  async clearIndex(): Promise<void> {
    const database = await getDatabase();
    try {
      await database.withExclusiveTransactionAsync(async (transaction) => {
        await transaction.runAsync('DELETE FROM face_embeddings');
        await transaction.runAsync('DELETE FROM indexed_photos');
      });
    } catch (cause) {
      throw storageError('Não foi possível invalidar o índice facial local.', cause);
    }
  }

  async close(): Promise<void> {
    if (!databasePromise) {
      return;
    }

    const database = await databasePromise;
    await database.closeAsync();
    databasePromise = null;
  }

  private async deleteOutsideAssetSet(
    database: SQLiteDatabase,
    assetIds: string[],
  ): Promise<number> {
    let deletedRows = 0;
    await database.withExclusiveTransactionAsync(async (transaction) => {
      if (assetIds.length === 0) {
        const result = await transaction.runAsync('DELETE FROM indexed_photos');
        deletedRows = result.changes;
        return;
      }

      const indexedRows = await transaction.getAllAsync<{ id_media_library: string }>(
        'SELECT id_media_library FROM indexed_photos',
      );
      const currentAssetIds = new Set(assetIds);

      for (const row of indexedRows) {
        if (currentAssetIds.has(row.id_media_library)) {
          continue;
        }
        const result = await transaction.runAsync(
          'DELETE FROM indexed_photos WHERE id_media_library = ?',
          [row.id_media_library],
        );
        deletedRows += result.changes;
      }
    });
    return deletedRows;
  }
}

export const faceSearchRepository = new FaceSearchRepository();
export { getModelStorageVersion };