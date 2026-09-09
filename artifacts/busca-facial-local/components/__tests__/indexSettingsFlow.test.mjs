import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createIndexClearAlertOptions,
  INDEX_CLEAR_ALERT_MESSAGE,
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