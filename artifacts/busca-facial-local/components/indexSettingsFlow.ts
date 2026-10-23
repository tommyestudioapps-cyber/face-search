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

export const INDEX_CLEAR_ALERT_TITLE = 'Limpar catálogo local?';
export const INDEX_CLEAR_ALERT_MESSAGE =
  'Isso apagará as fotos e rostos processados do catálogo deste aparelho. As fotos originais da sua galeria não serão apagadas.';
export const INDEX_CLEAR_ERROR_MESSAGE = 'Não foi possível limpar o catálogo local.';

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

export interface OemBatteryGuidance {
  family: 'oplus' | 'xiaomi' | 'samsung' | 'huawei' | 'generic';
  oemLabel: string;
  steps: string[];
}

export function getOemBatteryGuidance(
  manufacturer?: string | null,
  brand?: string | null,
): OemBatteryGuidance {
  const combined = `${manufacturer ?? ''} ${brand ?? ''}`.toLowerCase();

  if (
    combined.includes('oppo') ||
    combined.includes('realme') ||
    combined.includes('oneplus') ||
    combined.includes('oplus')
  ) {
    return {
      family: 'oplus',
      oemLabel: 'OPPO / Realme / OnePlus (ColorOS)',
      steps: [
        'Toque em "Liberar execução em 2º plano" abaixo e confirme "Permitir".',
        'Em Configurações do app → Uso da bateria, ative "Permitir atividade em segundo plano" e "Inicialização automática".',
        'Para galerias muito grandes, mantenha o aparelho conectado ao carregador ou com o app aberto.',
      ],
    };
  }

  if (
    combined.includes('xiaomi') ||
    combined.includes('redmi') ||
    combined.includes('poco')
  ) {
    return {
      family: 'xiaomi',
      oemLabel: 'Xiaomi / Redmi / POCO (MIUI / HyperOS)',
      steps: [
        'Toque em "Liberar execução em 2º plano" abaixo e selecione "Nenhuma restrição".',
        'Em Configurações do app, ative "Início automático" (Autostart) para evitar congelamento com a tela apagada.',
      ],
    };
  }

  if (combined.includes('samsung')) {
    return {
      family: 'samsung',
      oemLabel: 'Samsung (One UI)',
      steps: [
        'Toque em "Liberar execução em 2º plano" abaixo para desativar a otimização.',
        'Em Configurações do app → Bateria, mantenha a opção "Não restrito" selecionada.',
      ],
    };
  }

  if (combined.includes('huawei') || combined.includes('honor')) {
    return {
      family: 'huawei',
      oemLabel: 'Huawei / Honor',
      steps: [
        'Toque em "Liberar execução em 2º plano" abaixo.',
        'Em Configurações → Bateria → Inicialização de aplicativos, desative o gerenciamento automático deste app.',
      ],
    };
  }

  return {
    family: 'generic',
    oemLabel: 'Android',
    steps: [
      'Toque em "Liberar execução em 2º plano" abaixo para permitir que o preparo do índice continue com a tela apagada.',
    ],
  };
}