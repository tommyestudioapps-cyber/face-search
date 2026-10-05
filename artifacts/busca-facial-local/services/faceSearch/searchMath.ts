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

export interface PhotoSimilarityScore {
  assetId: string;
  filename: string | null;
  bestSimilarity: number;
  rank: number;
}

export interface SearchProgressEvent {
  candidatesProcessed: number;
  candidatesTotal: number;
  distinctPhotosProcessed: number;
  distinctPhotosTotal: number;
  matchesSoFar: number;
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

export async function groupBestResults(
  candidates: SearchMathCandidate[],
  queryEmbedding: Float32Array,
  thresholds: SimilarityThresholds,
  maxResults: number,
  onDiagnostic: ((scores: PhotoSimilarityScore[]) => void) | undefined,
  onProgress?: (event: SearchProgressEvent) => void,
): Promise<FaceSearchResult[]> {
  const minimumSimilarity = Math.max(
    thresholds.review,
    thresholds.rejected,
  );
  const bestByPhoto = new Map<string, FaceSearchResult>();
  const bestSimilarityByPhoto = new Map<
    string,
    { assetId: string; filename: string | null; bestSimilarity: number }
  >();
  const allScores: number[] = [];
  const distinctPhotosTotal = new Set(
    candidates.map((candidate) => candidate.photo.assetId),
  ).size;
  const seenAssetIds = new Set<string>();
  let processed = 0;
  let matchesSoFar = 0;

  for (const candidate of candidates) {
    const similarity = cosineSimilarity(
      queryEmbedding,
      candidate.face.embedding.values,
    );
    allScores.push(similarity);
    seenAssetIds.add(candidate.photo.assetId);
    processed += 1;
    const previousScore = bestSimilarityByPhoto.get(candidate.photo.assetId);
    if (!previousScore || similarity > previousScore.bestSimilarity) {
      bestSimilarityByPhoto.set(candidate.photo.assetId, {
        assetId: candidate.photo.assetId,
        filename: candidate.photo.filename,
        bestSimilarity: similarity,
      });
    }

    if (similarity >= minimumSimilarity) {
      const result = createResult(candidate, similarity, thresholds);
      const previous = bestByPhoto.get(result.assetId);
      if (!previous) {
        matchesSoFar += 1;
      }
      if (!previous || result.similarity > previous.similarity) {
        bestByPhoto.set(result.assetId, result);
      }
    }

    if (processed % 100 === 0) {
      onProgress?.({
        candidatesProcessed: processed,
        candidatesTotal: candidates.length,
        distinctPhotosProcessed: seenAssetIds.size,
        distinctPhotosTotal,
        matchesSoFar,
      });
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }

  onProgress?.({
    candidatesProcessed: processed,
    candidatesTotal: candidates.length,
    distinctPhotosProcessed: seenAssetIds.size,
    distinctPhotosTotal,
    matchesSoFar,
  });

  const sortedAll = [...allScores].sort((a, b) => b - a);
  console.warn(`[Search:raw] total_raw=${sortedAll.length} top20_raw=${sortedAll.slice(0, 20).map(s => s.toFixed(3)).join(',')}`);
  const rankedPhotoScores = [...bestSimilarityByPhoto.values()]
    .sort((left, right) => right.bestSimilarity - left.bestSimilarity)
    .map((score, index) => ({ ...score, rank: index + 1 }));
  onDiagnostic?.(rankedPhotoScores);

  const allSorted = [...bestByPhoto.values()].sort((left, right) => right.similarity - left.similarity);
  console.warn(`[Search:top] total=${allSorted.length} top20=${allSorted.slice(0, 20).map(r => r.similarity.toFixed(3)).join(',')}`);
  console.warn(`[Search:top] above070=${allSorted.filter(r => r.similarity >= 0.7).length} above060=${allSorted.filter(r => r.similarity >= 0.6).length} above050=${allSorted.filter(r => r.similarity >= 0.5).length} above040=${allSorted.filter(r => r.similarity >= 0.4).length} above030=${allSorted.filter(r => r.similarity >= 0.3).length}`);

  return allSorted.slice(0, maxResults);
}