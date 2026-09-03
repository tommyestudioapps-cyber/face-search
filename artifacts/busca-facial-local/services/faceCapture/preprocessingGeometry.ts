import type { FaceBounds, ImageOrientation } from './types';

export type ExifOrientation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface JpegImageMetadata {
  width: number;
  height: number;
  orientation: ExifOrientation;
}

export interface ImageDimensions {
  width: number;
  height: number;
}

function isExifOrientation(value: number): value is ExifOrientation {
  return Number.isInteger(value) && value >= 1 && value <= 8;
}

function readUint16(bytes: Uint8Array, offset: number, littleEndian: boolean): number {
  return littleEndian
    ? bytes[offset] | (bytes[offset + 1] << 8)
    : (bytes[offset] << 8) | bytes[offset + 1];
}

function readUint32(bytes: Uint8Array, offset: number, littleEndian: boolean): number {
  return littleEndian
    ? bytes[offset] |
        (bytes[offset + 1] << 8) |
        (bytes[offset + 2] << 16) |
        (bytes[offset + 3] << 24)
    : bytes[offset] * 0x1000000 +
        bytes[offset + 1] * 0x10000 +
        bytes[offset + 2] * 0x100 +
        bytes[offset + 3];
}

function parseExifOrientation(bytes: Uint8Array, start: number, length: number): ExifOrientation | null {
  const end = start + length;
  if (length < 14 || end > bytes.length) {
    return null;
  }

  const exifHeader = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00];
  if (!exifHeader.every((value, index) => bytes[start + index] === value)) {
    return null;
  }

  const tiffStart = start + 6;
  const littleEndian = bytes[tiffStart] === 0x49 && bytes[tiffStart + 1] === 0x49;
  const bigEndian = bytes[tiffStart] === 0x4d && bytes[tiffStart + 1] === 0x4d;
  if ((!littleEndian && !bigEndian) || readUint16(bytes, tiffStart + 2, littleEndian) !== 42) {
    return null;
  }

  const ifdOffset = readUint32(bytes, tiffStart + 4, littleEndian);
  const ifdStart = tiffStart + ifdOffset;
  if (ifdStart + 2 > end) {
    return null;
  }

  const entryCount = readUint16(bytes, ifdStart, littleEndian);
  for (let entry = 0; entry < entryCount; entry += 1) {
    const entryStart = ifdStart + 2 + entry * 12;
    if (entryStart + 12 > end) {
      return null;
    }

    const tag = readUint16(bytes, entryStart, littleEndian);
    const type = readUint16(bytes, entryStart + 2, littleEndian);
    const count = readUint32(bytes, entryStart + 4, littleEndian);
    if (tag !== 0x0112 || type !== 3 || count < 1) {
      continue;
    }

    const orientation = readUint16(bytes, entryStart + 8, littleEndian);
    return isExifOrientation(orientation) ? orientation : null;
  }

  return null;
}

/**
 * Reads the JPEG's physical dimensions and EXIF orientation without decoding
 * pixels. The decoder is still responsible for baking that orientation into
 * the normalized output.
 */
export function readJpegMetadata(bytes: Uint8Array): JpegImageMetadata | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return null;
  }

  let offset = 2;
  let orientation: ExifOrientation = 1;
  let width: number | null = null;
  let height: number | null = null;

  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = bytes[offset + 1];
    offset += 2;
    if (marker === 0xd9 || marker === 0xda) {
      break;
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) {
      continue;
    }

    const segmentLength = readUint16(bytes, offset, false);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) {
      break;
    }

    if (marker === 0xe1) {
      orientation = parseExifOrientation(bytes, offset + 2, segmentLength - 2) ?? orientation;
    }

    const isStartOfFrame =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isStartOfFrame && segmentLength >= 7) {
      height = readUint16(bytes, offset + 3, false);
      width = readUint16(bytes, offset + 5, false);
    }

    offset += segmentLength;
  }

  return width && height ? { width, height, orientation } : null;
}

export function getNormalizedImageDimensions(
  width: number,
  height: number,
  orientation: ExifOrientation = 1,
): ImageDimensions {
  const swapsAxes = orientation >= 5;
  return swapsAxes ? { width: height, height: width } : { width, height };
}

export function getPhysicalOrientation(width: number, height: number): ImageOrientation {
  return height >= width ? 'portrait' : 'landscape-left';
}

function transformPoint(x: number, y: number, orientation: ExifOrientation) {
  switch (orientation) {
    case 2:
      return { x: 1 - x, y };
    case 3:
      return { x: 1 - x, y: 1 - y };
    case 4:
      return { x, y: 1 - y };
    case 5:
      return { x: y, y: x };
    case 6:
      return { x: 1 - y, y: x };
    case 7:
      return { x: 1 - y, y: 1 - x };
    case 8:
      return { x: y, y: 1 - x };
    case 1:
    default:
      return { x, y };
  }
}

/**
 * Converts detector bounds expressed in the physical JPEG coordinate space
 * into the coordinate space of the EXIF-normalized pixels.
 */
export function normalizeFaceBoundsForExif(
  bounds: FaceBounds,
  orientation: ExifOrientation = 1,
): FaceBounds {
  const points = [
    transformPoint(bounds.minX, bounds.minY, orientation),
    transformPoint(bounds.maxX, bounds.minY, orientation),
    transformPoint(bounds.minX, bounds.maxY, orientation),
    transformPoint(bounds.maxX, bounds.maxY, orientation),
  ];
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}