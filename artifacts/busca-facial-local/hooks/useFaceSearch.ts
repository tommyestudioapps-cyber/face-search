import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import type { AlignedFace } from '@/services/faceCapture';
import {
  FaceRecognitionError,
  type FaceIndexProgress,
  type FaceSearchResult,
  type FaceSearchSummary,
  type IndexedPhoto,
  type StoredIndexStats,
} from '@/services/faceSearch/types';
import type {
  GalleryIndexResult,
  GalleryIndexTask,
} from '@/services/faceSearch/galleryIndexer';
import { FaceSearchOperationGate } from './faceSearchOperationGate';

type FaceSearchModule = typeof import('@/services/faceSearch');

export type FaceSearchOperation =
  | 'idle'
  | 'initializing'
  | 'indexing'
  | 'searching'
  | 'clearing';

export type FaceSearchClearState = 'idle' | 'waiting' | 'clearing';

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
  operation: FaceSearchOperation;
  isOperationActive: boolean;
  clearState: FaceSearchClearState;
  progress: FaceIndexProgress;
  results: FaceSearchResult[];
  summary: FaceSearchSummary | null;
  storedIndexStats: StoredIndexStats;
  indexedPhotos: IndexedPhoto[];
  isLoadingIndexedPhotos: boolean;
  refreshIndexedPhotos: () => Promise<void>;
  error: FaceRecognitionError | null;
  setActiveAlignedFace: (face: AlignedFace | null) => void;
  rehydrateSession: (alignedFace: AlignedFace) => Promise<void>;
  startIndexing: (
    albumId?: string | null,
  ) => Promise<GalleryIndexResult | null>;
  cancelIndexing: () => void;
  clearIndex: () => Promise<void>;
  search: (alignedFace: AlignedFace | null) => Promise<FaceSearchSummary | null>;
  indexAndSearch: (
    alignedFace: AlignedFace | null,
    albumId?: string | null,
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
  const [operation, setOperation] = useState<FaceSearchOperation>('idle');
  const [clearState, setClearState] = useState<FaceSearchClearState>('idle');
  const [progress, setProgress] = useState<FaceIndexProgress>(initialProgress);
  const [results, setResults] = useState<FaceSearchResult[]>([]);
  const [summary, setSummary] = useState<FaceSearchSummary | null>(null);
  const [storedIndexStats, setStoredIndexStats] =
    useState<StoredIndexStats>(initialStoredIndexStats);
  const [indexedPhotos, setIndexedPhotos] = useState<IndexedPhoto[]>([]);
  const [isLoadingIndexedPhotos, setIsLoadingIndexedPhotos] = useState(false);
  const [error, setError] = useState<FaceRecognitionError | null>(null);
  const mountedRef = useRef(true);
  const activeAlignedFaceRef = useRef<AlignedFace | null>(null);
  const initializationPromiseRef = useRef<Promise<void> | null>(null);
  const faceSearchModuleRef = useRef<FaceSearchModule | null>(null);
  const faceSearchModulePromiseRef = useRef<Promise<FaceSearchModule> | null>(null);
  const indexTaskRef = useRef<GalleryIndexTask | null>(null);
  const indexPromiseRef = useRef<Promise<GalleryIndexResult | null> | null>(null);
  const searchPromiseRef = useRef<Promise<FaceSearchSummary | null> | null>(null);
  const clearPromiseRef = useRef<Promise<void> | null>(null);
  const refreshPromiseRef = useRef<Promise<void> | null>(null);
  const operationGateRef = useRef(new FaceSearchOperationGate());

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

  const setActiveAlignedFace = useCallback((face: AlignedFace | null) => {
    activeAlignedFaceRef.current = face;
  }, []);

  const rehydrateSession = useCallback(async (alignedFace: AlignedFace) => {
    activeAlignedFaceRef.current = alignedFace;
    try {
      await ensureInitialized();
      const faceSearchModule = await getFaceSearchModule();
      const nextSummary = await faceSearchModule.searchFace(alignedFace);
      if (mountedRef.current) {
        setSummary(nextSummary);
        setResults(nextSummary.results);
        if (__DEV__) {
          console.log(
            `[Rehydrate] resultados=${nextSummary.results.length}`,
          );
        }
      }
    } catch (error) {
      if (__DEV__) {
        console.log('[Rehydrate] falhou', error);
      }
    }
  }, [ensureInitialized, getFaceSearchModule]);

  const startIndexing = useCallback(async (
    albumId?: string | null,
  ): Promise<GalleryIndexResult | null> => {
    if (indexPromiseRef.current) {
      return indexPromiseRef.current;
    }

    const indexing = operationGateRef.current.run(async () => {
      if (mountedRef.current) {
        setOperation('indexing');
      }
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
        albumId: albumId ?? null,
      });
      indexTaskRef.current = task;

      try {
        const result = await task.promise;
        const nextStats = await faceSearchModule.getStoredIndexStats();
        if (mountedRef.current) {
          setStoredIndexStats(nextStats);
          setStatus(result.status === 'completed' ? 'ready' : 'cancelled');
          if (__DEV__) {
            console.log(
              `[Stats] pós-indexação status=${result.status} fotos=${nextStats.indexedPhotos} rostos=${nextStats.indexedFaces}`,
            );
          }
        }
        const activeFace = activeAlignedFaceRef.current;
        if (activeFace && activeFace.standardized) {
          if (__DEV__) {
            console.log('[Search] rodando search pós-indexação');
          }
          try {
            const nextSummary = await faceSearchModule.searchFace(activeFace);
            if (mountedRef.current) {
              setSummary(nextSummary);
              setResults(nextSummary.results);
              if (__DEV__) {
                console.log(
                  `[Search] resultados=${nextSummary.results.length}`,
                );
              }
            }
          } catch (searchError) {
            if (__DEV__) {
              console.log('[Search] falhou pós-indexação', searchError);
            }
          }
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
    });

    indexPromiseRef.current = indexing;
    void indexing
      .finally(() => {
        if (indexPromiseRef.current === indexing) {
          indexPromiseRef.current = null;
        }
        if (mountedRef.current) {
          setOperation((current) => (current === 'indexing' ? 'idle' : current));
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

  const clearIndex = useCallback((): Promise<void> => {
    if (clearPromiseRef.current) {
      return clearPromiseRef.current;
    }

    if (operationGateRef.current.isBusy() && mountedRef.current) {
      setClearState('waiting');
    }

    const clearing = operationGateRef.current.clear(async () => {
      if (mountedRef.current) {
        setClearState('clearing');
        setOperation('clearing');
      }
      const faceSearchModule = await getFaceSearchModule();
      await faceSearchModule.clearStoredIndex();
      if (mountedRef.current) {
        setStoredIndexStats(initialStoredIndexStats);
        setProgress({ ...initialProgress });
        setSummary(null);
        setResults([]);
        setIndexedPhotos([]);
        setError(null);
        setStatus('ready');
      }
    });

    clearPromiseRef.current = clearing;
    void clearing
      .finally(() => {
        if (clearPromiseRef.current === clearing) {
          clearPromiseRef.current = null;
        }
        if (mountedRef.current) {
          setClearState('idle');
          setOperation((current) => (current === 'clearing' ? 'idle' : current));
        }
      })
      .catch(() => undefined);
    return clearing;
  }, [getFaceSearchModule]);

  const refreshIndexedPhotos = useCallback((): Promise<void> => {
    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current;
    }

    const loading = (async () => {
      if (mountedRef.current) {
        setIsLoadingIndexedPhotos(true);
      }
      try {
        const faceSearchModule = await getFaceSearchModule();
        const [photos, nextStats] = await Promise.all([
          faceSearchModule.readIndexedPhotosWithFaceCounts(),
          faceSearchModule.getStoredIndexStats(),
        ]);
        if (mountedRef.current) {
          setIndexedPhotos(photos);
          setStoredIndexStats(nextStats);
        }
      } catch (caught) {
        const nextError = toFaceSearchError(
          caught,
          'Não foi possível carregar as fotos indexadas.',
        );
        if (mountedRef.current) {
          setError(nextError);
        }
      } finally {
        if (mountedRef.current) {
          setIsLoadingIndexedPhotos(false);
        }
      }
    })();

    refreshPromiseRef.current = loading;
    void loading
      .finally(() => {
        if (refreshPromiseRef.current === loading) {
          refreshPromiseRef.current = null;
        }
      })
      .catch(() => undefined);
    return loading;
  }, [getFaceSearchModule]);

  const search = useCallback(
    async (alignedFace: AlignedFace | null): Promise<FaceSearchSummary | null> => {
      if (searchPromiseRef.current) {
        return searchPromiseRef.current;
      }
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

      const searching = operationGateRef.current.run(async () => {
        if (mountedRef.current) {
          setOperation('searching');
        }
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
      }).catch((caught) => {
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

      searchPromiseRef.current = searching;
      void searching
        .finally(() => {
          if (searchPromiseRef.current === searching) {
            searchPromiseRef.current = null;
          }
          if (mountedRef.current) {
            setOperation((current) => (current === 'searching' ? 'idle' : current));
          }
        })
        .catch(() => undefined);
      return searching;
    },
    [ensureInitialized, getFaceSearchModule],
  );

  const indexAndSearch = useCallback(
    async (
      alignedFace: AlignedFace | null,
      albumId?: string | null,
    ): Promise<FaceSearchSummary | null> => {
      const indexResult = await startIndexing(albumId);
      if (!indexResult || indexResult.status !== 'completed') {
        return null;
      }
      return search(alignedFace);
    },
    [search, startIndexing],
  );

  useEffect(() => {
    mountedRef.current = true;
    const initialization = operationGateRef.current.run(async () => {
      if (mountedRef.current) {
        setOperation('initializing');
      }
      return ensureInitialized();
    });
    void initialization
      .finally(() => {
        if (mountedRef.current) {
          setOperation((current) => (current === 'initializing' ? 'idle' : current));
        }
      })
      .catch(() => undefined);

    return () => {
      mountedRef.current = false;
      indexTaskRef.current?.cancel();
      const pendingOperation = operationGateRef.current.getActiveOperation();
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
    operation,
    isOperationActive: operation !== 'idle',
    clearState,
    progress,
    results,
    summary,
    storedIndexStats,
    indexedPhotos,
    isLoadingIndexedPhotos,
    refreshIndexedPhotos,
    error,
    setActiveAlignedFace,
    rehydrateSession,
    startIndexing,
    cancelIndexing,
    clearIndex,
    search,
    indexAndSearch,
  };
}