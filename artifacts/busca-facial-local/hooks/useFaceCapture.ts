import { useCallback, useEffect, useRef, useState } from 'react';
import {
  alignSelectedFace,
  cleanupTempFiles,
  detectFaces,
  getFaceQualityError,
  releaseFaceDetectionSession,
  runFaceCaptureFlow,
  type AlignedFace,
  type DetectedFace,
  type FaceCaptureError,
  type FaceCaptureStatus,
  type FaceDetectionSession,
} from '@/services/faceCapture';
import {
  clearPersistedSession,
  loadFaceSlots,
  loadPersistedSession,
  persistFaceSlots,
  persistSession,
  type PersistedSession,
} from '@/services/faceCapture/sessionPersistence';

interface SlotState {
  alignedFace: AlignedFace | null;
  sourceUri: string | null;
  session: FaceDetectionSession | null;
  faces: DetectedFace[];
  selectedFaceId: number | null;
  status: FaceCaptureStatus;
  error: FaceCaptureError | null;
  persistedUri: string | null;
  requestId: number;
}

function emptySlot(): SlotState {
  return {
    alignedFace: null,
    sourceUri: null,
    session: null,
    faces: [],
    selectedFaceId: null,
    status: 'idle',
    error: null,
    persistedUri: null,
    requestId: 0,
  };
}

