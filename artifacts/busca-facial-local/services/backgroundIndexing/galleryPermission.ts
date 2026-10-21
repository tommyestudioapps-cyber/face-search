import { Platform } from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import { FaceRecognitionError } from '@/services/faceSearch/types';
import { WakeLock } from '@/modules/wake-lock';

export async function hasGalleryPhotoPermission(): Promise<boolean> {
  if (Platform.OS === 'web') {
    return false;
  }

  // No Android, consulta direto o PackageManager via ApplicationContext.
  // Evita falso negativo quando o app roda em segundo plano sem Activity (tela destruída).
  if (Platform.OS === 'android') {
    const nativeCheck = WakeLock.hasAnyGalleryPermission();
    if (typeof nativeCheck === 'boolean') {
      return nativeCheck;
    }
  }

  const available = await MediaLibrary.isAvailableAsync();
  if (!available) {
    console.warn('[A14Diag] perm: not available');
    return false;
  }

  try {
    const permission = await MediaLibrary.getPermissionsAsync(false, ['photo']);
    const result = permission.granted && permission.accessPrivileges !== 'none';
    console.warn(
      `[A14Diag] perm: granted=${permission.granted} accessPrivileges=${permission.accessPrivileges} status=${permission.status} → result=${result}`,
    );
    return result;
  } catch (error) {
    console.warn('[A14Diag] perm: expo getPermissionsAsync falhou; usando fallback nativo', error);
    const nativeCheck = WakeLock.hasAnyGalleryPermission();
    return nativeCheck ?? false;
  }
}

export async function hasFullGalleryPhotoPermission(): Promise<boolean> {
  if (Platform.OS === 'web') {
    return false;
  }

  // No Android, consulta direto o PackageManager via ApplicationContext.
  // Garante que o serviço continue rodando após remoção dos Recentes.
  if (Platform.OS === 'android') {
    const nativeCheck = WakeLock.hasFullGalleryPermission();
    if (typeof nativeCheck === 'boolean') {
      return nativeCheck;
    }
  }

  if (!(await hasGalleryPhotoPermission())) {
    console.warn('[A14Diag] fullPerm: partial negou, retornando false');
    return false;
  }
  try {
    const permission = await MediaLibrary.getPermissionsAsync(false, ['photo']);
    const result = permission.granted && permission.accessPrivileges === 'all';
    console.warn(
      `[A14Diag] fullPerm: granted=${permission.granted} accessPrivileges=${permission.accessPrivileges} → result=${result}`,
    );
    return result;
  } catch (error) {
    console.warn('[A14Diag] fullPerm: expo getPermissionsAsync falhou; usando fallback nativo', error);
    const nativeCheck = WakeLock.hasFullGalleryPermission();
    return nativeCheck ?? false;
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