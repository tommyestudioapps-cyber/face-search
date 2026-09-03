import type {
  AlignedFace,
  DetectedFace,
  FaceCaptureError,
  FaceCaptureStatus,
  FaceDetectionSession,
} from './types';

export interface FaceCaptureFlowOperations {
  detectFaces: (sourceUri: string) => Promise<FaceDetectionSession>;
  alignSelectedFace: (session: FaceDetectionSession, faceId: number) => Promise<AlignedFace>;
  releaseFaceDetectionSession: (session: FaceDetectionSession | null) => Promise<void>;
  getFaceQualityError: (faces: DetectedFace[]) => FaceCaptureError;
}

export interface FaceCaptureFlowCallbacks {
  onStatus: (status: FaceCaptureStatus) => void;
  onSession: (session: FaceDetectionSession) => void;
  onFaces: (faces: DetectedFace[]) => void;
  onSelectedFaceId: (faceId: number | null) => void;
  onAlignedFace: (alignedFace: AlignedFace) => void | Promise<void>;
  isCurrent?: () => boolean;
}

export function getSelectableFaces(faces: DetectedFace[]): DetectedFace[] {
  return faces.filter((face) => face.quality.accepted);
}

/**
 * Runs the capture state transitions after the caller has prepared its state.
 * The callbacks keep React-specific state in the hook while this orchestration
 * remains directly testable with synthetic detector and aligner results.
 */
export async function runFaceCaptureFlow(
  sourceUri: string,
  operations: FaceCaptureFlowOperations,
  callbacks: FaceCaptureFlowCallbacks,
): Promise<FaceDetectionSession | null> {
  const isCurrent = callbacks.isCurrent ?? (() => true);

  callbacks.onStatus('preparing');
  callbacks.onStatus('detecting');
  const nextSession = await operations.detectFaces(sourceUri);
  if (!isCurrent()) {
    await operations.releaseFaceDetectionSession(nextSession);
    return null;
  }

  callbacks.onStatus('validating');
  const selectableFaces = getSelectableFaces(nextSession.faces);
  if (selectableFaces.length === 0) {
    await operations.releaseFaceDetectionSession(nextSession);
    throw operations.getFaceQualityError(nextSession.faces);
  }

  callbacks.onSession(nextSession);
  callbacks.onFaces(nextSession.faces);
  const onlyFace = selectableFaces.length === 1 ? selectableFaces[0] : null;
  callbacks.onSelectedFaceId(onlyFace?.id ?? null);
  if (!onlyFace) {
    callbacks.onStatus('awaiting-face-selection');
    return nextSession;
  }

  callbacks.onStatus('aligning');
  const alignedFace = await operations.alignSelectedFace(nextSession, onlyFace.id);
  if (!isCurrent()) {
    await operations.releaseFaceDetectionSession({
      ...nextSession,
      temporaryUris: [alignedFace.uri],
    });
    return null;
  }

  await callbacks.onAlignedFace(alignedFace);
  callbacks.onStatus('completed');
  return nextSession;
}