export function useFaceCapture() {
  const [slots, setSlots] = useState<[SlotState, SlotState]>([
    emptySlot(),
    emptySlot(),
  ]);
  const [activeSlot, setActiveSlot] = useState<0 | 1>(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const slotsRef = useRef<[SlotState, SlotState]>([emptySlot(), emptySlot()]);

  useEffect(() => {
    slotsRef.current = slots;
  }, [slots]);

  const updateSlot = useCallback(
    (slotIndex: 0 | 1, patch: Partial<SlotState>) => {
      setSlots((current) => {
        const next: [SlotState, SlotState] = [
          slotIndex === 0 ? { ...current[0], ...patch } : current[0],
          slotIndex === 1 ? { ...current[1], ...patch } : current[1],
        ];
        slotsRef.current = next;
        return next;
      });
    },
    [],
  );

  const updateSlotRef = useCallback(
    (slotIndex: 0 | 1, patch: Partial<SlotState>) => {
      slotsRef.current = [
        slotIndex === 0
          ? { ...slotsRef.current[0], ...patch }
          : slotsRef.current[0],
        slotIndex === 1
          ? { ...slotsRef.current[1], ...patch }
          : slotsRef.current[1],
      ];
      setSlots(slotsRef.current);
    },
    [],
  );

  const persistCurrentSlots = useCallback(async () => {
    const persisted = slotsRef.current.map((slot) => {
      if (!slot.alignedFace || !slot.sourceUri) {
        return null;
      }
      return {
        alignedFace: slot.alignedFace,
        sourceUri: slot.sourceUri,
      };
    });
    await persistFaceSlots(persisted);
  }, []);

  const clearAlignedFace = useCallback(
    async (slotIndex?: 0 | 1) => {
      const target = slotIndex ?? activeSlot;
      const slot = slotsRef.current[target];
      const previous = slot.alignedFace;
      updateSlotRef(target, { alignedFace: null, persistedUri: null });
      if (previous && previous.uri !== slot.persistedUri) {
        await cleanupTempFiles([previous.uri]);
      }
    },
    [activeSlot, updateSlotRef],
  );

  const setAlignedFaceResult = useCallback(
    async (next: AlignedFace | null, slotIndex?: 0 | 1) => {
      const target = slotIndex ?? activeSlot;
      const slot = slotsRef.current[target];
      const previous = slot.alignedFace;

      const patch: Partial<SlotState> = { alignedFace: next };
      if (next && !slot.sourceUri) {
        patch.sourceUri = next.sourceUri ?? null;
      }
      updateSlotRef(target, patch);

      if (next) {
        void (async () => {
          try {
            await persistCurrentSlots();
          } catch {
            // Persistência é best-effort: se falhar, o slot continua válido em
            // memória até o app ser fechado. sessionPersistence.ts já loga falhas
            // internamente — não duplicar aqui.
          }
        })();
      }

      if (
        previous &&
        previous.uri !== next?.uri &&
        previous.uri !== slot.persistedUri
      ) {
        await cleanupTempFiles([previous.uri]);
      }
    },
    [activeSlot, persistCurrentSlots, updateSlotRef],
  );

  const toCaptureError = useCallback((caught: unknown): FaceCaptureError => {
    if (caught instanceof Error && caught.name === 'FaceCaptureError') {
      return caught as FaceCaptureError;
    }
    const message =
      caught instanceof Error
        ? caught.message
        : 'Falha ao processar a captura.';
    return {
      name: 'FaceCaptureError',
      message,
      code: 'processing-failed',
    } as FaceCaptureError;
  }, []);

  const reset = useCallback(
    async (options?: { preserveSession?: boolean }) => {
      for (const i of [0, 1] as const) {
        const slot = slotsRef.current[i];
        if (
          slot.alignedFace &&
          slot.alignedFace.uri !== slot.persistedUri
        ) {
          await cleanupTempFiles([slot.alignedFace.uri]);
        }
        await releaseFaceDetectionSession(slot.session);
      }
      slotsRef.current = [emptySlot(), emptySlot()];
      setSlots(slotsRef.current);
      setIsProcessing(false);
      if (!options?.preserveSession) {
        await clearPersistedSession();
      }
      setActiveSlot(0);
    },
    [],
  );

  const cancel = useCallback(async () => {
    for (const i of [0, 1] as const) {
      updateSlotRef(i, { requestId: slotsRef.current[i].requestId + 1 });
      const slot = slotsRef.current[i];
      await releaseFaceDetectionSession(slot.session);
    }
    slotsRef.current = [emptySlot(), emptySlot()];
    setSlots(slotsRef.current);
    setIsProcessing(false);
    await clearPersistedSession();
    setActiveSlot(0);
  }, [updateSlotRef]);

  const analyze = useCallback(
    async (uri: string, slotIndex?: 0 | 1) => {
      const target = slotIndex ?? activeSlot;
      const current = slotsRef.current[target];
      const currentRequest = current.requestId + 1;
      updateSlotRef(target, {
        requestId: currentRequest,
        sourceUri: uri,
        status: 'preparing',
        error: null,
      });
      setIsProcessing(true);

      if (
        current.alignedFace &&
        current.alignedFace.uri !== current.persistedUri
      ) {
        await cleanupTempFiles([current.alignedFace.uri]);
      }
      await releaseFaceDetectionSession(current.session);
      updateSlotRef(target, {
        alignedFace: null,
        faces: [],
        selectedFaceId: null,
        session: null,
      });

      try {
        return await runFaceCaptureFlow(
          uri,
          {
            detectFaces,
            alignSelectedFace,
            releaseFaceDetectionSession,
            getFaceQualityError,
          },
          {
            onStatus: (status) => updateSlotRef(target, { status }),
            onSession: (nextSession) =>
              updateSlotRef(target, { session: nextSession }),
            onFaces: (faces) => updateSlotRef(target, { faces }),
            onSelectedFaceId: (id) =>
              updateSlotRef(target, { selectedFaceId: id }),
            onAlignedFace: (face) => setAlignedFaceResult(face, target),
            isCurrent: () =>
              slotsRef.current[target].requestId === currentRequest,
          },
        );
      } catch (caught) {
        if (slotsRef.current[target].requestId === currentRequest) {
          updateSlotRef(target, {
            error: toCaptureError(caught),
            status: 'error',
          });
        }
        return null;
      } finally {
        if (slotsRef.current[target].requestId === currentRequest) {
          setIsProcessing(false);
        }
      }
    },
    [activeSlot, setAlignedFaceResult, toCaptureError, updateSlotRef],
  );

  const align = useCallback(
    async (faceId?: number | null, slotIndex?: 0 | 1) => {
      const target = slotIndex ?? activeSlot;
      const slot = slotsRef.current[target];
      const targetFaceId =
        faceId === undefined ? slot.selectedFaceId : faceId;
      if (!slot.session || targetFaceId == null) {
        return null;
      }
      const currentRequest = slot.requestId;
      updateSlotRef(target, { status: 'aligning', error: null });
      setIsProcessing(true);
      try {
        const result = await alignSelectedFace(slot.session, targetFaceId);
        if (slotsRef.current[target].requestId !== currentRequest) {
          await cleanupTempFiles([result.uri]);
          return null;
        }
        await setAlignedFaceResult(result, target);
        updateSlotRef(target, { status: 'completed' });
        return result;
      } catch (caught) {
        if (slotsRef.current[target].requestId === currentRequest) {
          updateSlotRef(target, {
            error: toCaptureError(caught),
            status: 'error',
          });
        }
        return null;
      } finally {
        if (slotsRef.current[target].requestId === currentRequest) {
          setIsProcessing(false);
        }
      }
    },
    [
      activeSlot,
      setAlignedFaceResult,
      toCaptureError,
      updateSlotRef,
    ],
  );

  const restoreFromSession = useCallback(
    async (): Promise<PersistedSession | null> => {
      const loaded = await loadFaceSlots();
      const nextSlots: [SlotState, SlotState] = [emptySlot(), emptySlot()];
      loaded.forEach((persisted, index) => {
        if (index > 1 || !persisted) {
          return;
        }
        const target = index as 0 | 1;
        nextSlots[target] = {
          ...nextSlots[target],
          alignedFace: persisted.alignedFace,
          sourceUri: persisted.sourceUri,
          persistedUri: persisted.alignedFace.uri,
        };
      });
      slotsRef.current = nextSlots;
      setSlots(nextSlots);

      const nextActive: 0 | 1 = nextSlots[0].alignedFace
        ? 0
        : nextSlots[1].alignedFace
          ? 1
          : 0;
      setActiveSlot(nextActive);
      if (!nextSlots[0].alignedFace && !nextSlots[1].alignedFace) {
        return null;
      }
      const chosen = nextSlots[nextActive];
      if (!chosen.alignedFace || !chosen.sourceUri) {
        return null;
      }
      return {
        alignedFace: chosen.alignedFace,
        sourceUri: chosen.sourceUri,
        savedAt: Date.now(),
      };
    },
    [],
  );

  const clearSlot = useCallback(
    async (slotIndex: 0 | 1) => {
      const slot = slotsRef.current[slotIndex];
      updateSlotRef(slotIndex, { requestId: slot.requestId + 1 });
      if (
        slot.alignedFace &&
        slot.alignedFace.uri !== slot.persistedUri
      ) {
        await cleanupTempFiles([slot.alignedFace.uri]);
      }
      await releaseFaceDetectionSession(slot.session);
      updateSlotRef(slotIndex, emptySlot());
      await persistCurrentSlots();
    },
    [persistCurrentSlots, updateSlotRef],
  );

  const active = slots[activeSlot];

  return {
    faces: active.faces,
    selectedFaceId: active.selectedFaceId,
    setSelectedFaceId: (id: number | null) =>
      updateSlot(activeSlot, { selectedFaceId: id }),
    alignedFace: active.alignedFace,
    status: active.status,
    isProcessing,
    error: active.error,
    imageWidth: active.session?.width ?? null,
    imageHeight: active.session?.height ?? null,
    normalizedImageUri: active.session?.normalizedUri ?? null,
    activeSlot,
    setActiveSlot,
    clearSlot,
    slots,
    analyze,
    align,
    cancel,
    reset,
    restoreFromSession,
  };

  useEffect(() => {
    return () => {
      for (const slot of slotsRef.current) {
        void releaseFaceDetectionSession(slot.session);
        if (
          slot.alignedFace &&
          slot.alignedFace.uri !== slot.persistedUri
        ) {
          void cleanupTempFiles([slot.alignedFace.uri]);
        }
      }
    };
  }, []);
}