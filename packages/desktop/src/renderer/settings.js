  const { formatRelativeDateLabel } = window.FocusPalDateUtils;
  const { normalizeNotificationSound } = window.FocusPalRendererUtils;
  const { generateTaskId, getTaskDate, getTodayString, shouldTaskAppearOnDate } = window.FocusPalTaskUtils;
  const BREAK_INTERVAL_DEFAULTS = {
    water: 45,
    stretch: 60,
    eyes: 20
  };
  const TASK_TIME_INCREMENT_MINUTES = 30;
  const TASK_DURATION_DEFAULT_MINUTES = 60;
  let shouldQuitAfterSave = false;
  let plannedTaskDate = null;
  let dateTimePickerState = {
    selectedDate: getTodayString(),
    visibleMonth: null,
    startTime: '09:00',
    endTime: '10:00',
    focusTarget: 'date'
  };

  function formatTaskDateLabel(dateString) {
    return formatRelativeDateLabel(dateString);
  }

  function setTaskDateInput(date = getTodayString()) {
    document.getElementById('task-date').value = date;
    document.getElementById('task-date-display').textContent = formatTaskDateLabel(date);
  }

  function padTimePart(value) {
    return String(value).padStart(2, '0');
  }

  function formatDateInputValue(date) {
    return `${date.getFullYear()}-${padTimePart(date.getMonth() + 1)}-${padTimePart(date.getDate())}`;
  }

  function parseDateInputValue(value) {
    if (!value) {
      return new Date();
    }

    const [year, month, day] = String(value).split('-').map(Number);
    const parsed = new Date(year, (month || 1) - 1, day || 1);

    if (Number.isNaN(parsed.getTime())) {
      return new Date();
    }

    return parsed;
  }

  function parseTimeString(value = '00:00') {
    const [hours = 0, minutes = 0] = String(value).split(':').map(Number);
    return {
      hours: Math.min(Math.max(Number.isFinite(hours) ? hours : 0, 0), 23),
      minutes: Math.min(Math.max(Number.isFinite(minutes) ? minutes : 0, 0), 59)
    };
  }

  function formatTimeString(hours, minutes) {
    return `${padTimePart(hours)}:${padTimePart(minutes)}`;
  }

  function clampBreakIntervalValue(value, fallback) {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 5), 180) : fallback;
  }

  function setBreakIntervalInputs(values = {}) {
    const mapping = {
      water: 'break-interval-water',
      stretch: 'break-interval-stretch',
      eyes: 'break-interval-eyes'
    };

    Object.entries(mapping).forEach(([key, inputId]) => {
      const normalized = String(values[key] ?? BREAK_INTERVAL_DEFAULTS[key]);
      const input = document.getElementById(inputId);
      input.value = normalized;
      input.defaultValue = normalized;
    });
  }

  function setTaskTimeInputs(start, end) {
    document.getElementById('start-time-display').textContent = start;
    document.getElementById('end-time-display').textContent = end;
  }

  function roundDateToNextIncrement(reference = new Date()) {
    const rounded = new Date(reference);
    rounded.setSeconds(0, 0);

    const remainder = rounded.getMinutes() % TASK_TIME_INCREMENT_MINUTES;
    if (remainder !== 0) {
      rounded.setMinutes(rounded.getMinutes() + (TASK_TIME_INCREMENT_MINUTES - remainder));
    }

    return rounded;
  }

  function getAdaptiveTaskTimeRange(reference = new Date()) {
    const startDate = roundDateToNextIncrement(reference);
    const endDate = new Date(startDate.getTime() + (TASK_DURATION_DEFAULT_MINUTES * 60 * 1000));
    const start = formatTimeString(startDate.getHours(), startDate.getMinutes());

    if (
      endDate.getFullYear() !== startDate.getFullYear()
      || endDate.getMonth() !== startDate.getMonth()
      || endDate.getDate() !== startDate.getDate()
    ) {
      return { start, end: '23:59' };
    }

    return {
      start,
      end: formatTimeString(endDate.getHours(), endDate.getMinutes())
    };
  }

  function applyAdaptiveTaskTimeDefaults() {
    const { start, end } = getAdaptiveTaskTimeRange();
    setTaskTimeInputs(start, end);
  }

  function setNotificationSoundInput(value) {
    document.getElementById('notification-sound').value = normalizeNotificationSound(value);
  }

  const THEME_CUSTOM_INPUTS = {
    bg: 'theme-bg',
    bg2: 'theme-bg2',
    bg3: 'theme-bg3',
    accent: 'theme-accent',
    accent2: 'theme-accent2',
    text: 'theme-text',
    muted: 'theme-muted'
  };

  function populateThemePresetOptions() {
    const select = document.getElementById('theme-preset');
    const options = Object.entries(window.FocusPalTheme?.PRESETS || {}).map(([value, preset]) =>
      `<option value="${value}">${preset.label}</option>`
    );
    options.push('<option value="custom">Custom</option>');
    select.innerHTML = options.join('');
  }

  function setThemeCustomizerVisibility(preset) {
    document.getElementById('theme-custom-grid').classList.toggle('hidden', preset !== 'custom');
  }

  function setThemeControlValues(settings) {
    const normalized = window.FocusPalTheme?.normalizeSettings(settings);
    const resolved = window.FocusPalTheme?.resolveTheme(normalized);
    const preset = normalized?.preset || window.FocusPalTheme?.DEFAULT_PRESET || 'focuspal';

    document.getElementById('theme-preset').value = preset;

    Object.entries(THEME_CUSTOM_INPUTS).forEach(([key, inputId]) => {
      document.getElementById(inputId).value = resolved?.[key];
    });

    setThemeCustomizerVisibility(preset);
  }

  function collectThemeCustomColors() {
    return Object.fromEntries(
      Object.entries(THEME_CUSTOM_INPUTS).map(([key, inputId]) => [key, document.getElementById(inputId).value])
    );
  }

  function getThemeSettingsFromControls() {
    const preset = document.getElementById('theme-preset').value || window.FocusPalTheme?.DEFAULT_PRESET || 'focuspal';
    if (preset === 'custom') {
      return {
        preset: 'custom',
        custom: collectThemeCustomColors()
      };
    }

    return { preset };
  }

  function previewThemeFromControls() {
    window.FocusPalTheme?.applyTheme(getThemeSettingsFromControls());
  }

  // ── Tab switching ──────────────────────────────────────────────────────────
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab, .panel').forEach(el => el.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('panel-' + tab.dataset.tab).classList.add('active');
      
      // Load account info when account tab is opened
      if (tab.dataset.tab === 'account') {
        loadAccountInfo();
      }
    });
  });

  // Listen for tab selection from main process
  window.fp.onSelectTab((tabPayload) => {
    const tab = typeof tabPayload === 'string' ? tabPayload : tabPayload?.tab;
    if (tabPayload && typeof tabPayload === 'object') {
      shouldQuitAfterSave = Boolean(tabPayload.quitAfterSave);
      plannedTaskDate = tabPayload.planningDate || null;
      if (plannedTaskDate) {
        setTaskDateInput(plannedTaskDate);
      }
    } else {
      shouldQuitAfterSave = false;
      plannedTaskDate = null;
    }

    const safeTab = document.querySelector(`.tab[data-tab="${tab}"]`) ? tab : 'tasks';
    const tabEl = document.querySelector(`.tab[data-tab="${safeTab}"]`);
    if (tabEl) {
      document.querySelectorAll('.tab, .panel').forEach(el => el.classList.remove('active'));
      tabEl.classList.add('active');
      document.getElementById('panel-' + safeTab).classList.add('active');
      
      // Load account info when account tab is opened
      if (safeTab === 'account') {
        loadAccountInfo();
      }
    }
  });

  // ── Priority picker ────────────────────────────────────────────────────────
  let selectedPriority = 'critical';
  let selectedColor = '#d6542c';
  
  document.querySelectorAll('.priority-option').forEach(opt => {
    opt.addEventListener('click', () => {
      document.querySelectorAll('.priority-option').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      selectedPriority = opt.dataset.priority;
      selectedColor = opt.dataset.color;
    });
  });

  // ── Date and time picker ──────────────────────────────────────────────────
  let currentTimeTarget = 'start';
  let selectedHour = 9;
  let selectedMinute = 0;
  const TIME_WHEEL_ITEM_HEIGHT = 44;
  const TIME_WHEEL_SPACERS = 2;
  const TIME_WHEEL_REPEATS = 7;
  const timeWheelSnapTimers = new Map();

  function syncDateTimePickerStateFromForm(focusTarget = 'date') {
    const selectedDate = document.getElementById('task-date').value || plannedTaskDate || getTodayString();
    const parsedDate = parseDateInputValue(selectedDate);

    dateTimePickerState = {
      selectedDate,
      visibleMonth: new Date(parsedDate.getFullYear(), parsedDate.getMonth(), 1),
      startTime: document.getElementById('start-time-display').textContent || getAdaptiveTaskTimeRange().start,
      endTime: document.getElementById('end-time-display').textContent || getAdaptiveTaskTimeRange().end,
      focusTarget
    };
  }

  function applyDateTimePickerSelection() {
    setTaskDateInput(dateTimePickerState.selectedDate);
    setTaskTimeInputs(dateTimePickerState.startTime, dateTimePickerState.endTime);
  }

  function buildWheelItems(values, formatter = (value) => value, repeatCount = 1) {
    const spacers = Array.from({ length: TIME_WHEEL_SPACERS }, () =>
      '<div class="time-wheel-item spacer" aria-hidden="true"></div>'
    ).join('');

    const items = Array.from({ length: repeatCount }, (_, repeatIndex) =>
      values.map((value, baseIndex) => {
        const virtualIndex = (repeatIndex * values.length) + baseIndex;
        return `<div class="time-wheel-item" data-index="${virtualIndex}" data-base-index="${baseIndex}" data-value="${value}">${formatter(value)}</div>`;
      }).join('')
    ).join('');

    return `${spacers}${items}${spacers}`;
  }

  function getWheelItems(wheel) {
    return Array.from(wheel.querySelectorAll('.time-wheel-item:not(.spacer)'));
  }

  function getWheelBaseCount(wheel) {
    return Number(wheel?.dataset.baseCount || 0);
  }

  function getWheelRepeatCount(wheel) {
    return Number(wheel?.dataset.repeatCount || 1);
  }

  function getClampedWheelIndex(wheel, index) {
    const maxIndex = Math.max(getWheelItems(wheel).length - 1, 0);
    return Math.min(Math.max(index, 0), maxIndex);
  }

  function getWrappedWheelIndex(wheel, index) {
    const baseCount = getWheelBaseCount(wheel) || 1;
    return ((index % baseCount) + baseCount) % baseCount;
  }

  function getWheelMiddleIndex(wheel, index = 0) {
    return (Math.floor(getWheelRepeatCount(wheel) / 2) * getWheelBaseCount(wheel))
      + getWrappedWheelIndex(wheel, index);
  }

  function getWheelCenterOffset(wheel) {
    const viewportHeight = Math.max(wheel?.clientHeight || 0, TIME_WHEEL_ITEM_HEIGHT);
    return (TIME_WHEEL_SPACERS * TIME_WHEEL_ITEM_HEIGHT) - ((viewportHeight - TIME_WHEEL_ITEM_HEIGHT) / 2);
  }

  function getWheelScrollTopForIndex(wheel, index) {
    return Math.max(0, getWheelCenterOffset(wheel) + (index * TIME_WHEEL_ITEM_HEIGHT));
  }

  function getWheelIndexFromScrollTop(wheel, scrollTop = wheel?.scrollTop || 0) {
    return Math.round((scrollTop - getWheelCenterOffset(wheel)) / TIME_WHEEL_ITEM_HEIGHT);
  }

  function getSelectedWheelBaseIndex(wheel) {
    const currentIndex = Number(wheel.dataset.selectedBaseIndex);
    if (Number.isFinite(currentIndex)) {
      return getWrappedWheelIndex(wheel, currentIndex);
    }

    return 0;
  }

  function setSelectedValueFromItem(wheelId, item) {
    if (!item) return;

    if (wheelId === 'picker-hour-wheel') {
      selectedHour = parseInt(item.dataset.value, 10);
    } else if (wheelId === 'picker-minute-wheel') {
      selectedMinute = parseInt(item.dataset.value, 10);
    }
  }

  function renderWheel(wheel, values, formatter = (value) => value) {
    const repeatCount = values.length > 1 ? TIME_WHEEL_REPEATS : 1;
    wheel.dataset.baseCount = String(values.length);
    wheel.dataset.repeatCount = String(repeatCount);
    wheel.innerHTML = buildWheelItems(values, formatter, repeatCount);
  }

  function normalizeWheelIndex(wheel, index = null) {
    const nextIndex = index === null
      ? getWheelIndexFromScrollTop(wheel)
      : index;
    const clampedIndex = getClampedWheelIndex(wheel, nextIndex);
    const baseCount = getWheelBaseCount(wheel);
    const repeatCount = getWheelRepeatCount(wheel);

    if (!baseCount || repeatCount <= 1) {
      return clampedIndex;
    }

    const totalCount = baseCount * repeatCount;
    const centeredIndex = getWheelMiddleIndex(wheel, clampedIndex);

    if (clampedIndex < baseCount || clampedIndex >= totalCount - baseCount) {
      wheel.scrollTop = getWheelScrollTopForIndex(wheel, centeredIndex);
      return centeredIndex;
    }

    return clampedIndex;
  }

  function scrollWheelToIndex(wheel, index, behavior = 'smooth') {
    const nextIndex = getClampedWheelIndex(wheel, index);
    wheel.dataset.selectedIndex = String(nextIndex);
    wheel.dataset.selectedBaseIndex = String(getWrappedWheelIndex(wheel, nextIndex));
    wheel.scrollTo({ top: getWheelScrollTopForIndex(wheel, nextIndex), behavior });
    updateSelectedItems(wheel, nextIndex);
  }

  function scrollWheelToBaseIndex(wheel, baseIndex, behavior = 'smooth') {
    scrollWheelToIndex(wheel, getWheelMiddleIndex(wheel, baseIndex), behavior);
  }

  function scheduleWheelSnap(wheel) {
    const existingTimer = timeWheelSnapTimers.get(wheel.id);
    if (existingTimer) clearTimeout(existingTimer);

    timeWheelSnapTimers.set(wheel.id, setTimeout(() => {
      scrollWheelToBaseIndex(wheel, getSelectedWheelBaseIndex(wheel));
    }, 90));
  }

  function stepWheelSelection(wheel, direction) {
    scrollWheelToBaseIndex(wheel, getSelectedWheelBaseIndex(wheel) + direction);
  }

  function attachWheelInteractions(wheel) {
    if (!wheel || wheel.dataset.bound === 'true') return;

    wheel.dataset.bound = 'true';
    wheel.tabIndex = 0;

    wheel.addEventListener('scroll', () => {
      updateSelectedItems(wheel, normalizeWheelIndex(wheel));
      scheduleWheelSnap(wheel);
    }, { passive: true });

    wheel.addEventListener('wheel', (event) => {
      event.preventDefault();
      stepWheelSelection(wheel, event.deltaY > 0 ? 1 : -1);
    }, { passive: false });

    wheel.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        stepWheelSelection(wheel, 1);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        stepWheelSelection(wheel, -1);
      }
    });
  }

  function scrollToValue(wheel, value, behavior = 'smooth') {
    const items = getWheelItems(wheel);
    const targetIndex = items.findIndex(item => item.dataset.value == value);
    if (targetIndex !== -1) {
      scrollWheelToBaseIndex(
        wheel,
        Number(items[targetIndex].dataset.baseIndex || targetIndex),
        behavior
      );
    }
  }

  function updateDateTimePickerTimeTargets() {
    document.getElementById('picker-start-preview').textContent = dateTimePickerState.startTime;
    document.getElementById('picker-end-preview').textContent = dateTimePickerState.endTime;
    document.getElementById('picker-start-target').classList.toggle('active', currentTimeTarget === 'start');
    document.getElementById('picker-end-target').classList.toggle('active', currentTimeTarget === 'end');
  }

  function syncCurrentPickerTimeFromWheelSelection() {
    const nextTime = formatTimeString(selectedHour, selectedMinute);
    if (currentTimeTarget === 'start') {
      dateTimePickerState.startTime = nextTime;
    } else {
      dateTimePickerState.endTime = nextTime;
    }

    applyDateTimePickerSelection();
    updateDateTimePickerTimeTargets();
  }

  function updateSelectedItems(wheel, forcedIndex = null) {
    if (!wheel) return;

    const items = getWheelItems(wheel);
    if (!items.length) return;

    const selectedIndex = forcedIndex === null
      ? normalizeWheelIndex(wheel)
      : getClampedWheelIndex(wheel, forcedIndex);

    wheel.dataset.selectedIndex = String(selectedIndex);
    wheel.dataset.selectedBaseIndex = String(getWrappedWheelIndex(wheel, selectedIndex));

    items.forEach(item => {
      const itemIndex = Number(item.dataset.index || 0);
      const distance = Math.abs(itemIndex - selectedIndex);

      item.classList.toggle('selected', distance === 0);
      item.classList.toggle('nearby', distance === 1);
      item.classList.toggle('distant', distance >= 2);
    });

    setSelectedValueFromItem(wheel.id, items[selectedIndex]);
    syncCurrentPickerTimeFromWheelSelection();
  }

  function loadWheelSelectionFromTarget(target = currentTimeTarget) {
    currentTimeTarget = target;
    const sourceTime = currentTimeTarget === 'start'
      ? dateTimePickerState.startTime
      : dateTimePickerState.endTime;
    const { hours, minutes } = parseTimeString(sourceTime);
    selectedHour = hours;
    selectedMinute = minutes;
    updateDateTimePickerTimeTargets();
  }

  function renderTimeWheels() {
    const hourWheel = document.getElementById('picker-hour-wheel');
    const minuteWheel = document.getElementById('picker-minute-wheel');

    renderWheel(hourWheel, Array.from({ length: 24 }, (_, index) => index), (hour) => padTimePart(hour));
    renderWheel(minuteWheel, Array.from({ length: 60 }, (_, index) => index), (minute) => padTimePart(minute));
    [hourWheel, minuteWheel].forEach(attachWheelInteractions);

    requestAnimationFrame(() => {
      scrollToValue(hourWheel, selectedHour, 'auto');
      scrollToValue(minuteWheel, selectedMinute, 'auto');
      hourWheel.focus();
    });
  }

  function renderDateTimePicker() {
    const currentMonthLabel = document.getElementById('calendar-current-month');
    const calendarGrid = document.getElementById('calendar-grid');
    const visibleMonth = dateTimePickerState.visibleMonth || parseDateInputValue(dateTimePickerState.selectedDate);
    const monthStart = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
    const gridStart = new Date(monthStart);
    gridStart.setDate(monthStart.getDate() - monthStart.getDay());
    const today = getTodayString();

    currentMonthLabel.textContent = monthStart.toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric'
    });

    const days = [];
    for (let index = 0; index < 42; index += 1) {
      const day = new Date(gridStart);
      day.setDate(gridStart.getDate() + index);
      const dayValue = formatDateInputValue(day);
      const classes = ['calendar-day'];

      if (day.getMonth() !== monthStart.getMonth()) classes.push('outside');
      if (dayValue === today) classes.push('today');
      if (dayValue === dateTimePickerState.selectedDate) classes.push('selected');

      days.push(
        `<button type="button" class="${classes.join(' ')}" data-date="${dayValue}">${day.getDate()}</button>`
      );
    }

    calendarGrid.innerHTML = days.join('');
    updateDateTimePickerTimeTargets();
  }

  function openDateTimePicker(focusTarget = 'date') {
    syncDateTimePickerStateFromForm(focusTarget);
    loadWheelSelectionFromTarget(focusTarget === 'end' ? 'end' : 'start');
    renderDateTimePicker();
    renderTimeWheels();
    document.getElementById('datetime-picker-modal').classList.add('show');

    requestAnimationFrame(() => {
      if (focusTarget === 'date') {
        document.getElementById('calendar-grid').querySelector('.calendar-day.selected')?.focus();
      } else {
        document.getElementById('picker-hour-wheel').focus();
      }
    });
  }

  function closeDateTimePicker() {
    document.getElementById('datetime-picker-modal').classList.remove('show');
  }

  function shiftVisibleCalendarMonth(offset) {
    const month = dateTimePickerState.visibleMonth || parseDateInputValue(dateTimePickerState.selectedDate);
    dateTimePickerState.visibleMonth = new Date(month.getFullYear(), month.getMonth() + offset, 1);
    renderDateTimePicker();
  }

  document.getElementById('task-date-trigger').addEventListener('click', () => openDateTimePicker('date'));
  document.getElementById('start-time-trigger').addEventListener('click', () => openDateTimePicker('start'));
  document.getElementById('end-time-trigger').addEventListener('click', () => openDateTimePicker('end'));

  document.getElementById('calendar-prev').addEventListener('click', () => shiftVisibleCalendarMonth(-1));
  document.getElementById('calendar-next').addEventListener('click', () => shiftVisibleCalendarMonth(1));

  document.getElementById('calendar-grid').addEventListener('click', (event) => {
    const dayButton = event.target.closest('.calendar-day');
    if (!dayButton) return;

    dateTimePickerState.selectedDate = dayButton.dataset.date;
    const selectedDate = parseDateInputValue(dayButton.dataset.date);
    dateTimePickerState.visibleMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
    applyDateTimePickerSelection();
    renderDateTimePicker();
  });

  document.getElementById('picker-start-target').addEventListener('click', () => {
    loadWheelSelectionFromTarget('start');
    renderTimeWheels();
  });

  document.getElementById('picker-end-target').addEventListener('click', () => {
    loadWheelSelectionFromTarget('end');
    renderTimeWheels();
  });

  document.getElementById('datetime-picker-modal').addEventListener('click', (event) => {
    if (event.target.id === 'datetime-picker-modal') {
      closeDateTimePicker();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && document.getElementById('datetime-picker-modal').classList.contains('show')) {
      closeDateTimePicker();
    }
  });

  document.getElementById('btn-preview-notification-sound').addEventListener('click', async () => {
    const selectedSound = normalizeNotificationSound(document.getElementById('notification-sound').value);
    await window.FocusPalNotificationSound?.play(selectedSound);
  });

  document.getElementById('theme-preset').addEventListener('change', () => {
    const preset = document.getElementById('theme-preset').value;
    if (preset !== 'custom') {
      setThemeControlValues({ preset });
    }
    setThemeCustomizerVisibility(preset);
    previewThemeFromControls();
  });

  Object.values(THEME_CUSTOM_INPUTS).forEach((inputId) => {
    document.getElementById(inputId).addEventListener('input', () => {
      const presetSelect = document.getElementById('theme-preset');
      if (presetSelect.value !== 'custom') {
        presetSelect.value = 'custom';
        setThemeCustomizerVisibility('custom');
      }
      previewThemeFromControls();
    });
  });

  // ── Task list ──────────────────────────────────────────────────────────────
  let tasks = [];

  function isTaskForToday(task) {
    return shouldTaskAppearOnDate(task, getTodayString());
  }

  function sortTasksByStartTime(left, right) {
    return String(left.start || '').localeCompare(String(right.start || ''));
  }

  function renderTaskItems(taskItems) {
    return taskItems.map((task) => {
      const recurringLabel = task.recurring && task.recurring !== 'none'
        ? `<span style="font-size:9px; color:var(--muted); margin-left:4px;">↻ ${task.recurring}</span>`
        : '';

      return `
      <div class="task-item">
        <div class="task-color-dot" style="background:${task.color || '#7c6cfc'}"></div>
        <div class="task-item-info">
          <div class="task-item-name">${task.name}${recurringLabel}</div>
          <div class="task-item-time">${task.start} – ${task.end}</div>
        </div>
        <button class="task-delete" onclick="handleDeleteTask('${task.id}')" title="Remove">✕</button>
      </div>`;
    }).join('');
  }

  function renderTaskList() {
    const todayList = document.getElementById('task-list');
    const scheduledList = document.getElementById('scheduled-task-list');
    const scheduledSection = document.getElementById('scheduled-task-section');
    const todayTasks = tasks.filter(isTaskForToday).sort(sortTasksByStartTime);
    const scheduledTasks = tasks
      .filter((task) => {
        const taskDate = getTaskDate(task, '');
        return taskDate && taskDate !== getTodayString();
      })
      .sort((left, right) => {
        const dateCompare = getTaskDate(left, '').localeCompare(getTaskDate(right, ''));
        if (dateCompare !== 0) {
          return dateCompare;
        }

        return sortTasksByStartTime(left, right);
      });

    if (todayTasks.length === 0) {
      todayList.innerHTML = '<div class="task-list-empty">No tasks yet — add one below</div>';
    } else {
      todayList.innerHTML = renderTaskItems(todayTasks);
    }

    if (scheduledTasks.length === 0) {
      scheduledList.innerHTML = '<div class="task-list-empty">No tasks scheduled for other dates yet</div>';
      scheduledSection.classList.add('hidden');
      return;
    }

    const groupedTasks = scheduledTasks.reduce((groups, task) => {
      const taskDate = getTaskDate(task, '');
      if (!groups.has(taskDate)) {
        groups.set(taskDate, []);
      }
      groups.get(taskDate).push(task);
      return groups;
    }, new Map());

    scheduledList.innerHTML = Array.from(groupedTasks.entries()).map(([taskDate, dateTasks]) => `
      <div class="task-date-group">
        <div class="task-date-heading">
          <div class="task-date-title">${formatTaskDateLabel(taskDate)}</div>
          <div class="task-date-meta">${taskDate}</div>
        </div>
        <div class="task-date-items">
          ${renderTaskItems(dateTasks)}
        </div>
      </div>
    `).join('');

    scheduledSection.classList.remove('hidden');
  }

  // Wrapper function for onclick handler (can't use async directly in onclick)
  function handleDeleteTask(taskId) {
    deleteTask(taskId);
  }

  async function deleteTask(taskId) {
    const normalizedTaskId = String(taskId);
    tasks = tasks.filter(t => String(t.id) !== normalizedTaskId);
    renderTaskList();
    
    // Save immediately
    await window.fp.set('tasks', tasks);
    
    // Notify widget to reload
    window.fp.notifySettingsUpdated();
    
    showToast('✓ Task deleted');
  }

  async function clearAllTasks() {
    if (confirm('Clear all tasks?')) {
      tasks = [];
      renderTaskList();
      await window.fp.set('tasks', []);
      window.fp.notifySettingsUpdated();
      showToast('✓ All tasks cleared');
    }
  }

  // ── Account management ─────────────────────────────────────────────────────
  async function loadAccountInfo() {
    try {
      const user = await window.fp.auth.getUser();

      if (user) {
        document.getElementById('account-email').textContent = user.email || 'N/A';
        document.getElementById('account-name').textContent = user.displayName || user.name || 'N/A';

        if (user.createdAt) {
          const date = new Date(user.createdAt);
          document.getElementById('account-created').textContent = date.toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
          });
        } else {
          document.getElementById('account-created').textContent = 'N/A';
        }
        return;
      }

      document.getElementById('account-email').textContent = 'N/A';
      document.getElementById('account-name').textContent = 'N/A';
      document.getElementById('account-created').textContent = 'N/A';
    } catch (err) {
      console.error('Failed to load account info:', err);
      document.getElementById('account-email').textContent = 'Error loading account';
      document.getElementById('account-name').textContent = 'Error loading account';
      document.getElementById('account-created').textContent = 'Error loading account';
    }
  }

  async function handleLogout() {
    const confirmed = confirm('Are you sure you want to logout? You will be returned to the sign-in screen.');
    if (!confirmed) return;

    try {
      await window.fp.auth.logout();
    } catch (err) {
      console.error('Logout error:', err);
      alert('Failed to logout. Please try again.');
    }
  }

  async function loadAppVersion() {
    const versionLabel = document.getElementById('app-version');
    if (!versionLabel) {
      return;
    }

    try {
      const version = await window.fp.getAppVersion();
      versionLabel.textContent = version ? `v${version}` : 'v-';
    } catch (err) {
      console.error('Failed to load app version:', err);
      versionLabel.textContent = 'v-';
    }
  }

  document.getElementById('btn-add-task').addEventListener('click', async () => {
    const name  = document.getElementById('new-name').value.trim();
    const start = document.getElementById('start-time-display').textContent;
    const end   = document.getElementById('end-time-display').textContent;
    const recurring = document.getElementById('task-recurring').value;
    const taskDate = document.getElementById('task-date').value || getTodayString();

    if (!name)  { alert('Please enter a task name.'); return; }
    if (!start) { alert('Please set a start time.');  return; }
    if (!end)   { alert('Please set an end time.');   return; }
    if (start >= end) { alert('End time must be after start time.'); return; }

    const task = {
      id: generateTaskId(),
      name,
      start,
      end,
      color: selectedColor,
      priority: selectedPriority,
      recurring: recurring || 'none',
      status: 'pending',
      completionNote: '',
      createdAt: new Date().toISOString(),
      completedAt: null,
      taskDate
    };

    tasks.push(task);
    renderTaskList();

    // Save immediately
    await window.fp.set('tasks', tasks);
    
    // Notify widget to reload
    window.fp.notifySettingsUpdated();

    // Show success toast
    showToast('✓ Task added successfully!');

    // Reset form
    document.getElementById('new-name').value  = '';
    applyAdaptiveTaskTimeDefaults();
    document.getElementById('task-recurring').value = 'none';
    setTaskDateInput(plannedTaskDate || getTodayString());
  });

  // ── Toast notification ─────────────────────────────────────────────────────
  function showToast(message) {
    const t = document.getElementById('toast');
    t.textContent = message;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2000);
  }

  // ── Save all ───────────────────────────────────────────────────────────────
  async function saveAll() {
    const breakIntervals = {
      water: clampBreakIntervalValue(document.getElementById('break-interval-water').value, BREAK_INTERVAL_DEFAULTS.water),
      stretch: clampBreakIntervalValue(document.getElementById('break-interval-stretch').value, BREAK_INTERVAL_DEFAULTS.stretch),
      eyes: clampBreakIntervalValue(document.getElementById('break-interval-eyes').value, BREAK_INTERVAL_DEFAULTS.eyes)
    };
    const notificationSound = normalizeNotificationSound(document.getElementById('notification-sound').value);
    const appTheme = window.FocusPalTheme?.normalizeSettings(getThemeSettingsFromControls()) || { preset: 'focuspal' };

    await window.fp.set('tasks', tasks);
    await window.fp.set('breakInterval', breakIntervals.water);
    await window.fp.set('breakWaterInterval', breakIntervals.water);
    await window.fp.set('breakStretchInterval', breakIntervals.stretch);
    await window.fp.set('breakEyesInterval', breakIntervals.eyes);
    await window.fp.set('notificationSound', notificationSound);
    await window.fp.set('appTheme', appTheme);
    setBreakIntervalInputs(breakIntervals);
    setNotificationSoundInput(notificationSound);
    window.FocusPalTheme?.applyTheme(appTheme);
    await window.fp.set('breakWater',   document.getElementById('toggle-water').checked);
    await window.fp.set('breakStretch', document.getElementById('toggle-stretch').checked);
    await window.fp.set('breakEyes',    document.getElementById('toggle-eyes').checked);
    await window.fp.set('breakWaterMessage', document.getElementById('break-message-water').value.trim());
    await window.fp.set('breakStretchMessage', document.getElementById('break-message-stretch').value.trim());
    await window.fp.set('breakEyesMessage', document.getElementById('break-message-eyes').value.trim());
    await window.fp.set('eodPrompt',    document.getElementById('toggle-eod').checked);
    await window.fp.set('taskConfirmations', document.getElementById('toggle-confirmations').checked);
    await window.fp.set('wordLookupEnabled', document.getElementById('toggle-word-lookup').checked);
    
    // Pomodoro settings
    await window.fp.set('pomodoroSettings', {
      workDuration: parseInt(document.getElementById('pomodoro-work').value) || 25,
      shortBreak: parseInt(document.getElementById('pomodoro-short-break').value) || 5,
      longBreak: parseInt(document.getElementById('pomodoro-long-break').value) || 15,
      cyclesBeforeLong: parseInt(document.getElementById('pomodoro-cycles').value) || 4,
      autoStartBreak: document.getElementById('pomodoro-auto-break').checked,
      autoStartWork: document.getElementById('pomodoro-auto-work').checked,
      strictMode: document.getElementById('pomodoro-strict').checked,
      autoFocusCritical: document.getElementById('focus-auto-critical').checked,
      muteBreaksInFocus: document.getElementById('focus-mute-breaks').checked
    });
    
    // Handle auto-start
    const autoStart = document.getElementById('toggle-startup').checked;
    await window.fp.setAutoStart(autoStart);

    window.fp.notifySettingsUpdated();

    // Toast
    showToast('Saved!');

    setTimeout(() => {
      if (shouldQuitAfterSave) {
        shouldQuitAfterSave = false;
        plannedTaskDate = null;
        window.fp.forceQuit();
      } else {
        window.fp.closeSettings();
      }
    }, 1600);
  }

  // ── Load saved settings ────────────────────────────────────────────────────
  async function loadSettings() {
    await window.FocusPalTheme?.loadAndApply();
    tasks = (await window.fp.get('tasks')) || [];
    const [
      interval,
      waterInterval,
      stretchInterval,
      eyesInterval,
      legacyBreakMessage,
      waterMsg,
      stretchMsg,
      eyesMsg,
      water,
      stretch,
      eyes,
      eod,
      confirmations,
      wordLookupEnabled,
      autoStart,
      notificationSound,
      appTheme
    ] = await Promise.all([
      window.fp.get('breakInterval'),
      window.fp.get('breakWaterInterval'),
      window.fp.get('breakStretchInterval'),
      window.fp.get('breakEyesInterval'),
      window.fp.get('breakMessage'),
      window.fp.get('breakWaterMessage'),
      window.fp.get('breakStretchMessage'),
      window.fp.get('breakEyesMessage'),
      window.fp.get('breakWater'),
      window.fp.get('breakStretch'),
      window.fp.get('breakEyes'),
      window.fp.get('eodPrompt'),
      window.fp.get('taskConfirmations'),
      window.fp.get('wordLookupEnabled'),
      window.fp.getAutoStart(),
      window.fp.get('notificationSound'),
      window.fp.get('appTheme')
    ]);

    setTaskDateInput(plannedTaskDate || getTodayString());
    applyAdaptiveTaskTimeDefaults();
    setBreakIntervalInputs({
      water: clampBreakIntervalValue(waterInterval ?? interval, BREAK_INTERVAL_DEFAULTS.water),
      stretch: clampBreakIntervalValue(stretchInterval ?? interval, BREAK_INTERVAL_DEFAULTS.stretch),
      eyes: clampBreakIntervalValue(eyesInterval ?? interval, BREAK_INTERVAL_DEFAULTS.eyes)
    });
    setNotificationSoundInput(notificationSound);
    setThemeControlValues(appTheme);
    document.getElementById('break-message-water').value = waterMsg || legacyBreakMessage || '';
    document.getElementById('break-message-stretch').value = stretchMsg || '';
    document.getElementById('break-message-eyes').value = eyesMsg || '';

    if (water   !== undefined) document.getElementById('toggle-water').checked      = water;
    if (stretch !== undefined) document.getElementById('toggle-stretch').checked    = stretch;
    if (eyes    !== undefined) document.getElementById('toggle-eyes').checked       = eyes;
    if (eod     !== undefined) document.getElementById('toggle-eod').checked        = eod;
    if (confirmations !== undefined) document.getElementById('toggle-confirmations').checked = confirmations;
    document.getElementById('toggle-word-lookup').checked = wordLookupEnabled !== false;
    if (autoStart !== undefined) document.getElementById('toggle-startup').checked  = autoStart;

    renderTaskList();
    
    // Load pomodoro settings
    const pomodoro = await window.fp.get('pomodoroSettings');
    if (pomodoro) {
      document.getElementById('pomodoro-work').value = pomodoro.workDuration;
      document.getElementById('pomodoro-short-break').value = pomodoro.shortBreak;
      document.getElementById('pomodoro-long-break').value = pomodoro.longBreak;
      document.getElementById('pomodoro-cycles').value = pomodoro.cyclesBeforeLong;
      document.getElementById('pomodoro-auto-break').checked = pomodoro.autoStartBreak;
      document.getElementById('pomodoro-auto-work').checked = pomodoro.autoStartWork;
      document.getElementById('pomodoro-strict').checked = pomodoro.strictMode;
      document.getElementById('focus-auto-critical').checked = pomodoro.autoFocusCritical;
      document.getElementById('focus-mute-breaks').checked = pomodoro.muteBreaksInFocus;
    }
  }

  populateThemePresetOptions();
  setTaskDateInput(plannedTaskDate || getTodayString());
  applyAdaptiveTaskTimeDefaults();
  loadAppVersion();
  window.fp.onLookupSettingUpdated((data) => {
    document.getElementById('toggle-word-lookup').checked = data?.enabled !== false;
  });
  loadSettings();
