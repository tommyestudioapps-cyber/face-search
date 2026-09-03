import { Platform } from 'react-native';
import {
  loadTensorflowModel,
  type TfliteModel,
} from 'react-native-fast-tflite';
import { faceSearch } from '@/constants/faceSearch';
import {
  FaceRecognitionError,
  type FaceEmbedding,
  type FaceSearchInputTensor,
  type FaceSearchModelMetadata,
} from './types';
import { normalizeL2 } from './searchMath';

declare const require: (moduleName: string) => number;

let loadedModel: TfliteModel | null = null;
let loadingPromise: Promise<TfliteModel> | null = null;

function getModelMetadata(): FaceSearchModelMetadata {
  return {
    name: 'MobileFaceNet',
    version: faceSearch.modelVersion,
    input: faceSearch.input,
    embeddingDimension: faceSearch.embeddingDimension,
    pixelNormalization: faceSearch.pixelNormalization,
  };
}

function isExpectedShape(
  shape: number[],
  expected: number[],
): boolean {
  return (
    shape.length === expected.length &&
    shape.every((value, index) => value === expected[index])
  );
}

function validateModel(model: TfliteModel): TfliteModel {
  const input = model.inputs[0];
  const output = model.outputs[0];
  const expectedInputShape = [
    1,
    faceSearch.input.height,
    faceSearch.input.width,
    faceSearch.input.channels,
  ];
  const expectedOutputShape = [1, faceSearch.embeddingDimension];

  if (
    !input ||
    input.dataType !== 'float32' ||
    !isExpectedShape(input.shape, expectedInputShape)
  ) {
    model.dispose();
    throw new FaceRecognitionError(
      'model-unavailable',
      'O modelo facial tem entrada incompatível com o contrato 112×112 RGB.',
    );
  }

  if (
    !output ||
    output.dataType !== 'float32' ||
    !isExpectedShape(output.shape, expectedOutputShape)
  ) {
    model.dispose();
    throw new FaceRecognitionError(
      'model-unavailable',
      'O modelo facial não produz um embedding float32 de 192 valores.',
    );
  }

  return model;
}

export async function loadRecognitionModel(): Promise<TfliteModel> {
  if (Platform.OS === 'web') {
    throw new FaceRecognitionError(
      'web-unsupported',
      'O reconhecimento facial TFLite está disponível somente no APK.',
    );
  }

  if (loadedModel) {
    return loadedModel;
  }

  if (!loadingPromise) {
    loadingPromise = loadTensorflowModel(
      require('../../assets/models/face-recognition.tflite'),
      [],
    )
      .then(validateModel)
      .then((model) => {
        loadedModel = model;
        return model;
      })
      .catch((cause) => {
        if (cause instanceof FaceRecognitionError) {
          throw cause;
        }
        throw new FaceRecognitionError(
          'model-unavailable',
          'O modelo de reconhecimento não pôde ser carregado do APK.',
          cause,
        );
      })
      .finally(() => {
        loadingPromise = null;
      });
  }

  return loadingPromise;
}

function normalizeEmbedding(values: Float32Array): Float32Array {
  try {
    return normalizeL2(values);
  } catch {
    throw new FaceRecognitionError(
      'invalid-output',
      'O modelo produziu um embedding inválido ou sem norma válida.',
    );
  }
}

export async function runFaceEmbedding(
  input: FaceSearchInputTensor,
): Promise<FaceEmbedding> {
  if (Platform.OS === 'web') {
    throw new FaceRecognitionError(
      'web-unsupported',
      'A inferência facial TFLite está disponível somente no APK.',
    );
  }

  const expectedLength =
    faceSearch.input.width *
    faceSearch.input.height *
    faceSearch.input.channels;
  if (
    input.width !== faceSearch.input.width ||
    input.height !== faceSearch.input.height ||
    input.channels !== faceSearch.input.channels ||
    input.data.length !== expectedLength
  ) {
    throw new FaceRecognitionError(
      'invalid-input',
      'O tensor facial não corresponde à entrada 112×112 RGB.',
    );
  }

  let model: TfliteModel;
  try {
    model = await loadRecognitionModel();
    const outputs = await model.run([input.buffer]);
    const outputBuffer = outputs[0];

    if (!outputBuffer) {
      throw new FaceRecognitionError(
        'invalid-output',
        'O modelo não retornou um vetor facial.',
      );
    }

    const rawEmbedding = new Float32Array(outputBuffer);
    if (rawEmbedding.length !== faceSearch.embeddingDimension) {
      throw new FaceRecognitionError(
        'invalid-output',
        'A dimensão do embedding retornado não corresponde ao modelo.',
      );
    }

    return {
      values: normalizeEmbedding(rawEmbedding),
      model: getModelMetadata(),
      normalized: true,
    };
  } catch (cause) {
    if (cause instanceof FaceRecognitionError) {
      throw cause;
    }
    throw new FaceRecognitionError(
      'inference-failed',
      'Falha ao executar a inferência do embedding facial.',
      cause,
    );
  }
}

export function releaseRecognitionModel(): void {
  if (loadedModel) {
    loadedModel.dispose();
    loadedModel = null;
  }
  loadingPromise = null;
}