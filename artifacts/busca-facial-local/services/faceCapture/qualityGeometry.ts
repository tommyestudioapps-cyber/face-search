import type { FaceBounds } from './types';

export const OUT_OF_FRAME_MARGIN_RATIO = 0.02;
export const ELONGATED_FACE_SIZE_RATIO = 1.4;

export interface FaceSizeThresholds {
  minFaceWidthRatio: number;
  minFaceHeightRatio: number;
  minFaceAreaRatio: number;
}

export interface FaceSizeRatios {
  width: number;
  height: number;
  area: number;
}

export function isFaceInsideNormalizedImage(
  bounds: FaceBounds,
  margin = OUT_OF_FRAME_MARGIN_RATIO,
): boolean {
  return (
    bounds.minX >= -margin &&
    bounds.minY >= -margin &&
    bounds.maxX <= 1 + margin &&
    bounds.maxY <= 1 + margin
  );
}

export function getFaceSizeRatios(
  bounds: FaceBounds,
  imageWidth: number,
  imageHeight: number,
): FaceSizeRatios {
  const aspectRatio = imageWidth / imageHeight;
  const elongated =
    aspectRatio > ELONGATED_FACE_SIZE_RATIO ||
    aspectRatio < 1 / ELONGATED_FACE_SIZE_RATIO;

  if (!elongated) {
    return {
      width: bounds.width,
      height: bounds.height,
      area: bounds.width * bounds.height,
    };
  }

  const shortSide = Math.min(imageWidth, imageHeight);
  const faceWidthPx = bounds.width * imageWidth;
  const faceHeightPx = bounds.height * imageHeight;
  return {
    width: faceWidthPx / shortSide,
    height: faceHeightPx / shortSide,
    area: (faceWidthPx * faceHeightPx) / (shortSide * shortSide),
  };
}

export function isFaceLargeEnough(
  bounds: FaceBounds,
  imageWidth: number,
  imageHeight: number,
  thresholds: FaceSizeThresholds,
): boolean {
  const ratios = getFaceSizeRatios(bounds, imageWidth, imageHeight);
  return (
    ratios.width >= thresholds.minFaceWidthRatio &&
    ratios.height >= thresholds.minFaceHeightRatio &&
    ratios.area >= thresholds.minFaceAreaRatio
  );
}