(function (root, factory) {
  const api = factory(root);

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.FocusPalTaskUtils = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  const RESOLVED_STATUSES = new Set(['completed', 'partial', 'skipped']);

  function getDateUtils() {
    if (root?.FocusPalDateUtils) {
      return root.FocusPalDateUtils;
    }

    if (typeof require === 'function') {
      try {
        return require('./dateUtils');
      } catch {
        return {};
      }
    }

    return {};
  }

  function pad2(value) {
    return String(value).padStart(2, '0');
  }

  function normalizeDate(value = new Date()) {
    const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function fallbackToLocalDateKey(value = new Date()) {
    const date = normalizeDate(value);
    if (!date) return '';

    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }

  function fallbackShiftDateKey(days, baseDate = new Date()) {
    const date = normalizeDate(baseDate);
    if (!date) return '';

    date.setDate(date.getDate() + (Number(days) || 0));
    return fallbackToLocalDateKey(date);
  }

  const dateUtils = getDateUtils();
  const toLocalDateKey = typeof dateUtils.toLocalDateKey === 'function'
    ? dateUtils.toLocalDateKey
    : fallbackToLocalDateKey;
  const shiftDateKey = typeof dateUtils.shiftDateKey === 'function'
    ? dateUtils.shiftDateKey
    : fallbackShiftDateKey;

  function getTodayString(referenceDate = new Date()) {
    return toLocalDateKey(referenceDate);
  }

  function getYesterdayString(referenceDate = new Date()) {
    return shiftDateKey(-1, referenceDate);
  }

  function parseDateKey(dateString) {
    const [year, month, day] = String(dateString || '').split('-').map(Number);
    if (!year || !month || !day) {
      return null;
    }

    const parsed = new Date(year, month - 1, day);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function isRecurringTask(task) {
    return Boolean(task?.recurring && task.recurring !== 'none');
  }

  function getTaskDate(task, fallbackDate = getTodayString()) {
    return task?.instanceDate || task?.taskDate || fallbackDate;
  }

  function getTaskDateTimeMs(task, timeStr) {
    const [hours, minutes] = String(timeStr || '00:00').split(':').map(Number);
    const [year, month, day] = getTaskDate(task).split('-').map(Number);
    return new Date(year, month - 1, day, hours || 0, minutes || 0, 0, 0).getTime();
  }

  function getTaskScheduledStartMs(task) {
    return getTaskDateTimeMs(task, task.start);
  }

  function getTaskScheduledEndMs(task) {
    const startMs = getTaskScheduledStartMs(task);
    let endMs = getTaskDateTimeMs(task, task.end);

    if (endMs <= startMs) {
      endMs += 24 * 60 * 60 * 1000;
    }

    return endMs;
  }

  function getTaskDurationMs(task) {
    return Math.max(60 * 1000, getTaskScheduledEndMs(task) - getTaskScheduledStartMs(task));
  }

  function getTaskStartMs(task) {
    if (task?.startedAt) {
      const startedMs = new Date(task.startedAt).getTime();
      if (!Number.isNaN(startedMs)) {
        return startedMs;
      }
    }

    return getTaskScheduledStartMs(task);
  }

  function getTaskEndMs(task) {
    if (task?.actualEndAt) {
      const endMs = new Date(task.actualEndAt).getTime();
      if (!Number.isNaN(endMs)) {
        return endMs;
      }
    }

    return getTaskScheduledEndMs(task);
  }

  function isResolvedStatus(status) {
    return RESOLVED_STATUSES.has(status);
  }

  function matchesRecurringPattern(task, referenceDate = new Date()) {
    if (!isRecurringTask(task)) {
      return false;
    }

    const dayOfWeek = referenceDate.getDay();
    if (task.recurring === 'daily') return true;
    if (task.recurring === 'weekdays') return dayOfWeek >= 1 && dayOfWeek <= 5;
    if (task.recurring === 'weekends') return dayOfWeek === 0 || dayOfWeek === 6;
    return false;
  }

  function shouldTaskAppearOnDate(task, dateString = getTodayString()) {
    const scheduledDate = task?.instanceDate || task?.taskDate;

    if (scheduledDate) {
      return scheduledDate === dateString;
    }

    if (!isRecurringTask(task)) {
      return !task?.createdAt || String(task.createdAt).startsWith(dateString);
    }

    return matchesRecurringPattern(task, parseDateKey(dateString) || new Date());
  }

  function createRecurringTaskInstance(task, dateString = getTodayString()) {
    return {
      ...task,
      id: `${task.id}_${dateString}`,
      sourceTaskId: task.id,
      status: 'pending',
      completionNote: '',
      completedAt: null,
      instanceDate: dateString,
      taskDate: dateString
    };
  }

  function generateTaskId() {
    return `task_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  }

  return {
    createRecurringTaskInstance,
    generateTaskId,
    getTaskDate,
    getTaskDateTimeMs,
    getTaskDurationMs,
    getTaskEndMs,
    getTaskScheduledEndMs,
    getTaskScheduledStartMs,
    getTaskStartMs,
    getTodayString,
    getYesterdayString,
    isResolvedStatus,
    shouldTaskAppearOnDate
  };
});
