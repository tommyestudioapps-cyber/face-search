import assert from 'node:assert/strict';
import test from 'node:test';
import { sha256Hex } from '../sha256.ts';

test('computes standard SHA-256 digests for empty and short inputs', () => {
  assert.equal(
    sha256Hex(new Uint8Array()),
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  );
  assert.equal(
    sha256Hex(new TextEncoder().encode('abc')),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
});