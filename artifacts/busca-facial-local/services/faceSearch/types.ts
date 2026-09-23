import type {
  AlignedFace,
  FaceBoundingBox,
} from '../faceCapture/types';

export interface FaceSearchModelMetadata {
  name: string;
  version: string;
  input: {
    width: number;
    height: number;
    channels: number;
  };
  embeddingDimension: number;
  pixelNormalization: {
    mean: number;
    stddev: number;
  };
}

export interface FaceEmbedding {
  values: Float32Array;
  model: FaceSearchModelMetadata;
  normalized: true;
}

export interface FaceSearchInputTensor {
  data: Float32Array;
  buffer: ArrayBuffer;
  width: number;
  height: number;
  channels: number;
}

export interface IndexedPhoto {
  assetId: string;
  uri: string;
  filename: string | null;
  creationTime: number | null;
  modificationTime: number | null;
  width: number;
  height: number;
  modelVersion: string;
  indexedAt: number;
  faceCount: number;
}

export interface StoredIndexStats {
  indexedPhotos: number;
  indexedFaces: number;
}

export interface IndexedFace {
  id: string;
  assetId: string;
  faceIndex: number;
  boundingBox: FaceBoundingBox;
  embedding: FaceEmbedding;
  modelVersion: string;
  indexedAt: number;
}

export type FaceMatchClassification = 'approved' | 'review' | 'rejected';

export interface FaceSearchResult {
  assetId: string;
  uri: string;
  filename: string | null;
  creationTime: number | null;
  faceId: string;
  faceIndex: number;
  similarity: number;
  classification: FaceMatchClassification;
  boundingBox: FaceBoundingBox;
}

export interface FaceSearchSummary {
  queryModelVersion: string;
  totalCandidates: number;
  matchedFaces: number;
  returnedPhotos: number;
  results: FaceSearchResult[];
}

export type FaceIndexStatus =
  | 'idle'
  | 'requesting-permission'
  | 'loading-model'
  | 'indexing'
  | 'cancelling'
  | 'completed'
  | 'cancelled'
  | 'error';

export interface FaceIndexProgress {
  status: FaceIndexStatus;
  processedAssets: number;
  totalAssets: number | null;
  indexedFaces: number;
  skippedAssets: number;
  currentAssetId: string | null;
  error: FaceRecognitionError | null;
}

export type FaceRecognitionErrorCode =
  | 'web-unsupported'
  | 'model-unavailable'
  | 'invalid-input'
  | 'invalid-output'
  | 'inference-failed'
  | 'permission-denied'
  | 'indexing-failed'
  | 'invalid-cursor'
  | 'storage-failed'
  | 'cancelled';

export class FaceRecognitionError extends Error {
  constructor(
    public readonly code: FaceRecognitionErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'FaceRecognitionError';
  }
}

export interface FaceEmbeddingSource {
  alignedFace: AlignedFace;
  model: FaceSearchModelMetadata;
}