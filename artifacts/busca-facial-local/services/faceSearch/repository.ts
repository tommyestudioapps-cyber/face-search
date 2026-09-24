import type { SQLiteDatabase } from 'expo-sqlite';
import { faceSearch } from '../../constants/faceSearch';
import {
  FaceRecognitionError,
  type FaceEmbedding,
  type FaceSearchModelMetadata,
  type IndexedFace,
  type IndexedPhoto,
  type StoredIndexStats,
} from './types';
import type {
  BackgroundIndexState,
  BackgroundIndexStatePatch,
  BackgroundIndexScope,
  BackgroundIndexStatus,
} from '../backgroundIndexing/status';

const DATABASE_NAME = 'face-search.sqlite';
const SCHEMA_VERSION = 4;
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

interface BackgroundIndexStateRow {
  status: string;
  scope: string;
  processed_assets: number;
  total_assets: number | null;
  last_asset_id: string | null;
  last_started_at: number | null;
  last_completed_at: number | null;
  last_error: string | null;
}

const DEFAULT_BACKGROUND_INDEX_STATE: BackgroundIndexState = {
  status: 'idle',
  scope: 'gallery',
  processedAssets: 0,
  totalAssets: null,
  lastAssetId: null,
  lastStartedAt: null,
  lastCompletedAt: null,
  lastError: null,
};

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
          model_version TEXT NOT NULL,
          last_seen_generation INTEGER
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

      `);
      await transaction.execAsync(`
        CREATE TABLE IF NOT EXISTS gallery_scan (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          generation INTEGER NOT NULL,
          active INTEGER NOT NULL,
          lease_owner TEXT,
          lease_until INTEGER
        );
        INSERT OR IGNORE INTO gallery_scan (id, generation, active) VALUES (1, 0, 0);
        CREATE TABLE IF NOT EXISTS background_index_state (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          status TEXT NOT NULL,
          scope TEXT NOT NULL,
          processed_assets INTEGER NOT NULL DEFAULT 0,
          total_assets INTEGER,
          last_asset_id TEXT,
          last_started_at INTEGER,
          last_completed_at INTEGER,
          last_error TEXT
        );
        INSERT OR IGNORE INTO background_index_state (
          id, status, scope, processed_assets
        ) VALUES (1, 'idle', 'gallery', 0);
        PRAGMA user_version = ${SCHEMA_VERSION};
      `);
    });
  } else if (currentVersion === 1) {
    await database.withExclusiveTransactionAsync(async (transaction) => {
      await transaction.execAsync(`
        ALTER TABLE indexed_photos ADD COLUMN last_seen_generation INTEGER;
        CREATE TABLE gallery_scan (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          generation INTEGER NOT NULL,
          active INTEGER NOT NULL,
          lease_owner TEXT,
          lease_until INTEGER
        );
        INSERT INTO gallery_scan (id, generation, active) VALUES (1, 0, 0);
        CREATE TABLE background_index_state (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          status TEXT NOT NULL,
          scope TEXT NOT NULL,
          processed_assets INTEGER NOT NULL DEFAULT 0,
          total_assets INTEGER,
          last_asset_id TEXT,
          last_started_at INTEGER,
          last_completed_at INTEGER,
          last_error TEXT
        );
        INSERT INTO background_index_state (
          id, status, scope, processed_assets
        ) VALUES (1, 'idle', 'gallery', 0);
        PRAGMA user_version = ${SCHEMA_VERSION};
      `);
    });
  } else if (currentVersion === 2) {
    await database.withExclusiveTransactionAsync(async (transaction) => {
      await transaction.execAsync(`
        ALTER TABLE gallery_scan ADD COLUMN lease_owner TEXT;
        ALTER TABLE gallery_scan ADD COLUMN lease_until INTEGER;
        CREATE TABLE background_index_state (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          status TEXT NOT NULL,
          scope TEXT NOT NULL,
          processed_assets INTEGER NOT NULL DEFAULT 0,
          total_assets INTEGER,
          last_asset_id TEXT,
          last_started_at INTEGER,
          last_completed_at INTEGER,
          last_error TEXT
        );
        INSERT INTO background_index_state (
          id, status, scope, processed_assets
        ) VALUES (1, 'idle', 'gallery', 0);
        PRAGMA user_version = ${SCHEMA_VERSION};
      `);
    });
  } else if (currentVersion === 3) {
    await database.withExclusiveTransactionAsync(async (transaction) => {
      await transaction.execAsync(`
        CREATE TABLE background_index_state (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          status TEXT NOT NULL,
          scope TEXT NOT NULL,
          processed_assets INTEGER NOT NULL DEFAULT 0,
          total_assets INTEGER,
          last_asset_id TEXT,
          last_started_at INTEGER,
          last_completed_at INTEGER,
          last_error TEXT
        );
        INSERT INTO background_index_state (
          id, status, scope, processed_assets
        ) VALUES (1, 'idle', 'gallery', 0);
        PRAGMA user_version = ${SCHEMA_VERSION};
      `);
    });
  }
}

export interface IndexedFaceWithPhoto {
  face: IndexedFace;
  photo: IndexedPhoto;
}

type DatabaseOpener = (databaseName: string) => Promise<SQLiteDatabase>;

export interface FaceSearchRepositoryOptions {
  openDatabase?: DatabaseOpener;
  platformOS?: string;
}

export class FaceSearchRepository {
  private databasePromise: Promise<SQLiteDatabase> | null = null;

  constructor(
    private readonly options: FaceSearchRepositoryOptions = {},
  ) {}

  private async getPlatformOS(): Promise<string> {
    if (this.options.platformOS) {
      return this.options.platformOS;
    }

    const { Platform } = await import('react-native');
    return Platform.OS;
  }

  private async openDatabase(databaseName: string): Promise<SQLiteDatabase> {
    if (this.options.openDatabase) {
      return this.options.openDatabase(databaseName);
    }

    const { openDatabaseAsync } = await import('expo-sqlite');
    return openDatabaseAsync(databaseName);
  }

  private async getDatabase(): Promise<SQLiteDatabase> {
    if ((await this.getPlatformOS()) === 'web') {
      throw unsupportedOnWeb();
    }

    if (!this.databasePromise) {
      this.databasePromise = this.openDatabase(DATABASE_NAME)
        .then(async (database) => {
          await migrateSchema(database);
          return database;
        })
        .catch((cause) => {
          this.databasePromise = null;
          if (cause instanceof FaceRecognitionError) {
            throw cause;
          }
          throw storageError('O banco local de reconhecimento não pôde ser inicializado.', cause);
        });
    }

    return this.databasePromise;
  }

  async initialize(): Promise<void> {
    await this.getDatabase();
  }

  async getActiveScanGeneration(): Promise<number | null> {
    const database = await this.getDatabase();
    const row = await database.getFirstAsync<{ generation: number }>(
      'SELECT generation FROM gallery_scan WHERE id = 1 AND active = 1',
    );
    return row?.generation ?? null;
  }

  async getBackgroundIndexState(): Promise<BackgroundIndexState> {
    const database = await this.getDatabase();
    const row = await database.getFirstAsync<BackgroundIndexStateRow>(
      `SELECT
         status,
         scope,
         processed_assets,
         total_assets,
         last_asset_id,
         last_started_at,
         last_completed_at,
         last_error
       FROM background_index_state
       WHERE id = 1`,
    );
    if (!row) return { ...DEFAULT_BACKGROUND_INDEX_STATE };
    if (
      !['idle', 'running', 'paused', 'waiting', 'completed', 'cancelled', 'error'].includes(row.status) ||
      !['gallery', 'album'].includes(row.scope) ||
      !Number.isSafeInteger(Number(row.processed_assets)) ||
      Number(row.processed_assets) < 0
    ) {
      throw storageError('O estado persistido da indexação está inválido.');
    }
    return {
      status: row.status as BackgroundIndexStatus,
      scope: row.scope as BackgroundIndexScope,
      processedAssets: Number(row.processed_assets),
      totalAssets: row.total_assets === null ? null : Number(row.total_assets),
      lastAssetId: row.last_asset_id,
      lastStartedAt: row.last_started_at,
      lastCompletedAt: row.last_completed_at,
      lastError: row.last_error,
    };
  }

  async updateBackgroundIndexState(
    patch: BackgroundIndexStatePatch,
  ): Promise<BackgroundIndexState> {
    const database = await this.getDatabase();
    try {
      let nextState: BackgroundIndexState = DEFAULT_BACKGROUND_INDEX_STATE;
      await database.withExclusiveTransactionAsync(async (transaction) => {
        const row = await transaction.getFirstAsync<BackgroundIndexStateRow>(
          `SELECT
             status,
             scope,
             processed_assets,
             total_assets,
             last_asset_id,
             last_started_at,
             last_completed_at,
             last_error
           FROM background_index_state
           WHERE id = 1`,
        );
        const current = row
          ? {
              status: row.status as BackgroundIndexStatus,
              scope: row.scope as BackgroundIndexScope,
              processedAssets: Number(row.processed_assets),
              totalAssets: row.total_assets === null ? null : Number(row.total_assets),
              lastAssetId: row.last_asset_id,
              lastStartedAt: row.last_started_at,
              lastCompletedAt: row.last_completed_at,
              lastError: row.last_error,
            }
          : DEFAULT_BACKGROUND_INDEX_STATE;
        nextState = { ...current, ...patch };
        await transaction.runAsync(
          `INSERT INTO background_index_state (
             id,
             status,
             scope,
             processed_assets,
             total_assets,
             last_asset_id,
             last_started_at,
             last_completed_at,
             last_error
           ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             status = excluded.status,
             scope = excluded.scope,
             processed_assets = excluded.processed_assets,
             total_assets = excluded.total_assets,
             last_asset_id = excluded.last_asset_id,
             last_started_at = excluded.last_started_at,
             last_completed_at = excluded.last_completed_at,
             last_error = excluded.last_error`,
          [
            nextState.status,
            nextState.scope,
            nextState.processedAssets,
            nextState.totalAssets,
            nextState.lastAssetId,
            nextState.lastStartedAt,
            nextState.lastCompletedAt,
            nextState.lastError,
          ],
        );
      });
      return nextState;
    } catch (cause) {
      if (cause instanceof FaceRecognitionError) throw cause;
      throw storageError('Não foi possível salvar o estado da indexação.', cause);
    }
  }

  async beginScan(owner?: string): Promise<number> {
    const database = await this.getDatabase();
    try {
      let generation = 0;
      await database.withExclusiveTransactionAsync(async (transaction) => {
        const active = await transaction.getFirstAsync<{
          generation: number;
          lease_owner: string | null;
          lease_until: number | null;
        }>(
          'SELECT generation, lease_owner, lease_until FROM gallery_scan WHERE id = 1 AND active = 1',
        );
        if (active) {
          const leaseValid = active.lease_until !== null && active.lease_until >= Date.now();
          if (leaseValid) {
            throw new FaceRecognitionError(
              'indexing-failed',
              'Já existe uma varredura da galeria em andamento.',
            );
          }
          await transaction.runAsync(
            'UPDATE gallery_scan SET active = 0, lease_owner = NULL, lease_until = NULL WHERE id = 1 AND active = 1 AND generation = ?',
            [active.generation],
          );
        }
        await transaction.runAsync(
          'UPDATE gallery_scan SET generation = generation + 1, active = 1, lease_owner = ?, lease_until = ? WHERE id = 1',
          [owner ?? null, owner ? Date.now() + 120_000 : null],
        );
        const row = await transaction.getFirstAsync<{ generation: number }>(
          'SELECT generation FROM gallery_scan WHERE id = 1',
        );
        if (!row) throw storageError('O estado da varredura não está disponível.');
        generation = row.generation;
      });
      return generation;
    } catch (cause) {
      if (cause instanceof FaceRecognitionError) {
        throw cause;
      }
      throw storageError('Não foi possível iniciar a varredura da galeria.', cause);
    }
  }

  async claimScan(generation: number, owner: string): Promise<boolean> {
    const database = await this.getDatabase();
    let claimed = false;
    await database.withExclusiveTransactionAsync(async (transaction) => {
      const result = await transaction.runAsync(
        `UPDATE gallery_scan SET lease_owner = ?, lease_until = ?
         WHERE id = 1 AND active = 1 AND generation = ?
           AND (lease_owner IS NULL OR lease_until < ?)`,
        [owner, Date.now() + 120_000, generation, Date.now()],
      );
      claimed = result.changes === 1;
    });
    return claimed;
  }

  async renewScan(generation: number, owner: string): Promise<boolean> {
    const database = await this.getDatabase();
    let renewed = false;
    await database.withExclusiveTransactionAsync(async (transaction) => {
      const now = Date.now();
      const result = await transaction.runAsync(
        `UPDATE gallery_scan SET lease_until = ?
         WHERE id = 1 AND active = 1 AND generation = ?
           AND lease_owner = ? AND lease_until >= ?`,
        [now + 120_000, generation, owner, now],
      );
      renewed = result.changes === 1;
    });
    return renewed;
  }

  async releaseScan(generation: number, owner: string): Promise<void> {
    const database = await this.getDatabase();
    await database.withExclusiveTransactionAsync(async (transaction) => {
      await transaction.runAsync(
        'UPDATE gallery_scan SET lease_owner = NULL, lease_until = NULL WHERE id = 1 AND generation = ? AND lease_owner = ?',
        [generation, owner],
      );
    });
  }

  async abortScanIfUnleased(generation: number): Promise<boolean> {
    const database = await this.getDatabase();
    let aborted = false;
    await database.withExclusiveTransactionAsync(async (transaction) => {
      const result = await transaction.runAsync(
        `UPDATE gallery_scan SET active = 0, lease_owner = NULL, lease_until = NULL
         WHERE id = 1 AND active = 1 AND generation = ?
           AND (lease_owner IS NULL OR lease_until < ?)`,
        [generation, Date.now()],
      );
      aborted = result.changes === 1;
    });
    return aborted;
  }

  async abortScan(generation: number, owner?: string): Promise<void> {
    const database = await this.getDatabase();
    try {
      await database.withExclusiveTransactionAsync(async (transaction) => {
        await transaction.runAsync(
          `UPDATE gallery_scan SET active = 0, lease_owner = NULL, lease_until = NULL
           WHERE id = 1 AND active = 1 AND generation = ?
             AND ${owner ? 'lease_owner = ?' : '(lease_owner IS NULL OR lease_until < ?)'}`,
          [generation, owner ?? Date.now()],
        );
      });
    } catch (cause) {
      throw storageError('Não foi possível interromper a varredura da galeria.', cause);
    }
  }

  async markAssetSeen(assetId: string, generation: number, owner?: string): Promise<void> {
    const database = await this.getDatabase();
    await database.withExclusiveTransactionAsync(async (transaction) => {
      const active = await transaction.getFirstAsync<{ generation: number; lease_owner: string | null; lease_until: number | null }>(
        'SELECT generation, lease_owner, lease_until FROM gallery_scan WHERE id = 1 AND active = 1',
      );
      if (active?.generation !== generation ||
        active.lease_owner !== (owner ?? null) ||
        (owner && (active.lease_until ?? 0) < Date.now())) {
        throw storageError('A geração da varredura foi interrompida.');
      }
      await transaction.runAsync(
        'UPDATE indexed_photos SET last_seen_generation = ? WHERE id_media_library = ?',
        [generation, assetId],
      );
      if (owner) {
        await transaction.runAsync('UPDATE gallery_scan SET lease_until = ? WHERE id = 1', [Date.now() + 120_000]);
      }
    });
  }

  async completeScan(generation: number, owner?: string): Promise<number> {
    const database = await this.getDatabase();
    try {
      let deletedRows = 0;
      await database.withExclusiveTransactionAsync(async (transaction) => {
        const active = await transaction.getFirstAsync<{ generation: number; lease_owner: string | null; lease_until: number | null }>(
          'SELECT generation, lease_owner, lease_until FROM gallery_scan WHERE id = 1 AND active = 1',
        );
        if (active?.generation !== generation ||
          active.lease_owner !== (owner ?? null) ||
          (owner && (active.lease_until ?? 0) < Date.now())) {
          throw storageError('A geração da varredura foi interrompida.');
        }
        const result = await transaction.runAsync(
          'DELETE FROM indexed_photos WHERE last_seen_generation IS NULL OR last_seen_generation != ?',
          [generation],
        );
        await transaction.runAsync('UPDATE gallery_scan SET active = 0, lease_owner = NULL, lease_until = NULL WHERE id = 1');
        deletedRows = result.changes;
      });
      return deletedRows;
    } catch (cause) {
      if (cause instanceof FaceRecognitionError) throw cause;
      throw storageError('Não foi possível concluir a limpeza do índice local.', cause);
    }
  }

  async saveIndexedPhoto(
    photo: IndexedPhoto,
    faces: IndexedFace[],
    generation?: number,
    owner?: string,
  ): Promise<void> {
    const database = await this.getDatabase();
    const dimensions = serializeDimensions(photo.width, photo.height);

    try {
      await database.withExclusiveTransactionAsync(async (transaction) => {
        if (generation !== undefined) {
          const active = await transaction.getFirstAsync<{ generation: number; lease_owner: string | null; lease_until: number | null }>(
            'SELECT generation, lease_owner, lease_until FROM gallery_scan WHERE id = 1 AND active = 1',
          );
          if (active?.generation !== generation ||
            active.lease_owner !== (owner ?? null) ||
            (owner && (active.lease_until ?? 0) < Date.now())) {
            throw storageError('A geração da varredura foi interrompida.');
          }
        }
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
              model_version,
              last_seen_generation
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id_media_library) DO UPDATE SET
              uri_local = excluded.uri_local,
              file_name = excluded.file_name,
              created_at = excluded.created_at,
              updated_at = excluded.updated_at,
              dimensions = excluded.dimensions,
              indexing_status = excluded.indexing_status,
              model_version = excluded.model_version,
              last_seen_generation = COALESCE(excluded.last_seen_generation, indexed_photos.last_seen_generation)
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
            generation ?? null,
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
        if (owner) {
          await transaction.runAsync('UPDATE gallery_scan SET lease_until = ? WHERE id = 1', [Date.now() + 120_000]);
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
    const database = await this.getDatabase();
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
    const database = await this.getDatabase();
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

  async getIndexedPhotosWithFaceCounts(): Promise<IndexedPhoto[]> {
    const photos = await this.getIndexedPhotos();
    if (photos.length === 0) {
      return photos;
    }
    const database = await this.getDatabase();
    const rows = await database.getAllAsync<{ photo_id: string; count: number }>(
      `
        SELECT photo_id, COUNT(*) AS count
        FROM face_embeddings
        GROUP BY photo_id
      `,
    );
    const counts = new Map(rows.map((row) => [row.photo_id, Number(row.count)]));
    return photos.map((photo) => ({
      ...photo,
      faceCount: counts.get(photo.assetId) ?? 0,
    }));
  }

  async getStoredIndexStats(): Promise<StoredIndexStats> {
    const database = await this.getDatabase();
    const photoCount = await database.getFirstAsync<{ count: number }>(
      `
        SELECT COUNT(*) AS count
        FROM indexed_photos
        WHERE indexing_status = ?
      `,
      [INDEXED_STATUS],
    );
    const faceCount = await database.getFirstAsync<{ count: number }>(
      `
        SELECT COUNT(*) AS count
        FROM face_embeddings fe
        INNER JOIN indexed_photos ip
          ON ip.id_media_library = fe.photo_id
        WHERE ip.indexing_status = ?
      `,
      [INDEXED_STATUS],
    );

    return {
      indexedPhotos: Number(photoCount?.count ?? 0),
      indexedFaces: Number(faceCount?.count ?? 0),
    };
  }

  async getStoredModelVersion(): Promise<string | null> {
    const database = await this.getDatabase();
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

  async clearIndex(): Promise<void> {
    const database = await this.getDatabase();
    try {
      await database.withExclusiveTransactionAsync(async (transaction) => {
        await transaction.runAsync('DELETE FROM face_embeddings');
        await transaction.runAsync('DELETE FROM indexed_photos');
        await transaction.runAsync('UPDATE gallery_scan SET active = 0 WHERE id = 1');
      });
    } catch (cause) {
      throw storageError('Não foi possível invalidar o índice facial local.', cause);
    }
  }

  async close(): Promise<void> {
    if (!this.databasePromise) {
      return;
    }

    const database = await this.databasePromise;
    await database.closeAsync();
    this.databasePromise = null;
  }

}

export const faceSearchRepository = new FaceSearchRepository();
export { getModelStorageVersion };