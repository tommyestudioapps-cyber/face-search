import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import type { AlignedFace } from './types';

const SESSION_STORAGE_KEY = 'visage.session';
const SESSION_DIRECTORY_NAME = 'visage-session';
const SESSION_FILE_NAME = 'face.jpg';

export interface PersistedSession {
  alignedFace: AlignedFace;
  sourceUri: string;
  savedAt: number;
}

function getSessionFile(): File {
  return new File(
    new Directory(Paths.document, SESSION_DIRECTORY_NAME),
    SESSION_FILE_NAME,
  );
}

function logPersistenceFailure(action: string, error: unknown): void {
  if (__DEV__) {
    console.log(`[Session] ${action} falhou`, error);
  }
}

export async function persistSession(
  alignedFace: AlignedFace,
  sourceUri: string,
): Promise<void> {
  try {
    const directory = new Directory(Paths.document, SESSION_DIRECTORY_NAME);
    directory.create({ idempotent: true });

    const destination = new File(directory, SESSION_FILE_NAME);
    if (destination.exists) {
      destination.delete();
    }

    new File(alignedFace.uri).copy(destination);

    const persisted: PersistedSession = {
      alignedFace: {
        ...alignedFace,
        uri: destination.uri,
      },
      sourceUri,
      savedAt: Date.now(),
    };
    await AsyncStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(persisted));
  } catch (error) {
    logPersistenceFailure('persistir', error);
  }
}

export async function loadPersistedSession(): Promise<PersistedSession | null> {
  try {
    const serialized = await AsyncStorage.getItem(SESSION_STORAGE_KEY);
    if (!serialized) {
      return null;
    }

    const session = JSON.parse(serialized) as PersistedSession;
    const sessionFile = getSessionFile();
    if (!sessionFile.exists) {
      await AsyncStorage.removeItem(SESSION_STORAGE_KEY);
      return null;
    }

    return session;
  } catch (error) {
    logPersistenceFailure('carregar', error);
    try {
      await AsyncStorage.removeItem(SESSION_STORAGE_KEY);
    } catch (cleanupError) {
      logPersistenceFailure('limpar sessão inválida', cleanupError);
    }
    return null;
  }
}

export async function clearPersistedSession(): Promise<void> {
  try {
    const sessionFile = getSessionFile();
    if (sessionFile.exists) {
      sessionFile.delete();
    }
    await AsyncStorage.removeItem(SESSION_STORAGE_KEY);
  } catch (error) {
    logPersistenceFailure('limpar', error);
  }
}