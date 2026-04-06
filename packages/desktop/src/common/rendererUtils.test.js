const assert = require('node:assert/strict');
const test = require('node:test');

const { normalizeNotificationSound, validateEmail } = require('./rendererUtils');

test('validateEmail accepts common email formats', () => {
  assert.equal(validateEmail('user@example.com'), true);
  assert.equal(validateEmail(' user@example.com '), true);
});

test('validateEmail rejects malformed email values', () => {
  assert.equal(validateEmail('invalid'), false);
  assert.equal(validateEmail('user@'), false);
  assert.equal(validateEmail(''), false);
});

test('normalizeNotificationSound falls back without the browser sound API', () => {
  assert.equal(normalizeNotificationSound('', 'glass'), 'glass');
  assert.equal(normalizeNotificationSound('bell', 'glass'), 'bell');
});
