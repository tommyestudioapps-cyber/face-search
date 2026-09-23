export const INDEX_SETTINGS_TEST_IDS = {
  close: 'close-index-settings',
  clear: 'clear-local-index',
  backgroundIndexToggle: 'background-index-toggle',
  backgroundIndexPause: 'background-index-pause',
  backgroundIndexPrepare: 'background-index-prepare',
} as const;

export interface IndexClearAlertOption {
  text: string;
  style?: 'cancel' | 'destructive';
  onPress?: () => void;
}

export const INDEX_CLEAR_ALERT_TITLE = 'Limpar índice local?';
export const INDEX_CLEAR_ALERT_MESSAGE =
  'Isso apagará as fotos e rostos processados do índice deste aparelho. As fotos originais da sua galeria não serão apagadas.';
export const INDEX_CLEAR_ERROR_MESSAGE = 'Não foi possível limpar o índice local.';

export interface IndexClearFeedbackCallbacks {
  onStart: () => void;
  onError: (message: string) => void;
  onFinish: () => void;
}

export async function clearIndexWithFeedback(
  onClearIndex: () => Promise<void>,
  callbacks: IndexClearFeedbackCallbacks,
): Promise<void> {
  callbacks.onStart();
  try {
    await onClearIndex();
  } catch {
    callbacks.onError(INDEX_CLEAR_ERROR_MESSAGE);
  } finally {
    callbacks.onFinish();
  }
}

export function createIndexClearAlertOptions(
  onConfirm: () => void,
): IndexClearAlertOption[] {
  return [
    {
      text: 'Cancelar',
      style: 'cancel',
    },
    {
      text: 'Limpar índice',
      style: 'destructive',
      onPress: onConfirm,
    },
  ];
}