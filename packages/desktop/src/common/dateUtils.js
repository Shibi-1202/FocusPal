(function (root, factory) {
  const api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.FocusPalDateUtils = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function pad2(value) {
    return String(value).padStart(2, '0');
  }

  function normalizeDate(value = new Date()) {
    const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function toLocalDateKey(value = new Date()) {
    const date = normalizeDate(value);
    if (!date) return '';

    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }

  function shiftDateKey(days, baseDate = new Date()) {
    const date = normalizeDate(baseDate);
    if (!date) return '';

    date.setDate(date.getDate() + (Number(days) || 0));
    return toLocalDateKey(date);
  }

  function formatRelativeDateLabel(dateString, options = {}) {
    const {
      emptyLabel = 'Select a date',
      todayLabel = 'Today',
      tomorrowLabel = 'Tomorrow',
      locale = 'en-US',
      baseDate = new Date()
    } = options;

    if (!dateString) {
      return emptyLabel;
    }

    const today = toLocalDateKey(baseDate);
    const tomorrow = shiftDateKey(1, baseDate);

    if (dateString === today) return todayLabel;
    if (dateString === tomorrow) return tomorrowLabel;

    const [year, month, day] = String(dateString).split('-').map(Number);
    const localDate = new Date(year, month - 1, day);
    if (Number.isNaN(localDate.getTime())) {
      return emptyLabel;
    }

    return localDate.toLocaleDateString(locale, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: localDate.getFullYear() !== normalizeDate(baseDate).getFullYear() ? 'numeric' : undefined
    });
  }

  return {
    toLocalDateKey,
    shiftDateKey,
    formatRelativeDateLabel
  };
});
