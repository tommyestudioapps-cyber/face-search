import type { AlignedFace } from './faceCapture/types';
import {
  indexGallery,
  readIndexedPhotos,
  searchFace,
  type FaceSearchResult,
  type GalleryIndexOptions,
  type GalleryIndexResult,
} from './faceSearch';

export interface LocalPhoto {
  id: string;
  uri: string;
  filename?: string;
  creationTime?: number;
}

export interface PhotoMatch extends LocalPhoto {
  confidence: number;
  similarity: number;
  classification: FaceSearchResult['classification'];
  faceId: string;
  faceIndex: number;
}

function toLocalPhoto(photo: {
  assetId: string;
  uri: string;
  filename: string | null;
  creationTime: number | null;
}): LocalPhoto {
  return {
    id: photo.assetId,
    uri: photo.uri,
    filename: photo.filename ?? undefined,
    creationTime: photo.creationTime ?? undefined,
  };
}

function toPhotoMatch(result: FaceSearchResult): PhotoMatch {
  return {
    ...toLocalPhoto(result),
    confidence: Math.round(Math.max(0, result.similarity) * 100),
    similarity: result.similarity,
    classification: result.classification,
    faceId: result.faceId,
    faceIndex: result.faceIndex,
  };
}

export async function readLocalGallery(): Promise<LocalPhoto[]> {
  const indexedPhotos = await readIndexedPhotos();
  return indexedPhotos.map(toLocalPhoto);
}

export async function persistLocalIndex(
  _photos?: LocalPhoto[],
  options?: GalleryIndexOptions,
): Promise<GalleryIndexResult> {
  return indexGallery(options);
}

export async function readPersistedIndex(): Promise<LocalPhoto[]> {
  return readLocalGallery();
}

export async function searchIndexedGallery(
  alignedFace: AlignedFace,
): Promise<PhotoMatch[]> {
  const summary = await searchFace(alignedFace);
  return summary.results.map(toPhotoMatch);
}

export {
  indexGallery,
  readIndexedPhotos,
  searchFace,
};
export type {
  FaceSearchResult,
  GalleryIndexOptions,
  GalleryIndexResult,
};