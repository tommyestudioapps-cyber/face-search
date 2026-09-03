import type { FaceSearchResult } from './types';

export interface SimilarityThresholds {
  approved: number;
  review: number;
  rejected: number;
}

export interface SearchMathCandidate {
  photo: {
    assetId: string;
    uri: string;
    filename: string | null;
    creationTime: number | null;
  };
  face: {
    id: string;
    faceIndex: number;
    boundingBox: FaceSearchResult['boundingBox'];
    embedding: {
      values: Float32Array;
    };
  };
}

export function normalizeL2(values: Float32Array): Float32Array {
  let squaredNorm = 0;
  for (const value of values) {
    if (!Number.isFinite(value)) {
      throw new Error('Embedding contains a non-finite value.');
    }
    squaredNorm += value * value;
  }

  const norm = Math.sqrt(squaredNorm);
  if (!Number.isFinite(norm) || norm <= Number.EPSILON) {
    throw new Error('Embedding has no valid L2 norm.');
  }

  const normalized = new Float32Array(values.length);
  for (let index = 0; index < values.length; index += 1) {
    normalized[index] = values[index] / norm;
  }
  return normalized;
}

export function cosineSimilarity(
  query: Float32Array,
  candidate: Float32Array,
): number {
  if (query.length !== candidate.length || query.length === 0) {
    return -1;
  }

  let dot = 0;
  let queryNorm = 0;
  let candidateNorm = 0;
  for (let index = 0; index < query.length; index += 1) {
    const queryValue = query[index];
    const candidateValue = candidate[index];
    if (!Number.isFinite(queryValue) || !Number.isFinite(candidateValue)) {
      return -1;
    }
    dot += queryValue * candidateValue;
    queryNorm += queryValue * queryValue;
    candidateNorm += candidateValue * candidateValue;
  }

  const denominator = Math.sqrt(queryNorm) * Math.sqrt(candidateNorm);
  if (!Number.isFinite(denominator) || denominator <= Number.EPSILON) {
    return -1;
  }

  return Math.max(-1, Math.min(1, dot / denominator));
}

export function classifySimilarity(
  similarity: number,
  thresholds: SimilarityThresholds,
): FaceSearchResult['classification'] {
  if (similarity >= thresholds.approved) {
    return 'approved';
  }
  if (similarity >= thresholds.review) {
    return 'review';
  }
  return 'rejected';
}

function createResult(
  candidate: SearchMathCandidate,
  similarity: number,
  thresholds: SimilarityThresholds,
): FaceSearchResult {
  return {
    assetId: candidate.photo.assetId,
    uri: candidate.photo.uri,
    filename: candidate.photo.filename,
    creationTime: candidate.photo.creationTime,
    faceId: candidate.face.id,
    faceIndex: candidate.face.faceIndex,
    similarity,
    classification: classifySimilarity(similarity, thresholds),
    boundingBox: candidate.face.boundingBox,
  };
}

export function groupBestResults(
  candidates: SearchMathCandidate[],
  queryEmbedding: Float32Array,
  thresholds: SimilarityThresholds,
  maxResults: number,
): FaceSearchResult[] {
  const minimumSimilarity = Math.max(
    thresholds.review,
    thresholds.rejected,
  );
  const bestByPhoto = new Map<string, FaceSearchResult>();

  for (const candidate of candidates) {
    const similarity = cosineSimilarity(
      queryEmbedding,
      candidate.face.embedding.values,
    );
    if (similarity < minimumSimilarity) {
      continue;
    }

    const result = createResult(candidate, similarity, thresholds);
    const previous = bestByPhoto.get(result.assetId);
    if (!previous || result.similarity > previous.similarity) {
      bestByPhoto.set(result.assetId, result);
    }
  }

  return [...bestByPhoto.values()]
    .sort((left, right) => right.similarity - left.similarity)
    .slice(0, maxResults);
}