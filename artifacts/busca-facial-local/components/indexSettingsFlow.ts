export const INDEX_SETTINGS_TEST_IDS = {
  close: 'close-index-settings',
  clear: 'clear-local-index',
} as const;

export interface IndexClearAlertOption {
  text: string;
  style?: 'cancel' | 'destructive';
  onPress?: () => void;
}

export const INDEX_CLEAR_ALERT_TITLE = 'Limpar índice local?';
export const INDEX_CLEAR_ALERT_MESSAGE =
  'Isso apagará as fotos e rostos processados do índice deste aparelho. As fotos originais da sua galeria não serão apagadas.';

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