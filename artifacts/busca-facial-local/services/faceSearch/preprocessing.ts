import { Platform } from 'react-native';
import { File } from 'expo-file-system';
import * as jpeg from 'jpeg-js';
import { faceSearch } from '@/constants/faceSearch';
import type { AlignedFace } from '../faceCapture/types';
import {
  FaceRecognitionError,
  type FaceSearchInputTensor,
} from './types';

interface DecodedImage {
  width: number;
  height: number;
  data: Uint8Array;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

async function readJpegInMemory(uri: string): Promise<DecodedImage> {
  try {
    const bytes = await new File(uri).bytes();
    const decoded = jpeg.decode(bytes, {
      useTArray: true,
      formatAsRGBA: true,
    });

    return {
      width: decoded.width,
      height: decoded.height,
      data: decoded.data,
    };
  } catch (cause) {
    throw new FaceRecognitionError(
      'invalid-input',
      'O recorte alinhado não pôde ser lido como JPEG.',
      cause,
    );
  }
}

function readChannel(
  image: DecodedImage,
  x: number,
  y: number,
  channel: number,
): number {
  const offset = (y * image.width + x) * 4 + channel;
  return image.data[offset] ?? 0;
}

function resizeAndNormalize(
  image: DecodedImage,
): FaceSearchInputTensor {
  const { width: targetWidth, height: targetHeight, channels } = faceSearch.input;
  const tensor = new Float32Array(targetWidth * targetHeight * channels);
  const { mean, stddev } = faceSearch.pixelNormalization;

  for (let targetY = 0; targetY < targetHeight; targetY += 1) {
    const sourceY = ((targetY + 0.5) * image.height) / targetHeight - 0.5;
    const y0 = clamp(Math.floor(sourceY), 0, image.height - 1);
    const y1 = clamp(y0 + 1, 0, image.height - 1);
    const yWeight = clamp(sourceY - Math.floor(sourceY), 0, 1);

    for (let targetX = 0; targetX < targetWidth; targetX += 1) {
      const sourceX = ((targetX + 0.5) * image.width) / targetWidth - 0.5;
      const x0 = clamp(Math.floor(sourceX), 0, image.width - 1);
      const x1 = clamp(x0 + 1, 0, image.width - 1);
      const xWeight = clamp(sourceX - Math.floor(sourceX), 0, 1);
      const tensorOffset = (targetY * targetWidth + targetX) * channels;

      for (let channel = 0; channel < channels; channel += 1) {
        const top =
          readChannel(image, x0, y0, channel) * (1 - xWeight) +
          readChannel(image, x1, y0, channel) * xWeight;
        const bottom =
          readChannel(image, x0, y1, channel) * (1 - xWeight) +
          readChannel(image, x1, y1, channel) * xWeight;
        const pixel = top * (1 - yWeight) + bottom * yWeight;
        tensor[tensorOffset + channel] = (pixel - mean) / stddev;
      }
    }
  }

  return {
    data: tensor,
    buffer: tensor.buffer,
    width: targetWidth,
    height: targetHeight,
    channels,
  };
}

export async function preprocessAlignedFace(
  alignedFace: AlignedFace,
): Promise<FaceSearchInputTensor> {
  if (Platform.OS === 'web') {
    throw new FaceRecognitionError(
      'web-unsupported',
      'O pré-processamento para reconhecimento facial depende do APK.',
    );
  }

  if (!alignedFace.uri || !alignedFace.standardized) {
    throw new FaceRecognitionError(
      'invalid-input',
      'O rosto precisa estar alinhado e padronizado antes do reconhecimento.',
    );
  }

  const image = await readJpegInMemory(alignedFace.uri);
  if (image.width <= 0 || image.height <= 0 || image.data.length === 0) {
    throw new FaceRecognitionError(
      'invalid-input',
      'O recorte alinhado não contém pixels válidos.',
    );
  }

  return resizeAndNormalize(image);
}