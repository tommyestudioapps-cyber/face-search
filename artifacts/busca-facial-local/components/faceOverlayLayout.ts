import type { FaceBounds } from '@/services/faceCapture';

export interface FaceOverlayLayout {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Maps normalized source-image bounds onto a square Image using resizeMode
 * "cover". The extra image area is cropped by the stage, so its offset can be
 * negative on the longer axis.
 */
export function getFaceOverlayLayout(
  bounds: FaceBounds,
  imageWidth: number,
  imageHeight: number,
): FaceOverlayLayout {
  const sourceAspectRatio = imageWidth / imageHeight;
  const displayedWidth = Math.max(100, sourceAspectRatio * 100);
  const displayedHeight = Math.max(100, (100 / sourceAspectRatio));
  const horizontalOffset = (100 - displayedWidth) / 2;
  const verticalOffset = (100 - displayedHeight) / 2;

  return {
    left: horizontalOffset + bounds.minX * displayedWidth,
    top: verticalOffset + bounds.minY * displayedHeight,
    width: bounds.width * displayedWidth,
    height: bounds.height * displayedHeight,
  };
}