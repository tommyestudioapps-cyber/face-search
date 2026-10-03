import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import type { AlignedFace } from './types';

const SESSION_STORAGE_KEY = 'visage.session';
const SESSION_DIRECTORY_NAME = 'visage-session';
const LEGACY_SESSION_FILE_NAME = 'face.jpg';

export interface PersistedSession {
  alignedFace: AlignedFace;
  sourceUri: string;
  savedAt: number;
}

export interface PersistedFaceSlot {
  alignedFace: AlignedFace;
  sourceUri: string;
}

export interface PersistedSessionMulti {
  slots: (PersistedFaceSlot | null)[];
  savedAt: number;
}

function getSessionDirectory(): Directory {
  return new Directory(Paths.document, SESSION_DIRECTORY_NAME);
}

function getLegacySessionFile(): File {
  return new File(
    getSessionDirectory(),
    LEGACY_SESSION_FILE_NAME,
  );
}

function getSlotFile(slotIndex: number): File {
  return new File(getSessionDirectory(), `face-${slotIndex}.jpg`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function logPersistenceFailure(action: string, error: unknown): void {
  if (__DEV__) {
    console.log(`[Session] ${action} falhou`, error);
  }
}

function copyAlignedFaceToSlot(
  alignedFace: AlignedFace,
  slotIndex: number,
): AlignedFace {
  const source = new File(alignedFace.uri);
  const destination = getSlotFile(slotIndex);
  if (source.uri !== destination.uri) {
    if (destination.exists) {
      destination.delete();
    }
    source.copy(destination);
  }
  return {
    ...alignedFace,
    uri: destination.uri,
  };
}

function removeFileIfExists(file: File): void {
  if (file.exists) {
    file.delete();
  }
}

export async function persistFaceSlots(
  slots: (PersistedFaceSlot | null)[],
): Promise<void> {
  const slotsToPersist: (PersistedFaceSlot | null)[] = [
    slots[0] ?? null,
    slots[1] ?? null,
  ];

  if (slotsToPersist.every((slot) => slot === null)) {
    await clearPersistedSessions();
    return;
  }

  try {
    getSessionDirectory().create({ idempotent: true });

    const persistedSlots: (PersistedFaceSlot | null)[] = [null, null];
    for (let slotIndex = 0; slotIndex < 2; slotIndex += 1) {
      const slot = slotsToPersist[slotIndex];
      if (slot === null) {
        removeFileIfExists(getSlotFile(slotIndex));
        continue;
      }
      persistedSlots[slotIndex] = {
        ...slot,
        alignedFace: copyAlignedFaceToSlot(slot.alignedFace, slotIndex),
      };
    }

    const persisted: PersistedSessionMulti = {
      slots: persistedSlots,
      savedAt: Date.now(),
    };
    await AsyncStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(persisted));
    removeFileIfExists(getLegacySessionFile());
  } catch (error) {
    logPersistenceFailure('persistir', error);
  }
}

export async function loadFaceSlots(): Promise<(PersistedFaceSlot | null)[]> {
  try {
    const serialized = await AsyncStorage.getItem(SESSION_STORAGE_KEY);
    if (!serialized) {
      return [null, null];
    }

    const parsed: unknown = JSON.parse(serialized);
    if (!isRecord(parsed)) {
      await AsyncStorage.removeItem(SESSION_STORAGE_KEY);
      return [null, null];
    }

    let persisted: PersistedSessionMulti;
    if ('alignedFace' in parsed) {
      const legacySession = parsed as unknown as PersistedSession;
      const legacyFile = getLegacySessionFile();
      const slotFile = getSlotFile(0);
      if (legacyFile.exists) {
        removeFileIfExists(slotFile);
        legacyFile.copy(slotFile);
        legacyFile.delete();
      }

      persisted = {
        slots: [
          {
            alignedFace: {
              ...legacySession.alignedFace,
              uri: slotFile.uri,
            },
            sourceUri: legacySession.sourceUri,
          },
          null,
        ],
        savedAt:
          typeof legacySession.savedAt === 'number' &&
          Number.isFinite(legacySession.savedAt)
            ? legacySession.savedAt
            : Date.now(),
      };
      await AsyncStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(persisted));
      return persisted.slots;
    }

    if (!Array.isArray(parsed.slots)) {
      await AsyncStorage.removeItem(SESSION_STORAGE_KEY);
      return [null, null];
    }

    persisted = parsed as unknown as PersistedSessionMulti;
    const storedSlots = persisted.slots;
    const slots: (PersistedFaceSlot | null)[] = [
      storedSlots[0] ?? null,
      storedSlots[1] ?? null,
    ];
    let needsSave = storedSlots.length !== 2;

    for (let slotIndex = 0; slotIndex < 2; slotIndex += 1) {
      const slotFile = getSlotFile(slotIndex);
      if (slots[slotIndex] === null) {
        if (slotFile.exists) {
          removeFileIfExists(slotFile);
          needsSave = true;
        }
        continue;
      }
      if (!slotFile.exists) {
        slots[slotIndex] = null;
        needsSave = true;
      }
    }

    if (needsSave) {
      const cleanedPersisted: PersistedSessionMulti = {
        slots,
        savedAt: persisted.savedAt,
      };
      await AsyncStorage.setItem(
        SESSION_STORAGE_KEY,
        JSON.stringify(cleanedPersisted),
      );
    }
    return slots;
  } catch (error) {
    logPersistenceFailure('carregar', error);
    try {
      await AsyncStorage.removeItem(SESSION_STORAGE_KEY);
    } catch (cleanupError) {
      logPersistenceFailure('limpar sessão inválida', cleanupError);
    }
    return [null, null];
  }
}

export async function clearPersistedSessions(): Promise<void> {
  for (const file of [
    getSlotFile(0),
    getSlotFile(1),
    getLegacySessionFile(),
  ]) {
    try {
      removeFileIfExists(file);
    } catch (error) {
      logPersistenceFailure('limpar arquivo', error);
    }
  }

  try {
    await AsyncStorage.removeItem(SESSION_STORAGE_KEY);
  } catch (error) {
    logPersistenceFailure('limpar', error);
  }
}

export async function persistSession(
  alignedFace: AlignedFace,
  sourceUri: string,
): Promise<void> {
  return persistFaceSlots([{ alignedFace, sourceUri }, null]);
}

export async function loadPersistedSession(): Promise<PersistedSession | null> {
  const slots = await loadFaceSlots();
  const first = slots[0] ?? slots[1] ?? null;
  if (first === null) {
    return null;
  }
  return {
    alignedFace: first.alignedFace,
    sourceUri: first.sourceUri,
    savedAt: Date.now(),
  };
}

export async function clearPersistedSession(): Promise<void> {
  return clearPersistedSessions();
}