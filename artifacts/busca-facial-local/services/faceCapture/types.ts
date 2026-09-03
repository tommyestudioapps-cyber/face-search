export interface FaceLandmark {
  x: number;
  y: number;
  z: number;
  presence?: number;
  visibility?: number;
}

export interface FaceBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

export interface FaceQuality {
  accepted: boolean;
  faceSizeAccepted: boolean;
  landmarksAccepted: boolean;
  rotationAccepted: boolean;
  lightingAccepted: boolean;
  sharpnessAccepted: boolean;
  confidenceAccepted: boolean;
  brightness: number | null;
  sharpness: number | null;
  rollDegrees: number;
  reason:
    | 'accepted'
    | 'face-too-small'
    | 'landmarks-incomplete'
    | 'excessive-rotation'
    | 'insufficient-light'
    | 'excessive-light'
    | 'blur-detected'
    | 'low-confidence';
}

export interface DetectedFace {
  id: number;
  landmarks: FaceLandmark[];
  bounds: FaceBounds;
  rollDegrees: number;
  confidence: number | null;
  confidenceSource: 'mediapipe-threshold';
  quality: FaceQuality;
}

export interface FaceDetectionSession {
  sourceUri: string;
  normalizedUri: string;
  width: number;
  height: number;
  faces: DetectedFace[];
  temporaryUris: string[];
}

export interface AlignedFace {
  uri: string;
  width: number;
  height: number;
  faceId: number;
  rotationDegrees: number;
  crop: {
    originX: number;
    originY: number;
    width: number;
    height: number;
  };
}

export type FaceCaptureErrorCode =
  | 'web-unsupported'
  | 'invalid-image'
  | 'model-unavailable'
  | 'native-module-unavailable'
  | 'no-face'
  | 'multiple-faces'
  | 'quality-rejected'
  | 'processing-failed'
  | 'cancelled';

export class FaceCaptureError extends Error {
  constructor(
    public readonly code: FaceCaptureErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'FaceCaptureError';
  }
}