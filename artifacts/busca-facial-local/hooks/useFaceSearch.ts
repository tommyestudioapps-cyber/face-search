import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import type { AlignedFace } from '@/services/faceCapture';
import {
  FaceRecognitionError,
  type FaceIndexProgress,
  type FaceSearchResult,
  type FaceSearchSummary,
  type StoredIndexStats,
} from '@/services/faceSearch/types';
import type {
  GalleryIndexResult,
  GalleryIndexTask,
} from '@/services/faceSearch/galleryIndexer';

type FaceSearchModule = typeof import('@/services/faceSearch');

export type FaceSearchStatus =
  | 'idle'
  | 'loading-model'
  | 'requesting-permission'
  | 'indexing'
  | 'ready'
  | 'searching'
  | 'completed'
  | 'empty'
  | 'cancelled'
  | 'error';

export interface UseFaceSearchResult {
  status: FaceSearchStatus;
  progress: FaceIndexProgress;
  results: FaceSearchResult[];
  summary: FaceSearchSummary | null;
  storedIndexStats: StoredIndexStats;
  error: FaceRecognitionError | null;
  startIndexing: () => Promise<GalleryIndexResult | null>;
  cancelIndexing: () => void;
  clearIndex: () => Promise<void>;
  search: (alignedFace: AlignedFace | null) => Promise<FaceSearchSummary | null>;
  indexAndSearch: (
    alignedFace: AlignedFace | null,
  ) => Promise<FaceSearchSummary | null>;
}

const initialProgress: FaceIndexProgress = {
  status: 'idle',
  processedAssets: 0,
  totalAssets: null,
  indexedFaces: 0,
  skippedAssets: 0,
  currentAssetId: null,
  error: null,
};

const initialStoredIndexStats: StoredIndexStats = {
  indexedPhotos: 0,
  indexedFaces: 0,
};

function toFaceSearchError(
  caught: unknown,
  fallbackMessage: string,
): FaceRecognitionError {
  if (caught instanceof FaceRecognitionError) {
    return caught;
  }
  if (caught instanceof Error) {
    return new FaceRecognitionError('indexing-failed', caught.message, caught);
  }
  return new FaceRecognitionError('indexing-failed', fallbackMessage, caught);
}

function statusFromProgress(
  progress: FaceIndexProgress,
): FaceSearchStatus | null {
  switch (progress.status) {
    case 'requesting-permission':
      return 'requesting-permission';
    case 'indexing':
      return 'indexing';
    case 'cancelled':
      return 'cancelled';
    case 'error':
      return 'error';
    case 'completed':
      return 'ready';
    default:
      return null;
  }
}

