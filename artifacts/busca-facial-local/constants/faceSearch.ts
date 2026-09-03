export const faceSearch = {
  modelAssetName: 'face-recognition.tflite',
  modelVersion: 'mobilefacenet-192-v1',
  input: {
    width: 112,
    height: 112,
    channels: 3,
  },
  embeddingDimension: 192,
  pixelNormalization: {
    mean: 128,
    stddev: 128,
  },
  indexing: {
    batchSize: 12,
  },
  similarityThresholds: {
    approved: 0.82,
    review: 0.7,
    rejected: 0.7,
  },
  maxResults: 50,
} as const;