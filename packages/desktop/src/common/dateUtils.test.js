const assert = require('node:assert/strict');
const test = require('node:test');

const { formatRelativeDateLabel, shiftDateKey, toLocalDateKey } = require('./dateUtils');

test('toLocalDateKey uses local calendar fields', () => {
  const date = new Date(2026, 3, 6, 0, 30, 0);
  assert.equal(toLocalDateKey(date), '2026-04-06');
});

test('shiftDateKey rolls across month boundaries', () => {
  const date = new Date(2026, 0, 31, 23, 0, 0);
  assert.equal(shiftDateKey(1, date), '2026-02-01');
  assert.equal(shiftDateKey(-1, date), '2026-01-30');
});

test('formatRelativeDateLabel returns Today and Tomorrow relative to a base date', () => {
  const baseDate = new Date(2026, 3, 6, 9, 0, 0);
  assert.equal(formatRelativeDateLabel('2026-04-06', { baseDate }), 'Today');
  assert.equal(formatRelativeDateLabel('2026-04-07', { baseDate }), 'Tomorrow');
});

test('formatRelativeDateLabel includes the year when it differs from the base date', () => {
  const baseDate = new Date(2026, 3, 6, 9, 0, 0);
  assert.match(formatRelativeDateLabel('2025-12-24', { baseDate }), /2025/);
});