export function useFaceSearch(): UseFaceSearchResult {
  const [status, setStatus] = useState<FaceSearchStatus>('idle');
  const [progress, setProgress] = useState<FaceIndexProgress>(initialProgress);
  const [results, setResults] = useState<FaceSearchResult[]>([]);
  const [summary, setSummary] = useState<FaceSearchSummary | null>(null);
  const [storedIndexStats, setStoredIndexStats] =
    useState<StoredIndexStats>(initialStoredIndexStats);
  const [error, setError] = useState<FaceRecognitionError | null>(null);
  const mountedRef = useRef(true);
  const initializationPromiseRef = useRef<Promise<void> | null>(null);
  const faceSearchModuleRef = useRef<FaceSearchModule | null>(null);
  const faceSearchModulePromiseRef = useRef<Promise<FaceSearchModule> | null>(null);
  const indexTaskRef = useRef<GalleryIndexTask | null>(null);
  const indexPromiseRef = useRef<Promise<GalleryIndexResult | null> | null>(null);
  const activeOperationRef = useRef<Promise<unknown> | null>(null);

  const getFaceSearchModule = useCallback(async (): Promise<FaceSearchModule> => {
    if (Platform.OS === 'web') {
      throw new FaceRecognitionError(
        'web-unsupported',
        'A busca facial local está disponível somente no APK.',
      );
    }
    if (faceSearchModuleRef.current) {
      return faceSearchModuleRef.current;
    }
    if (!faceSearchModulePromiseRef.current) {
      faceSearchModulePromiseRef.current = import('@/services/faceSearch')
        .then((module) => {
          faceSearchModuleRef.current = module;
          return module;
        })
        .finally(() => {
          faceSearchModulePromiseRef.current = null;
        });
    }
    return faceSearchModulePromiseRef.current;
  }, []);

  const ensureInitialized = useCallback(async (): Promise<void> => {
    if (initializationPromiseRef.current) {
      return initializationPromiseRef.current;
    }

    if (mountedRef.current) {
      setStatus('loading-model');
      setError(null);
    }

    const initialization = getFaceSearchModule()
      .then(async (module) => {
        await module.initializeFaceSearch();
        const nextStats = await module.getStoredIndexStats();
        if (mountedRef.current) {
          setStoredIndexStats(nextStats);
        }
      })
      .then(() => {
        if (mountedRef.current) {
          setStatus('ready');
        }
      })
      .catch((caught) => {
        const nextError = toFaceSearchError(
          caught,
          'Não foi possível preparar a busca facial local.',
        );
        if (mountedRef.current) {
          setError(nextError);
          setStatus('error');
        }
        throw nextError;
      })
      .finally(() => {
        initializationPromiseRef.current = null;
      });

    initializationPromiseRef.current = initialization;
    activeOperationRef.current = initialization;
    void initialization
      .finally(() => {
        if (activeOperationRef.current === initialization) {
          activeOperationRef.current = null;
        }
      })
      .catch(() => undefined);
    return initialization;
  }, [getFaceSearchModule]);

  const handleProgress = useCallback((nextProgress: FaceIndexProgress) => {
    if (!mountedRef.current) {
      return;
    }
    setProgress(nextProgress);
    const nextStatus = statusFromProgress(nextProgress);
    if (nextStatus) {
      setStatus(nextStatus);
    }
    if (nextProgress.error) {
      setError(nextProgress.error);
    }
  }, []);

  const startIndexing = useCallback(async (): Promise<GalleryIndexResult | null> => {
    if (indexPromiseRef.current) {
      return indexPromiseRef.current;
    }

    const indexing = (async () => {
      await ensureInitialized();
      if (!mountedRef.current) {
        return null;
      }

      setError(null);
      setProgress({ ...initialProgress });
      setStatus('requesting-permission');
      const faceSearchModule = await getFaceSearchModule();
      const task = faceSearchModule.startGalleryIndexing({
        onProgress: handleProgress,
      });
      indexTaskRef.current = task;

      try {
        const result = await task.promise;
        if (result.status === 'completed') {
          const nextStats = await faceSearchModule.getStoredIndexStats();
          if (mountedRef.current) {
            setStoredIndexStats(nextStats);
          }
        }
        if (mountedRef.current) {
          setStatus(result.status === 'completed' ? 'ready' : 'cancelled');
        }
        return result;
      } catch (caught) {
        const nextError = toFaceSearchError(
          caught,
          'Não foi possível indexar a galeria local.',
        );
        if (mountedRef.current) {
          setError(nextError);
          setStatus('error');
        }
        throw nextError;
      } finally {
        if (indexTaskRef.current === task) {
          indexTaskRef.current = null;
        }
      }
    })();

    indexPromiseRef.current = indexing;
    activeOperationRef.current = indexing;
    void indexing
      .finally(() => {
        if (indexPromiseRef.current === indexing) {
          indexPromiseRef.current = null;
        }
        if (activeOperationRef.current === indexing) {
          activeOperationRef.current = null;
        }
      })
      .catch(() => undefined);
    return indexing;
  }, [ensureInitialized, getFaceSearchModule, handleProgress]);

  const cancelIndexing = useCallback(() => {
    if (!indexTaskRef.current) {
      return;
    }
    if (mountedRef.current) {
      setStatus('indexing');
    }
    indexTaskRef.current.cancel();
  }, []);

  const clearIndex = useCallback(async (): Promise<void> => {
    const faceSearchModule = await getFaceSearchModule();
    await faceSearchModule.clearStoredIndex();
    if (mountedRef.current) {
      setStoredIndexStats(initialStoredIndexStats);
      setProgress({ ...initialProgress });
      setSummary(null);
      setResults([]);
      setError(null);
      setStatus('ready');
    }
  }, [getFaceSearchModule]);

  const search = useCallback(
    async (alignedFace: AlignedFace | null): Promise<FaceSearchSummary | null> => {
      if (!alignedFace || !alignedFace.standardized) {
        const nextError = new FaceRecognitionError(
          'invalid-input',
          'Selecione e aprove um rosto antes de iniciar a busca.',
        );
        if (mountedRef.current) {
          setError(nextError);
          setStatus('error');
        }
        return null;
      }

      const searching = (async () => {
        await ensureInitialized();
        const activeIndexing = indexPromiseRef.current;
        if (activeIndexing) {
          const indexResult = await activeIndexing;
          if (!indexResult || indexResult.status !== 'completed') {
            return null;
          }
        }
        if (mountedRef.current) {
          setError(null);
          setStatus('searching');
        }

        const faceSearchModule = await getFaceSearchModule();
        const nextSummary = await faceSearchModule.searchFace(alignedFace);
        if (mountedRef.current) {
          setSummary(nextSummary);
          setResults(nextSummary.results);
          setStatus(nextSummary.results.length > 0 ? 'completed' : 'empty');
        }
        return nextSummary;
      })().catch((caught) => {
        const nextError = toFaceSearchError(
          caught,
          'Não foi possível buscar correspondências no índice local.',
        );
        if (mountedRef.current) {
          setError(nextError);
          setStatus('error');
        }
        throw nextError;
      });

      activeOperationRef.current = searching;
      void searching
        .finally(() => {
          if (activeOperationRef.current === searching) {
            activeOperationRef.current = null;
          }
        })
        .catch(() => undefined);
      return searching;
    },
    [ensureInitialized, getFaceSearchModule],
  );

  const indexAndSearch = useCallback(
    async (alignedFace: AlignedFace | null): Promise<FaceSearchSummary | null> => {
      const indexResult = await startIndexing();
      if (!indexResult || indexResult.status !== 'completed') {
        return null;
      }
      return search(alignedFace);
    },
    [search, startIndexing],
  );

  useEffect(() => {
    mountedRef.current = true;
    void ensureInitialized().catch(() => undefined);

    return () => {
      mountedRef.current = false;
      indexTaskRef.current?.cancel();
      const pendingOperation = activeOperationRef.current;
      const releaseResources = () => {
        if (faceSearchModuleRef.current) {
          void faceSearchModuleRef.current.disposeFaceSearch();
        }
      };
      if (pendingOperation) {
        void pendingOperation.catch(() => undefined).then(releaseResources);
      } else {
        releaseResources();
      }
    };
  }, [ensureInitialized]);

  return {
    status,
    progress,
    results,
    summary,
    storedIndexStats,
    error,
    startIndexing,
    cancelIndexing,
    clearIndex,
    search,
    indexAndSearch,
  };
}