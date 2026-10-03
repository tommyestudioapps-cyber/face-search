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
  slots: PersistedFaceSlot[];
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
  slots: PersistedFaceSlot[],
): Promise<void> {
  if (slots.length === 0) {
    await clearPersistedSession();
    return;
  }

  try {
    const previousSlots = await loadFaceSlots();
    getSessionDirectory().create({ idempotent: true });

    const persistedSlots: PersistedFaceSlot[] = [];
    for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
      const slot = slots[slotIndex];
      persistedSlots.push({
        ...slot,
        alignedFace: copyAlignedFaceToSlot(slot.alignedFace, slotIndex),
      });
    }

    const persisted: PersistedSessionMulti = {
      slots: persistedSlots,
      savedAt: Date.now(),
    };
    await AsyncStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(persisted));

    for (
      let slotIndex = slots.length;
      slotIndex < previousSlots.length;
      slotIndex += 1
    ) {
      removeFileIfExists(getSlotFile(slotIndex));
    }
    removeFileIfExists(getLegacySessionFile());
  } catch (error) {
    logPersistenceFailure('persistir', error);
  }
}

export async function loadFaceSlots(): Promise<PersistedFaceSlot[]> {
  try {
    const serialized = await AsyncStorage.getItem(SESSION_STORAGE_KEY);
    if (!serialized) {
      return [];
    }

    const parsed: unknown = JSON.parse(serialized);
    if (!isRecord(parsed)) {
      await AsyncStorage.removeItem(SESSION_STORAGE_KEY);
      return [];
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
        ],
        savedAt:
          typeof legacySession.savedAt === 'number' &&
          Number.isFinite(legacySession.savedAt)
            ? legacySession.savedAt
            : Date.now(),
      };
      await AsyncStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(persisted));
    } else if (Array.isArray(parsed.slots)) {
      persisted = parsed as unknown as PersistedSessionMulti;
    } else {
      await AsyncStorage.removeItem(SESSION_STORAGE_KEY);
      return [];
    }

    const existingSlots = persisted.slots
      .map((slot, slotIndex) => ({ slot, slotIndex }))
      .filter(({ slotIndex }) => getSlotFile(slotIndex).exists);

    if (existingSlots.length === persisted.slots.length) {
      return persisted.slots;
    }

    const validSlots: PersistedFaceSlot[] = [];
    for (
      let slotIndex = 0;
      slotIndex < existingSlots.length;
      slotIndex += 1
    ) {
      const { slot, slotIndex: originalIndex } = existingSlots[slotIndex];
      if (originalIndex === slotIndex) {
        validSlots.push(slot);
        continue;
      }

      const sourceFile = getSlotFile(originalIndex);
      const destination = getSlotFile(slotIndex);
      removeFileIfExists(destination);
      sourceFile.copy(destination);
      sourceFile.delete();
      validSlots.push({
        ...slot,
        alignedFace: {
          ...slot.alignedFace,
          uri: destination.uri,
        },
      });
    }

    const cleanedPersisted: PersistedSessionMulti = {
      slots: validSlots,
      savedAt: persisted.savedAt,
    };
    await AsyncStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify(cleanedPersisted),
    );
    return validSlots;
  } catch (error) {
    logPersistenceFailure('carregar', error);
    try {
      await AsyncStorage.removeItem(SESSION_STORAGE_KEY);
    } catch (cleanupError) {
      logPersistenceFailure('limpar sessão inválida', cleanupError);
    }
    return [];
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
  return persistFaceSlots([{ alignedFace, sourceUri }]);
}

export async function loadPersistedSession(): Promise<PersistedSession | null> {
  const slots = await loadFaceSlots();
  if (slots.length === 0) {
    return null;
  }
  const first = slots[0];
  return {
    alignedFace: first.alignedFace,
    sourceUri: first.sourceUri,
    savedAt: Date.now(),
  };
}

export async function clearPersistedSession(): Promise<void> {
  return clearPersistedSessions();
}