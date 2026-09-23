import assert from 'node:assert/strict';
import test from 'node:test';
import { registrationAction } from '../registrationPolicy.ts';

test('registra só com aceite e permissão, sem duplicar registro existente', () => {
  assert.equal(registrationAction('accepted', true, false), 'register');
  assert.equal(registrationAction('accepted', true, true), 'none');
});

test('recusa ou permissão revogada remove tarefa registrada', () => {
  assert.equal(registrationAction('declined', true, true), 'unregister');
  assert.equal(registrationAction('unknown', true, true), 'unregister');
  assert.equal(registrationAction('accepted', false, true), 'unregister');
  assert.equal(registrationAction('declined', false, false), 'none');
});