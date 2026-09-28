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
    const inputTensor = await preprocessAlignedFace(alignedFace);
    let sum = 0;
    let min = Infinity;
    let max = -Infinity;
    for (const v of inputTensor.data) {
      sum += v;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    console.warn(
      `[Search:diag] tensor len=${inputTensor.data.length} mean=${(sum / inputTensor.data.length).toFixed(3)} min=${min.toFixed(2)} max=${max.toFixed(2)}`,
    );
    const queryEmbedding = await runFaceEmbedding(inputTensor);
    let sq = 0;
    for (const v of queryEmbedding.values) sq += v * v;
    console.warn(
      `[Search:diag] query norm=${Math.sqrt(sq).toFixed(3)} first=${queryEmbedding.values[0].toFixed(4)}`,
    );
    await faceSearchRepository.initialize();
    if (__DEV__) {
      const storedVersion = await faceSearchRepository.getStoredModelVersion();
      console.log(`[Search:diag] storedVersion=${storedVersion}`);
      console.log(
        `[Search:diag] queryVersion=${getModelStorageVersion(queryEmbedding.model)}`,
      );
    }
    await faceSearchRepository.invalidateIfModelChanged(queryEmbedding.model);

    const modelStorageVersion = getModelStorageVersion(queryEmbedding.model);
    const candidates = await faceSearchRepository.getIndexedEmbeddings(
      modelStorageVersion,
    );
    console.warn(`[Search:diag] candidates=${candidates.length}`);
    if (__DEV__ && candidates.length > 0) {
      let candidateSq = 0;
      for (const v of candidates[0].face.embedding.values) candidateSq += v * v;
      console.log(
        `[Search:diag] candidate[0] norm=${Math.sqrt(candidateSq).toFixed(3)} first=${candidates[0].face.embedding.values[0].toFixed(4)}`,
      );
    }
    const sims = candidates
      .map((c) =>
        cosineSimilarity(queryEmbedding.values, c.face.embedding.values),
      )
      .sort((a, b) => b - a);
    console.warn(
      `[Search:diag] top5 sims=${sims
        .slice(0, 5)
        .map((s) => s.toFixed(4))
        .join(',')}`,
    );
    console.warn(
      `[Search:diag] thresholds review=${faceSearch.similarityThresholds.review} approved=${faceSearch.similarityThresholds.approved}`,
    );
    const results = groupBestResults(
      candidates,
      queryEmbedding.values,
      faceSearch.similarityThresholds,
      faceSearch.maxResults,
    );
    if (__DEV__) {
      console.log(`[Search:diag] finalResults=${results.length}`);
    }

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
