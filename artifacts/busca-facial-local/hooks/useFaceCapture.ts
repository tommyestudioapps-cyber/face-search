import { useCallback, useEffect, useRef, useState } from 'react';
import {
  alignSelectedFace,
  detectFaces,
  getFaceQualityError,
  getSelectableFaces,
  releaseFaceDetectionSession,
  releaseTemporaryUris,
  type AlignedFace,
  type DetectedFace,
  type FaceCaptureError,
  type FaceDetectionSession,
  type FaceCaptureStatus,
} from '@/services/faceCapture';

export function useFaceCapture() {
  const [faces, setFaces] = useState<DetectedFace[]>([]);
  const [selectedFaceId, setSelectedFaceId] = useState<number | null>(null);
  const [alignedFace, setAlignedFace] = useState<AlignedFace | null>(null);
  const [session, setSession] = useState<FaceDetectionSession | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<FaceCaptureError | null>(null);
  const [status, setStatus] = useState<FaceCaptureStatus>('idle');
  const requestId = useRef(0);
  const sessionRef = useRef<FaceDetectionSession | null>(null);
  const alignedFaceRef = useRef<AlignedFace | null>(null);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const clearAlignedFace = useCallback(async () => {
    const previous = alignedFaceRef.current;
    alignedFaceRef.current = null;
    setAlignedFace(null);
    if (previous) {
      await releaseTemporaryUris([previous.uri]);
    }
  }, []);

  const setAlignedFaceResult = useCallback(
    async (next: AlignedFace | null) => {
      const previous = alignedFaceRef.current;
      alignedFaceRef.current = next;
      setAlignedFace(next);
      if (previous && previous.uri !== next?.uri) {
        await releaseTemporaryUris([previous.uri]);
      }
    },
    [],
  );

  const toCaptureError = useCallback((caught: unknown): FaceCaptureError => {
    if (caught instanceof Error && caught.name === 'FaceCaptureError') {
      return caught as FaceCaptureError;
    }
    const message = caught instanceof Error ? caught.message : 'Falha ao processar a captura.';
    return {
      name: 'FaceCaptureError',
      message,
      code: 'processing-failed',
    } as FaceCaptureError;
  }, []);

  const reset = useCallback(async () => {
    requestId.current += 1;
    setIsProcessing(false);
    setFaces([]);
    setSelectedFaceId(null);
    await clearAlignedFace();
    setError(null);
    setStatus('idle');
    const previous = sessionRef.current;
    sessionRef.current = null;
    setSession(null);
    await releaseFaceDetectionSession(previous);
  }, [clearAlignedFace]);

  const cancel = useCallback(async () => {
    requestId.current += 1;
    setIsProcessing(false);
    setFaces([]);
    setSelectedFaceId(null);
    await clearAlignedFace();
    setError(null);
    setStatus('cancelled');
    const previous = sessionRef.current;
    sessionRef.current = null;
    setSession(null);
    await releaseFaceDetectionSession(previous);
  }, [clearAlignedFace]);

  const analyze = useCallback(async (uri: string) => {
    const currentRequest = requestId.current + 1;
    requestId.current = currentRequest;
    setIsProcessing(true);
    setError(null);
    setStatus('preparing');
    await clearAlignedFace();

    const previous = sessionRef.current;
    sessionRef.current = null;
    setSession(null);
    await releaseFaceDetectionSession(previous);

    try {
      setStatus('detecting');
      const nextSession = await detectFaces(uri);
      if (requestId.current !== currentRequest) {
        await releaseFaceDetectionSession(nextSession);
        return null;
      }

      setStatus('validating');
      const selectableFaces = getSelectableFaces(nextSession.faces);
      if (selectableFaces.length === 0) {
        await releaseFaceDetectionSession(nextSession);
        throw getFaceQualityError(nextSession.faces);
      }

      setSession(nextSession);
      sessionRef.current = nextSession;
      setFaces(nextSession.faces);
      const onlyFace = selectableFaces.length === 1 ? selectableFaces[0] : null;
      setSelectedFaceId(onlyFace?.id ?? null);
      if (!onlyFace) {
        setStatus('awaiting-face-selection');
      } else {
        setStatus('aligning');
        const result = await alignSelectedFace(nextSession, onlyFace.id);
        if (requestId.current === currentRequest) {
          await setAlignedFaceResult(result);
          setStatus('completed');
        }
      }
      return nextSession;
    } catch (caught) {
      if (requestId.current === currentRequest) {
        setError(toCaptureError(caught));
        setStatus('error');
      }
      return null;
    } finally {
      if (requestId.current === currentRequest) {
        setIsProcessing(false);
      }
    }
  }, [clearAlignedFace, getFaceQualityError, setAlignedFaceResult, toCaptureError]);

  const align = useCallback(async (faceId: number | null = selectedFaceId) => {
    if (!sessionRef.current || faceId === null) {
      return null;
    }
    const currentRequest = requestId.current;
    setIsProcessing(true);
    setError(null);
    setStatus('aligning');
    try {
      const result = await alignSelectedFace(sessionRef.current, faceId);
      if (requestId.current !== currentRequest) {
        await releaseTemporaryUris([result.uri]);
        return null;
      }
      await setAlignedFaceResult(result);
      setStatus('completed');
      return result;
    } catch (caught) {
      if (requestId.current === currentRequest) {
        setError(toCaptureError(caught));
        setStatus('error');
      }
      return null;
    } finally {
      if (requestId.current === currentRequest) {
        setIsProcessing(false);
      }
    }
  }, [selectedFaceId, setAlignedFaceResult, toCaptureError]);

  useEffect(() => {
    return () => {
      void releaseFaceDetectionSession(sessionRef.current);
      if (alignedFaceRef.current) {
        void releaseTemporaryUris([alignedFaceRef.current.uri]);
      }
    };
  }, []);

  return {
    faces,
    selectedFaceId,
    setSelectedFaceId,
    alignedFace,
    status,
    isProcessing,
    error,
    imageWidth: session?.width ?? null,
    imageHeight: session?.height ?? null,
    normalizedImageUri: session?.normalizedUri ?? null,
    analyze,
    align,
    cancel,
    reset,
  };
}