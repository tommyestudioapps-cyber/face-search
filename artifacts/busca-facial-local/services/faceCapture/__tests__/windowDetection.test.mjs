import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createDetectionWindowLayout,
  deduplicateWindowFaces,
  mapWindowFacesToImage,
} from '../windowDetection.ts';

test('uses the whole image for ratios at or below 1.4', () => {
  const layout = createDetectionWindowLayout(140, 100);

  assert.equal(layout.elongated, false);
  assert.equal(layout.windows.length, 1);
  assert.deepEqual(layout.windows[0], {
    index: 0,
    x: 0,
    y: 0,
    width: 140,
    height: 100,
  });
  assert.equal(layout.coverage, 1);
});

test('creates the expected uniformly spaced windows and coverage for target ratios', () => {
  const cases = [
    { ratio: 1.78, count: 3, last: 78, coverage: 1 },
    { ratio: 3, count: 5, last: 200, coverage: 1 },
    { ratio: 5, count: 5, last: 400, coverage: 1 },
    { ratio: 8, count: 5, last: 700, coverage: 0.625 },
  ];

  for (const item of cases) {
    const layout = createDetectionWindowLayout(item.ratio * 100, 100);
    assert.equal(layout.windows.length, item.count, `R=${item.ratio}`);
    assert.equal(layout.windows[0].x, 0, `R=${item.ratio} first`);
    assert.equal(
      layout.windows.at(-1).x,
      item.last,
      `R=${item.ratio} last`,
    );
    assert.ok(layout.windows.length <= 5);
    assert.ok(Math.abs(layout.coverage - item.coverage) < 0.001);
    const expectedSpacing = item.last / (item.count - 1);
    for (let index = 1; index < layout.windows.length; index += 1) {
      const previous = layout.windows[index - 1];
      const current = layout.windows[index];
      assert.ok(
        Math.abs(current.x - previous.x - expectedSpacing) <= 1,
        `R=${item.ratio} spacing at window ${index}`,
      );
    }
  }
});

test('places portrait panorama windows uniformly from top to bottom', () => {
  const layout = createDetectionWindowLayout(100, 300);

  assert.deepEqual(layout.windows.map((window) => window.y), [
    0,
    50,
    100,
    150,
    200,
  ]);
  assert.ok(layout.windows.every((window) => window.x === 0));
});

test('maps tile-local normalized landmarks back to the full image', () => {
  const window = {
    index: 1,
    x: 100,
    y: 0,
    width: 100,
    height: 100,
  };
  const [mapped] = mapWindowFacesToImage(
    [{
      landmarks: [{ x: 0.2, y: 0.3, z: 0 }],
      boundingBox: {
        x: 0.1,
        y: 0.2,
        width: 0.3,
        height: 0.4,
        coordinateSpace: 'normalized',
      },
    }],
    window,
    300,
    100,
  );

  assert.ok(Math.abs(mapped.landmarks[0].x - 0.4) < 1e-8);
  assert.equal(mapped.landmarks[0].y, 0.3);
  assert.ok(Math.abs(mapped.boundingBox.x - 0.3666666667) < 1e-8);
  assert.equal(mapped.boundingBox.y, 0.2);
  assert.equal(mapped.boundingBox.width, 0.1);
  assert.equal(mapped.boundingBox.height, 0.4);
});

test('deduplicates overlapping boxes and keeps the face farther from its tile edge', () => {
  const window0 = { index: 0, x: 0, y: 0, width: 100, height: 100 };
  const window1 = { index: 1, x: 50, y: 0, width: 100, height: 100 };
  const [nearEdge] = mapWindowFacesToImage(
    [{
      landmarks: [{ x: 0.75, y: 0.4, z: 0 }, { x: 0.95, y: 0.6, z: 0 }],
      boundingBox: {
        x: 0.75,
        y: 0.4,
        width: 0.2,
        height: 0.2,
        coordinateSpace: 'normalized',
      },
    }],
    window0,
    150,
    100,
  );
  const [fartherFromEdge] = mapWindowFacesToImage(
    [{
      landmarks: [{ x: 0.25, y: 0.4, z: 0 }, { x: 0.45, y: 0.6, z: 0 }],
      boundingBox: {
        x: 0.25,
        y: 0.4,
        width: 0.2,
        height: 0.2,
        coordinateSpace: 'normalized',
      },
    }],
    window1,
    150,
    100,
  );

  assert.equal(
    deduplicateWindowFaces([nearEdge, fartherFromEdge], 150, 100).length,
    1,
  );
  assert.equal(
    deduplicateWindowFaces([nearEdge, fartherFromEdge], 150, 100)[0]
      .windowIndex,
    1,
  );
});

test('deduplicates matching eye centers even when bounding boxes do not overlap', () => {
  const makeLandmarks = (shift) => {
    const landmarks = Array.from({ length: 264 }, () => ({
      x: 0.5,
      y: 0.5,
      z: 0,
    }));
    landmarks[33] = { x: 0.4 + shift, y: 0.5, z: 0 };
    landmarks[133] = { x: 0.42 + shift, y: 0.5, z: 0 };
    landmarks[263] = { x: 0.58 + shift, y: 0.5, z: 0 };
    landmarks[362] = { x: 0.6 + shift, y: 0.5, z: 0 };
    return landmarks;
  };
  const first = {
    landmarks: makeLandmarks(0),
    boundingBox: {
      x: 0.05,
      y: 0.1,
      width: 0.1,
      height: 0.1,
      coordinateSpace: 'normalized',
    },
    windowIndex: 0,
    sourceWindow: { index: 0, x: 0, y: 0, width: 100, height: 100 },
    edgeDistancePx: 5,
  };
  const second = {
    landmarks: makeLandmarks(0.01),
    boundingBox: {
      x: 0.8,
      y: 0.7,
      width: 0.1,
      height: 0.1,
      coordinateSpace: 'normalized',
    },
    windowIndex: 1,
    sourceWindow: { index: 1, x: 50, y: 0, width: 100, height: 100 },
    edgeDistancePx: 20,
  };

  assert.equal(
    deduplicateWindowFaces([first, second], 1000, 1000).length,
    1,
  );
});