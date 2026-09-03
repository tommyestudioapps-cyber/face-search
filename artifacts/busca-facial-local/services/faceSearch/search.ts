import { Platform } from 'react-native';
import { faceSearch } from '@/constants/faceSearch';
import type { AlignedFace } from '../faceCapture/types';
import { preprocessAlignedFace } from './preprocessing';
import {
  releaseRecognitionModel,
  runFaceEmbedding,
} from './model';
import {
  faceSearchRepository,
  getModelStorageVersion,
  type IndexedFaceWithPhoto,
} from './repository';
import {
  FaceRecognitionError,
  type FaceMatchClassification,
  type FaceSearchResult,
  type FaceSearchSummary,
} from './types';

function cosineSimilarity(
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

function classifySimilarity(similarity: number): FaceMatchClassification {
  if (similarity >= faceSearch.similarityThresholds.approved) {
    return 'approved';
  }
  if (similarity >= faceSearch.similarityThresholds.review) {
    return 'review';
  }
  return 'rejected';
}

function createResult(
  candidate: IndexedFaceWithPhoto,
  similarity: number,
): FaceSearchResult {
  return {
    assetId: candidate.photo.assetId,
    uri: candidate.photo.uri,
    filename: candidate.photo.filename,
    creationTime: candidate.photo.creationTime,
    faceId: candidate.face.id,
    faceIndex: candidate.face.faceIndex,
    similarity,
    classification: classifySimilarity(similarity),
    boundingBox: candidate.face.boundingBox,
  };
}

function groupBestResults(
  candidates: IndexedFaceWithPhoto[],
  queryEmbedding: Float32Array,
): FaceSearchResult[] {
  const minimumSimilarity = Math.max(
    faceSearch.similarityThresholds.review,
    faceSearch.similarityThresholds.rejected,
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

    const result = createResult(candidate, similarity);
    const previous = bestByPhoto.get(result.assetId);
    if (!previous || result.similarity > previous.similarity) {
      bestByPhoto.set(result.assetId, result);
    }
  }

  return [...bestByPhoto.values()]
    .sort((left, right) => right.similarity - left.similarity)
    .slice(0, faceSearch.maxResults);
}

export async function searchAlignedFace(
  alignedFace: AlignedFace,
): Promise<FaceSearchSummary> {
  if (Platform.OS === 'web') {
    throw new FaceRecognitionError(
      'web-unsupported',
      'A busca facial está disponível somente no APK.',
    );
  }

  try {
    const inputTensor = await preprocessAlignedFace(alignedFace);
    const queryEmbedding = await runFaceEmbedding(inputTensor);
    await faceSearchRepository.initialize();
    await faceSearchRepository.invalidateIfModelChanged(queryEmbedding.model);

    const modelStorageVersion = getModelStorageVersion(queryEmbedding.model);
    const candidates = await faceSearchRepository.getIndexedEmbeddings(
      modelStorageVersion,
    );
    const results = groupBestResults(candidates, queryEmbedding.values);

    return {
      queryModelVersion: queryEmbedding.model.version,
      totalCandidates: candidates.length,
      matchedFaces: results.length,
      returnedPhotos: results.length,
      results,
    };
  } catch (cause) {
    if (cause instanceof FaceRecognitionError) {
      throw cause;
    }
    throw new FaceRecognitionError(
      'inference-failed',
      'Não foi possível buscar correspondências no índice facial local.',
      cause,
    );
  } finally {
    releaseRecognitionModel();
  }
}

export { cosineSimilarity };