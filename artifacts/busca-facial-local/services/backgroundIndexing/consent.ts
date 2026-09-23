import AsyncStorage from '@react-native-async-storage/async-storage';

const BACKGROUND_INDEX_CONSENT_KEY = 'visage.background-index.consent';

export const BACKGROUND_INDEX_DECLINED_MESSAGE =
  'Sua busca não será otimizada, você poderá ativar o índice manualmente em seus filtros.';

export type BackgroundIndexConsentStatus =
  | 'unknown'
  | 'accepted'
  | 'declined';

function isConsentStatus(value: string | null): value is Exclude<BackgroundIndexConsentStatus, 'unknown'> {
  return value === 'accepted' || value === 'declined';
}

export async function getBackgroundIndexConsent(): Promise<BackgroundIndexConsentStatus> {
  const stored = await AsyncStorage.getItem(BACKGROUND_INDEX_CONSENT_KEY);
  return isConsentStatus(stored) ? stored : 'unknown';
}

export async function setBackgroundIndexConsent(
  status: Exclude<BackgroundIndexConsentStatus, 'unknown'>,
): Promise<void> {
  await AsyncStorage.setItem(BACKGROUND_INDEX_CONSENT_KEY, status);
}