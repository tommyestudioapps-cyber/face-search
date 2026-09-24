import { Platform } from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import { FaceRecognitionError } from '@/services/faceSearch/types';

export async function hasGalleryPhotoPermission(): Promise<boolean> {
  if (Platform.OS === 'web') {
    return false;
  }

  const available = await MediaLibrary.isAvailableAsync();
  if (!available) {
    return false;
  }

  const permission = await MediaLibrary.getPermissionsAsync(false, ['photo']);
  return permission.granted && permission.accessPrivileges !== 'none';
}

export async function hasFullGalleryPhotoPermission(): Promise<boolean> {
  if (!(await hasGalleryPhotoPermission())) return false;
  const permission = await MediaLibrary.getPermissionsAsync(false, ['photo']);
  return permission.granted && permission.accessPrivileges === 'all';
}

export async function logGalleryPermissionState(context: string): Promise<void> {
  if (!__DEV__) return;
  try {
    const permission = await MediaLibrary.getPermissionsAsync(false, ['photo']);
    console.log(
      `[Perm:diag] ctx=${context} granted=${permission.granted} privileges=${permission.accessPrivileges} status=${permission.status} canAskAgain=${permission.canAskAgain}`,
    );
  } catch (error) {
    console.log(`[Perm:diag] ctx=${context} error=${String(error)}`);
  }
}

export async function requestGalleryPhotoPermission(): Promise<void> {
  if (Platform.OS === 'web') {
    throw new FaceRecognitionError(
      'web-unsupported',
      'A preparação do índice local está disponível somente no APK.',
    );
  }

  const available = await MediaLibrary.isAvailableAsync();
  if (!available) {
    throw new FaceRecognitionError(
      'permission-denied',
      'A galeria de fotos não está disponível neste dispositivo.',
    );
  }

  let permission = await MediaLibrary.getPermissionsAsync(false, ['photo']);
  if (!permission.granted || permission.accessPrivileges === 'none') {
    permission = await MediaLibrary.requestPermissionsAsync(false, ['photo']);
  }

  if (!permission.granted || permission.accessPrivileges === 'none') {
    throw new FaceRecognitionError(
      'permission-denied',
      'A permissão para ler a galeria de fotos foi negada.',
    );
  }
}