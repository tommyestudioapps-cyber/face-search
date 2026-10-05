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
} from './repository';
import {
  FaceRecognitionError,
  type FaceSearchResult,
  type FaceSearchSummary,
} from './types';
import {
  cosineSimilarity,
  groupBestResults,
  type SearchProgressEvent,
} from './searchMath';
import { indexCoordinator } from '../backgroundIndexing/indexCoordinator';
import { getRecognitionModelIdentity } from './modelIdentity';

export async function searchAlignedFace(
  alignedFace: AlignedFace,
  onProgress?: (event: SearchProgressEvent) => void,
  phase: number = 1,
  phaseTotal: number = 1,
  progressMatchPhotoIds?: ReadonlySet<string>,
): Promise<FaceSearchSummary> {
  return indexCoordinator.run('search', () =>
    runSearchAlignedFace(
      alignedFace,
      onProgress,
      phase,
      phaseTotal,
      progressMatchPhotoIds,
    ),
  );
}

export async function searchMultiAlignedFaces(
  alignedFaces: AlignedFace[],
  onProgress?: (event: SearchProgressEvent) => void,
): Promise<FaceSearchSummary> {
  if (alignedFaces.length === 0) {
    throw new FaceRecognitionError(
      'invalid-input',
      'Nenhum rosto informado para a busca.',
    );
  }
  if (alignedFaces.length > 2) {
    throw new FaceRecognitionError(
      'invalid-input',
      'A busca suporta no máximo 2 rostos.',
    );
  }
  if (alignedFaces.length === 1) {
    return searchAlignedFace(alignedFaces[0]!, onProgress, 1, 1);
  }

  const phaseTotal = 2;
  const summaryA = await searchAlignedFace(
    alignedFaces[0]!,
    onProgress,
    1,
    phaseTotal,
  );
  const progressMatchPhotoIds = new Set(
    summaryA.results.map((result) => result.assetId),
  );
  const summaryB = await searchAlignedFace(
    alignedFaces[1]!,
    onProgress,
    2,
    phaseTotal,
    progressMatchPhotoIds,
  );
  const resultsA = new Map(
    summaryA.results.map((result) => [result.assetId, result] as const),
  );
  const resultsB = new Map(
    summaryB.results.map((result) => [result.assetId, result] as const),
  );
  const results: FaceSearchResult[] = [];

  for (const [assetId, resultA] of resultsA) {
    const resultB = resultsB.get(assetId);
    if (!resultB) continue;

    const minSimilarity = Math.min(resultA.similarity, resultB.similarity);
    const lowerSimilarityResult =
      resultA.similarity <= resultB.similarity ? resultA : resultB;
    results.push({
      ...lowerSimilarityResult,
      similarity: minSimilarity,
    });
  }

  results.sort((a, b) => b.similarity - a.similarity);

  return {
    queryModelVersion: `${summaryA.queryModelVersion}|${summaryB.queryModelVersion}`,
    totalCandidates: summaryA.totalCandidates + summaryB.totalCandidates,
    matchedFaces: results.length,
    returnedPhotos: results.length,
    results,
  };
}

async function runSearchAlignedFace(
  alignedFace: AlignedFace,
  onProgress?: (event: SearchProgressEvent) => void,
  phase: number = 1,
  phaseTotal: number = 1,
  progressMatchPhotoIds?: ReadonlySet<string>,
): Promise<FaceSearchSummary> {
  if (Platform.OS === 'web') {
    throw new FaceRecognitionError(
      'web-unsupported',
      'A busca facial está disponível somente no APK.',
    );
  }

  try {
    const modelIdentity = await getRecognitionModelIdentity();
    console.warn(
      `[Search:agg] modelSha256=${modelIdentity.sha256} modelVersion=${modelIdentity.modelVersion} pipelineVersion=${modelIdentity.pipelineVersion}`,
    );
    const referenceQuality = alignedFace.referenceQuality;
    console.warn(
      `[Search:agg] reference face=${alignedFace.faceId} bbox=${JSON.stringify(alignedFace.referenceBounds ?? null)} accepted=${referenceQuality?.accepted ?? 'na'} brightness=${referenceQuality?.brightness ?? 'na'} sharpness=${referenceQuality?.sharpness ?? 'na'} yaw=${referenceQuality?.yawDegrees ?? 'na'} pitch=${referenceQuality?.pitchDegrees ?? 'na'} roll=${referenceQuality?.rollDegrees ?? 'na'} issues=${referenceQuality?.issues.join(',') || 'na'}`,
    );
    const inputTensor = await preprocessAlignedFace(alignedFace);
    console.warn('[Search:diag] tensor len=' + inputTensor.data.length);
    const queryEmbedding = await runFaceEmbedding(inputTensor);
    console.warn('[Search:diag] query first=' + queryEmbedding.values[0].toFixed(4));
    await faceSearchRepository.initialize();
    const storedVersion = await faceSearchRepository.getStoredModelVersion();
    console.warn(`[Search:diag] storedVersion=${storedVersion}`);
    console.warn(
      `[Search:diag] queryVersion=${getModelStorageVersion(queryEmbedding.model)}`,
    );
    await faceSearchRepository.invalidateIfModelChanged(queryEmbedding.model);

    const modelStorageVersion = getModelStorageVersion(queryEmbedding.model);
    const candidates = await faceSearchRepository.getIndexedEmbeddings(
      modelStorageVersion,
    );
    const indexedPhotos = await faceSearchRepository.getIndexedPhotos();
    console.warn(`[Search:diag] candidates=${candidates.length}`);
    if (candidates.length > 0) {
      let candidateSq = 0;
      for (const v of candidates[0].face.embedding.values) candidateSq += v * v;
      console.warn(
        `[Search:diag] candidate[0] norm=${Math.sqrt(candidateSq).toFixed(3)} first=${candidates[0].face.embedding.values[0].toFixed(4)}`,
      );
    }
    console.warn(
      `[Search:diag] thresholds review=${faceSearch.similarityThresholds.review} approved=${faceSearch.similarityThresholds.approved} candidates=${candidates.length}`,
    );
    const results = await groupBestResults(
      candidates,
      queryEmbedding.values,
      faceSearch.similarityThresholds,
      faceSearch.maxResults,
      (scores) => {
        const rankedAssetIds = new Set(scores.map((score) => score.assetId));
        for (const score of scores) {
          console.warn(
            `[Search:agg] filename=${JSON.stringify(score.filename ?? '')} assetId=${score.assetId} best=${score.bestSimilarity.toFixed(4)} rank=${score.rank}`,
          );
        }
        for (const photo of indexedPhotos) {
          if (!rankedAssetIds.has(photo.assetId)) {
            console.warn(
              `[Search:agg] filename=${JSON.stringify(photo.filename ?? '')} assetId=${photo.assetId} best=na rank=na`,
            );
          }
        }
      },
      onProgress,
      phase,
      phaseTotal,
      progressMatchPhotoIds,
    );
    console.warn(`[Search:diag] finalResults=${results.length}`);

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
