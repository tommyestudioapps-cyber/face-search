import assert from 'node:assert/strict';
import test from 'node:test';
import * as jpeg from 'jpeg-js';
import { getFaceOverlayLayout } from '../../../components/faceOverlayLayout.ts';
import {
  getExifTransform,
  getNormalizedImageDimensions,
  normalizeFaceBoundsForExif,
  readJpegMetadata,
} from '../preprocessingGeometry.ts';

function withExifOrientation(jpegBytes, orientation) {
  const payload = Buffer.alloc(32);
  payload.write('Exif\0\0', 0, 'ascii');
  payload.write('II', 6, 'ascii');
  payload.writeUInt16LE(42, 8);
  payload.writeUInt32LE(8, 10);
  payload.writeUInt16LE(1, 14);
  payload.writeUInt16LE(0x0112, 16);
  payload.writeUInt16LE(3, 18);
  payload.writeUInt32LE(1, 20);
  payload.writeUInt16LE(orientation, 24);

  const app1 = Buffer.alloc(payload.length + 4);
  app1.writeUInt8(0xff, 0);
  app1.writeUInt8(0xe1, 1);
  app1.writeUInt16BE(payload.length + 2, 2);
  payload.copy(app1, 4);
  return Buffer.concat([jpegBytes.subarray(0, 2), app1, jpegBytes.subarray(2)]);
}

test('mapeia as oito orientações EXIF para operações explícitas de pixels', () => {
  assert.deepEqual(getExifTransform(1), { rotationDegrees: 0, flips: [] });
  assert.deepEqual(getExifTransform(2), { rotationDegrees: 0, flips: ['horizontal'] });
  assert.deepEqual(getExifTransform(3), { rotationDegrees: 180, flips: [] });
  assert.deepEqual(getExifTransform(4), { rotationDegrees: 0, flips: ['vertical'] });
  assert.deepEqual(getExifTransform(5), { rotationDegrees: 270, flips: ['horizontal'] });
  assert.deepEqual(getExifTransform(6), { rotationDegrees: 90, flips: [] });
  assert.deepEqual(getExifTransform(7), { rotationDegrees: 90, flips: ['horizontal'] });
  assert.deepEqual(getExifTransform(8), { rotationDegrees: 270, flips: [] });
});

function createImageFixture(width, height, orientation) {
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      data[offset] = (x / width) * 255;
      data[offset + 1] = (y / height) * 255;
      data[offset + 2] = 180;
      data[offset + 3] = 255;
    }
  }
  return withExifOrientation(jpeg.encode({ data, width, height }, 85).data, orientation);
}

function assertLayout(actual, expected) {
  for (const key of Object.keys(expected)) {
    assert.ok(
      Math.abs(actual[key] - expected[key]) < 0.000001,
      `${key}: expected ${expected[key]}, received ${actual[key]}`,
    );
  }
}

function bounds(minX, minY, width, height) {
  return {
    minX,
    minY,
    maxX: minX + width,
    maxY: minY + height,
    width,
    height,
  };
}

test('normaliza EXIF 6 de uma foto paisagem da galeria no Android antes do overlay', async () => {
  const jpegBytes = createImageFixture(1600, 900, 6);
  const metadata = readJpegMetadata(jpegBytes);

  assert.deepEqual(metadata, { width: 1600, height: 900, orientation: 6 });
  assert.deepEqual(getNormalizedImageDimensions(1600, 900, 6), {
    width: 900,
    height: 1600,
  });

  const normalizedFace = normalizeFaceBoundsForExif(bounds(0.15, 0.2, 0.2, 0.3), 6);
  const layout = getFaceOverlayLayout(normalizedFace, 900, 1600);
  assertLayout(layout, {
    left: 50,
    top: -12.222222222222229,
    width: 30,
    height: 35.55555555555556,
  });
});

test('normaliza EXIF 8 de uma foto retrato da câmera no Android antes do overlay', async () => {
  const jpegBytes = createImageFixture(720, 1280, 8);
  const metadata = readJpegMetadata(jpegBytes);

  assert.deepEqual(metadata, { width: 720, height: 1280, orientation: 8 });
  assert.deepEqual(getNormalizedImageDimensions(720, 1280, 8), {
    width: 1280,
    height: 720,
  });

  const normalizedFace = normalizeFaceBoundsForExif(bounds(0.2, 0.1, 0.3, 0.2), 8);
  const layout = getFaceOverlayLayout(normalizedFace, 1280, 720);
  assertLayout(layout, {
    left: -21.111111111111107,
    top: 50,
    width: 35.55555555555556,
    height: 30,
  });
});