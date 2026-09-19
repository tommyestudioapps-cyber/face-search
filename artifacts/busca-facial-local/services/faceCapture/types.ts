export type ImageOrientation =
  | 'portrait'
  | 'portrait-upside-down'
  | 'landscape-left'
  | 'landscape-right'
  | 'unknown';

export interface NormalizedImage {
  uri: string;
  width: number;
  height: number;
  orientation: ImageOrientation;
  temporaryUris: string[];
}

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

export interface FaceBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  coordinateSpace: 'normalized' | 'pixels';
}

export interface NativeFaceResult {
  faceLandmarks?: FaceLandmark[][];
}

export interface NativeResultBundle {
  results?: NativeFaceResult[];
  inputImageHeight?: number;
  inputImageWidth?: number;
  inferenceTime?: number;
}

export interface NativeDetectedFace {
  landmarks: FaceLandmark[];
  boundingBox: FaceBoundingBox;
}

export interface NativeDetectionResult {
  faces: NativeDetectedFace[];
  inputImageHeight: number | null;
  inputImageWidth: number | null;
  inferenceTime: number | null;
}

export type FaceQualityIssue =
  | 'face-too-small'
  | 'face-out-of-frame'
  | 'excessive-rotation'
  | 'insufficient-light'
  | 'excessive-light'
  | 'blur-detected'
  | 'landmarks-incomplete';

export interface FaceQuality {
  accepted: boolean;
  faceSizeAccepted: boolean;
  faceInFrameAccepted: boolean;
  landmarksAccepted: boolean;
  rotationAccepted: boolean;
  lightingAccepted: boolean;
  sharpnessAccepted: boolean;
  brightness: number | null;
  sharpness: number | null;
  yawDegrees: number | null;
  pitchDegrees: number | null;
  rollDegrees: number;
  reason: 'accepted' | FaceQualityIssue;
  issues: FaceQualityIssue[];
}

export interface DetectedFace {
  id: number;
  landmarks: FaceLandmark[];
  bounds: FaceBounds;
  boundingBox: FaceBoundingBox;
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
  standardized: boolean;
  sourceUri?: string;
  rotationDegrees: number;
  crop: {
    originX: number;
    originY: number;
    width: number;
    height: number;
  };
}

export type FaceCaptureStatus =
  | 'idle'
  | 'preparing'
  | 'detecting'
  | 'validating'
  | 'awaiting-face-selection'
  | 'aligning'
  | 'completed'
  | 'cancelled'
  | 'error';

export interface FaceCaptureState {
  status: FaceCaptureStatus;
  progress: number;
  sourceUri: string | null;
  session: FaceDetectionSession | null;
  detectedFaces: DetectedFace[];
  selectedFaceId: number | null;
  alignedFace: AlignedFace | null;
  error: FaceCaptureError | null;
}

export type FaceCaptureErrorCode =
  | 'web-unsupported'
  | 'invalid-image'
  | 'model-unavailable'
  | 'native-module-unavailable'
  | 'no-face'
  | 'multiple-faces'
  | 'face-too-small'
  | 'face-out-of-frame'
  | 'excessive-rotation'
  | 'insufficient-light'
  | 'excessive-light'
  | 'blur-detected'
  | 'landmarks-incomplete'
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