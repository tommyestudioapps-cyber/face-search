import { useCallback, useEffect, useRef, useState } from 'react';
import {
  alignSelectedFace,
  detectFaces,
  getSelectableFaces,
  releaseFaceDetectionSession,
  type AlignedFace,
  type DetectedFace,
  type FaceCaptureError,
  type FaceDetectionSession,
} from '@/services/faceCapture';

export function useFaceCapture() {
  const [faces, setFaces] = useState<DetectedFace[]>([]);
  const [selectedFaceId, setSelectedFaceId] = useState<number | null>(null);
  const [alignedFace, setAlignedFace] = useState<AlignedFace | null>(null);
  const [session, setSession] = useState<FaceDetectionSession | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<FaceCaptureError | null>(null);
  const requestId = useRef(0);
  const sessionRef = useRef<FaceDetectionSession | null>(null);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const reset = useCallback(async () => {
    requestId.current += 1;
    setFaces([]);
    setSelectedFaceId(null);
    setAlignedFace(null);
    setError(null);
    const previous = sessionRef.current;
    sessionRef.current = null;
    setSession(null);
    await releaseFaceDetectionSession(previous);
  }, []);

  const analyze = useCallback(async (uri: string) => {
    const currentRequest = requestId.current + 1;
    requestId.current = currentRequest;
    setIsProcessing(true);
    setError(null);
    setAlignedFace(null);

    const previous = sessionRef.current;
    sessionRef.current = null;
    setSession(null);
    await releaseFaceDetectionSession(previous);

    try {
      const nextSession = await detectFaces(uri);
      if (requestId.current !== currentRequest) {
        await releaseFaceDetectionSession(nextSession);
        return null;
      }

      const selectableFaces = getSelectableFaces(nextSession.faces);
      if (selectableFaces.length === 0) {
        await releaseFaceDetectionSession(nextSession);
        throw new Error('O rosto encontrado não atende aos critérios de qualidade.');
      }

      setSession(nextSession);
      sessionRef.current = nextSession;
      setFaces(nextSession.faces);
      const onlyFace = selectableFaces.length === 1 ? selectableFaces[0] : null;
      setSelectedFaceId(onlyFace?.id ?? null);
      if (onlyFace) {
        const result = await alignSelectedFace(nextSession, onlyFace.id);
        if (requestId.current === currentRequest) {
          setAlignedFace(result);
        }
      }
      return nextSession;
    } catch (caught) {
      if (requestId.current === currentRequest) {
        setError(caught as FaceCaptureError);
      }
      return null;
    } finally {
      if (requestId.current === currentRequest) {
        setIsProcessing(false);
      }
    }
  }, []);

  const align = useCallback(async (faceId: number | null = selectedFaceId) => {
    if (!sessionRef.current || faceId === null) {
      return null;
    }
    setIsProcessing(true);
    setError(null);
    try {
      const result = await alignSelectedFace(sessionRef.current, faceId);
      setAlignedFace(result);
      return result;
    } catch (caught) {
      setError(caught as FaceCaptureError);
      return null;
    } finally {
      setIsProcessing(false);
    }
  }, [selectedFaceId]);

  useEffect(() => {
    return () => {
      void releaseFaceDetectionSession(sessionRef.current);
    };
  }, []);

  return {
    faces,
    selectedFaceId,
    setSelectedFaceId,
    alignedFace,
    isProcessing,
    error,
    imageWidth: session?.width ?? null,
    imageHeight: session?.height ?? null,
    analyze,
    align,
    reset,
  };
}