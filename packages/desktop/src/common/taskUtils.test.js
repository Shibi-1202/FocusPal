const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createRecurringTaskInstance,
  generateTaskId,
  getTaskDurationMs,
  getTaskEndMs,
  getTaskScheduledEndMs,
  getTaskStartMs,
  getTodayString,
  getYesterdayString,
  isResolvedStatus,
  shouldTaskAppearOnDate
} = require('./taskUtils');

test('shouldTaskAppearOnDate matches recurring weekday tasks against the provided date', () => {
  assert.equal(shouldTaskAppearOnDate({ recurring: 'weekdays' }, '2026-04-06'), true);
  assert.equal(shouldTaskAppearOnDate({ recurring: 'weekdays' }, '2026-04-05'), false);
});

test('shouldTaskAppearOnDate respects explicit task dates before recurrence rules', () => {
  assert.equal(shouldTaskAppearOnDate({ recurring: 'daily', taskDate: '2026-04-08' }, '2026-04-06'), false);
});

test('createRecurringTaskInstance preserves the source task and resets completion state', () => {
  const instance = createRecurringTaskInstance({
    id: 'task_1',
    name: 'Deep work',
    recurring: 'daily',
    status: 'completed',
    completionNote: 'done',
    completedAt: '2026-04-05T10:00:00.000Z'
  }, '2026-04-06');

  assert.equal(instance.id, 'task_1_2026-04-06');
  assert.equal(instance.sourceTaskId, 'task_1');
  assert.equal(instance.status, 'pending');
  assert.equal(instance.completionNote, '');
  assert.equal(instance.completedAt, null);
  assert.equal(instance.instanceDate, '2026-04-06');
});

test('task timing helpers handle overnight schedules and actual timestamps', () => {
  const overnightTask = {
    taskDate: '2026-04-06',
    start: '23:30',
    end: '00:15'
  };

  assert.equal(getTaskDurationMs(overnightTask), 45 * 60 * 1000);
  assert.equal(getTaskScheduledEndMs(overnightTask) > getTaskStartMs(overnightTask), true);

  const startedTask = {
    ...overnightTask,
    startedAt: '2026-04-06T18:45:00.000Z',
    actualEndAt: '2026-04-06T19:15:00.000Z'
  };

  assert.equal(getTaskStartMs(startedTask), new Date(startedTask.startedAt).getTime());
  assert.equal(getTaskEndMs(startedTask), new Date(startedTask.actualEndAt).getTime());
});

test('date helpers use local date keys and status helper recognizes resolved states', () => {
  const date = new Date(2026, 3, 6, 9, 0, 0);
  assert.equal(getTodayString(date), '2026-04-06');
  assert.equal(getYesterdayString(date), '2026-04-05');
  assert.equal(isResolvedStatus('completed'), true);
  assert.equal(isResolvedStatus('pending'), false);
});

test('generateTaskId returns the expected prefix', () => {
  assert.match(generateTaskId(), /^task_/);
});
