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
  type FaceSearchSummary,
} from './types';
import { cosineSimilarity, groupBestResults } from './searchMath';
import { indexCoordinator } from '../backgroundIndexing/indexCoordinator';
import { getRecognitionModelIdentity } from './modelIdentity';

export async function searchAlignedFace(
  alignedFace: AlignedFace,
): Promise<FaceSearchSummary> {
  return indexCoordinator.run('search', () => runSearchAlignedFace(alignedFace));
}

async function runSearchAlignedFace(
  alignedFace: AlignedFace,
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
    const sims = candidates
      .map((c) =>
        cosineSimilarity(queryEmbedding.values, c.face.embedding.values),
      )
      .sort((a, b) => b - a);
    console.warn('[Search:diag] top5 sims=' + sims.slice(0, 5).map(s => s.toFixed(4)).join(','));
    console.warn(
      `[Search:diag] thresholds review=${faceSearch.similarityThresholds.review} approved=${faceSearch.similarityThresholds.approved}`,
    );
    const results = groupBestResults(
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
