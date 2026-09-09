import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  clearIndexWithFeedback,
  createIndexClearAlertOptions,
  INDEX_CLEAR_ALERT_MESSAGE,
  INDEX_CLEAR_ERROR_MESSAGE,
  INDEX_CLEAR_ALERT_TITLE,
  INDEX_SETTINGS_TEST_IDS,
} from '../indexSettingsFlow.ts';

test('usa os identificadores do painel de configurações no roteiro', () => {
  assert.deepEqual(INDEX_SETTINGS_TEST_IDS, {
    close: 'close-index-settings',
    clear: 'clear-local-index',
  });
  assert.equal(INDEX_CLEAR_ALERT_TITLE, 'Limpar índice local?');
  assert.match(INDEX_CLEAR_ALERT_MESSAGE, /fotos originais.*não serão apagadas/);
});

test('Cancelar não chama a limpeza do índice', () => {
  let clearCalls = 0;
  const [cancel] = createIndexClearAlertOptions(() => {
    clearCalls += 1;
  });

  assert.equal(cancel.text, 'Cancelar');
  assert.equal(cancel.style, 'cancel');
  assert.equal(cancel.onPress, undefined);
  assert.equal(clearCalls, 0);
});

test('Confirmar chama a limpeza uma vez e usa a ação destrutiva', () => {
  let clearCalls = 0;
  const [, confirm] = createIndexClearAlertOptions(() => {
    clearCalls += 1;
  });

  assert.equal(confirm.text, 'Limpar índice');
  assert.equal(confirm.style, 'destructive');
  assert.equal(typeof confirm.onPress, 'function');

  confirm.onPress?.();

  assert.equal(clearCalls, 1);
});

test('falha na limpeza preserva as estatísticas, exibe o alerta e libera nova tentativa', async () => {
  const displayedStats = {
    indexedPhotos: 12,
    indexedFaces: 19,
  };
  const originalStats = { ...displayedStats };
  let isClearing = false;
  let clearError = null;
  let attempts = 0;

  const callbacks = {
    onStart: () => {
      isClearing = true;
      clearError = null;
    },
    onError: (message) => {
      clearError = message;
    },
    onFinish: () => {
      isClearing = false;
    },
  };

  await clearIndexWithFeedback(async () => {
    attempts += 1;
    throw new Error('storage unavailable');
  }, callbacks);

  assert.deepEqual(displayedStats, originalStats);
  assert.equal(clearError, INDEX_CLEAR_ERROR_MESSAGE);
  assert.equal(isClearing, false);

  await clearIndexWithFeedback(async () => {
    attempts += 1;
  }, callbacks);

  assert.equal(attempts, 2);
  assert.equal(clearError, null);
  assert.equal(isClearing, false);
});

test('mensagem de falha é anunciada como alerta acessível e bloqueia apenas durante a limpeza', async () => {
  const componentSource = await readFile(
    new URL('../IndexSettings.tsx', import.meta.url),
    'utf8',
  );

  assert.match(componentSource, /accessibilityRole="alert"/);
  assert.match(componentSource, /accessibilityLiveRegion="polite"/);
  assert.match(componentSource, /disabled=\{clearBlocked\}/);
  assert.match(componentSource, /isOperationActive/);
  assert.match(componentSource, /Aguardando operação/);
});