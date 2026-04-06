  const { formatRelativeDateLabel } = window.FocusPalDateUtils;
  const { normalizeNotificationSound } = window.FocusPalRendererUtils;
  const { generateTaskId, getTodayString, shouldTaskAppearOnDate } = window.FocusPalTaskUtils;
  let shouldQuitAfterSave = false;
  let plannedTaskDate = null;

  function formatTaskDateLabel(dateString) {
    return formatRelativeDateLabel(dateString);
  }

  function setTaskDateInput(date = getTodayString()) {
    document.getElementById('task-date').value = date;
    document.getElementById('task-date-display').textContent = formatTaskDateLabel(date);
  }

  function setBreakIntervalInput(value) {
    const normalized = String(value ?? 45);
    const input = document.getElementById('break-interval');
    input.value = normalized;
    input.defaultValue = normalized;
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

  // ── Time picker ────────────────────────────────────────────────────────────
  let timeFormat = '12'; // 12 or 24
  let currentTimeTarget = null; // 'start' or 'end'
  let selectedHour = 9;
  let selectedMinute = 0;
  let selectedPeriod = 'AM';
  const TIME_WHEEL_ITEM_HEIGHT = 44;
  const TIME_WHEEL_SPACERS = 2;
  const TIME_WHEEL_REPEATS = 7;
  const timeWheelSnapTimers = new Map();

  function buildWheelItems(values, formatter = (value) => value, repeatCount = 1) {
    const spacers = Array.from({ length: TIME_WHEEL_SPACERS }, () =>
      '<div class="time-wheel-item spacer" aria-hidden="true"></div>'
    ).join('');

    const items = Array.from({ length: repeatCount }, (_, repeatIndex) =>
      values.map((value, baseIndex) => {
        const virtualIndex = repeatIndex * values.length + baseIndex;
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
    return Math.floor(getWheelRepeatCount(wheel) / 2) * getWheelBaseCount(wheel)
      + getWrappedWheelIndex(wheel, index);
  }

  function getSelectedWheelIndex(wheel) {
    const currentIndex = Number(wheel.dataset.selectedIndex);
    if (Number.isFinite(currentIndex)) {
      return getClampedWheelIndex(wheel, currentIndex);
    }

    return getWheelMiddleIndex(wheel);
  }

  function getSelectedWheelBaseIndex(wheel) {
    const currentIndex = Number(wheel.dataset.selectedBaseIndex);
    if (Number.isFinite(currentIndex)) {
      return getWrappedWheelIndex(wheel, currentIndex);
    }

    return getWrappedWheelIndex(wheel, getSelectedWheelIndex(wheel));
  }

  function setSelectedValueFromItem(wheelId, item) {
    if (!item) return;

    if (wheelId === 'hour-wheel') {
      selectedHour = parseInt(item.dataset.value, 10);
    } else if (wheelId === 'minute-wheel') {
      selectedMinute = parseInt(item.dataset.value, 10);
    } else if (wheelId === 'period-wheel') {
      selectedPeriod = item.dataset.value;
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
      ? Math.round(wheel.scrollTop / TIME_WHEEL_ITEM_HEIGHT)
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
      wheel.scrollTop = centeredIndex * TIME_WHEEL_ITEM_HEIGHT;
      return centeredIndex;
    }

    return clampedIndex;
  }

  function scrollWheelToIndex(wheel, index, behavior = 'smooth') {
    const nextIndex = getClampedWheelIndex(wheel, index);
    wheel.dataset.selectedIndex = String(nextIndex);
    wheel.dataset.selectedBaseIndex = String(getWrappedWheelIndex(wheel, nextIndex));
    wheel.scrollTo({ top: nextIndex * TIME_WHEEL_ITEM_HEIGHT, behavior });
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

  function normalizeSelectedHourForFormat() {
    if (timeFormat === '12') {
      if (selectedHour < 1 || selectedHour > 12) {
        const normalized = ((selectedHour % 12) + 12) % 12;
        selectedHour = normalized === 0 ? 12 : normalized;
      }
    } else if (selectedHour < 0 || selectedHour > 23) {
      selectedHour = ((selectedHour % 24) + 24) % 24;
    }
  }

  function convertTimeFormat(nextFormat) {
    if (timeFormat === nextFormat) return;

    if (nextFormat === '24') {
      let hour24 = selectedHour % 12;
      if (selectedPeriod === 'PM') hour24 += 12;
      if (selectedPeriod === 'AM' && selectedHour === 12) hour24 = 0;
      selectedHour = hour24;
    } else {
      selectedPeriod = selectedHour >= 12 ? 'PM' : 'AM';
      selectedHour = selectedHour === 0 ? 12 : selectedHour > 12 ? selectedHour - 12 : selectedHour;
    }

    timeFormat = nextFormat;
    normalizeSelectedHourForFormat();
  }

  function initTimePicker() {
    const hourWheel = document.getElementById('hour-wheel');
    const minuteWheel = document.getElementById('minute-wheel');
    const periodWheel = document.getElementById('period-wheel');

    // Generate hours
    const hours = timeFormat === '12' ? Array.from({length: 12}, (_, i) => i + 1) : Array.from({length: 24}, (_, i) => i);
    renderWheel(hourWheel, hours, (h) => String(h).padStart(2, '0'));

    // Generate minutes (full 0-59 range)
    const minutes = Array.from({length: 60}, (_, i) => i);
    renderWheel(minuteWheel, minutes, (m) => String(m).padStart(2, '0'));

    // Generate period (AM/PM) for 12-hour format
    if (timeFormat === '12') {
      periodWheel.style.display = 'block';
      renderWheel(periodWheel, ['AM', 'PM']);
    } else {
      periodWheel.style.display = 'none';
      periodWheel.innerHTML = '';
      delete periodWheel.dataset.baseCount;
      delete periodWheel.dataset.repeatCount;
      delete periodWheel.dataset.selectedIndex;
      delete periodWheel.dataset.selectedBaseIndex;
    }

    [hourWheel, minuteWheel, periodWheel].forEach(attachWheelInteractions);

    requestAnimationFrame(() => {
      scrollToValue(hourWheel, selectedHour, 'auto');
      scrollToValue(minuteWheel, selectedMinute, 'auto');
      if (timeFormat === '12') scrollToValue(periodWheel, selectedPeriod, 'auto');
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

  function updateSelectedItems(wheel, forcedIndex = null) {
    if (!wheel || wheel.style.display === 'none') return;

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
  }

  function openTimePicker(target) {
    currentTimeTarget = target;
    const modal = document.getElementById('time-picker-modal');
    const title = document.getElementById('time-picker-title');
    
    title.textContent = target === 'start' ? 'Start Time' : 'End Time';
    
    // Parse current time
    const currentTime = target === 'start' 
      ? document.getElementById('start-time-display').textContent 
      : document.getElementById('end-time-display').textContent;
    
    const [hourStr, minuteStr] = currentTime.split(':');
    let hour = parseInt(hourStr);
    const minute = parseInt(minuteStr);
    
    if (timeFormat === '12') {
      selectedPeriod = hour >= 12 ? 'PM' : 'AM';
      selectedHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    } else {
      selectedHour = hour;
    }
    selectedMinute = Math.min(Math.max(minute, 0), 59);
    
    modal.classList.add('show');
    initTimePicker();
  }

  function closeTimePicker(save) {
    const modal = document.getElementById('time-picker-modal');

    timeWheelSnapTimers.forEach(timer => clearTimeout(timer));
    timeWheelSnapTimers.clear();
    
    if (save) {
      let hour = selectedHour;
      const minute = selectedMinute;

      if (timeFormat === '12') {
        if (selectedPeriod === 'PM' && hour !== 12) hour += 12;
        if (selectedPeriod === 'AM' && hour === 12) hour = 0;
      }

      const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

      if (currentTimeTarget === 'start') {
        document.getElementById('start-time-display').textContent = timeStr;
      } else {
        document.getElementById('end-time-display').textContent = timeStr;
      }
    }
    
    modal.classList.remove('show');
  }

  // Time picker event listeners
  document.getElementById('task-date-trigger').addEventListener('click', () => {
    const dateInput = document.getElementById('task-date');
    if (typeof dateInput.showPicker === 'function') {
      dateInput.showPicker();
    } else {
      dateInput.focus();
      dateInput.click();
    }
  });
  document.getElementById('task-date').addEventListener('change', (event) => {
    setTaskDateInput(event.target.value || getTodayString());
  });
  document.getElementById('start-time-trigger').addEventListener('click', () => openTimePicker('start'));
  document.getElementById('end-time-trigger').addEventListener('click', () => openTimePicker('end'));
  document.getElementById('time-picker-cancel').addEventListener('click', () => closeTimePicker(false));
  document.getElementById('time-picker-confirm').addEventListener('click', () => closeTimePicker(true));
  
    // Format toggle
  document.querySelectorAll('.format-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.format-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      convertTimeFormat(btn.dataset.format);
      initTimePicker();
    });
  });

  // Close modal on background click
  document.getElementById('time-picker-modal').addEventListener('click', (e) => {
    if (e.target.id === 'time-picker-modal') {
      closeTimePicker(false);
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

  function renderTaskList() {
    const list = document.getElementById('task-list');
    const todayTasks = tasks.filter(isTaskForToday);

    if (todayTasks.length === 0) {
      list.innerHTML = '<div style="color:var(--muted); font-size:12px; text-align:center; padding:12px 0;">No tasks yet — add one below</div>';
      return;
    }
    // Sort by start time
    const sorted = [...todayTasks].sort((a, b) => a.start.localeCompare(b.start));
    list.innerHTML = sorted.map((t) => {
      const recurringLabel = t.recurring && t.recurring !== 'none' 
        ? `<span style="font-size:9px; color:var(--muted); margin-left:4px;">↻ ${t.recurring}</span>` 
        : '';
      return `
      <div class="task-item">
        <div class="task-color-dot" style="background:${t.color || '#7c6cfc'}"></div>
        <div class="task-item-info">
          <div class="task-item-name">${t.name}${recurringLabel}</div>
          <div class="task-item-time">${t.start} – ${t.end}</div>
        </div>
        <button class="task-delete" onclick="handleDeleteTask('${t.id}')" title="Remove">✕</button>
      </div>`;
    }).join('');
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
    document.getElementById('start-time-display').textContent = '09:00';
    document.getElementById('end-time-display').textContent = '10:00';
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
    const breakInterval = parseInt(document.getElementById('break-interval').value, 10) || 45;
    const notificationSound = normalizeNotificationSound(document.getElementById('notification-sound').value);
    const appTheme = window.FocusPalTheme?.normalizeSettings(getThemeSettingsFromControls()) || { preset: 'focuspal' };

    await window.fp.set('tasks', tasks);
    await window.fp.set('breakInterval', breakInterval);
    await window.fp.set('notificationSound', notificationSound);
    await window.fp.set('appTheme', appTheme);
    setBreakIntervalInput(breakInterval);
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
    setBreakIntervalInput(interval ?? 45);
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
  window.fp.onLookupSettingUpdated((data) => {
    document.getElementById('toggle-word-lookup').checked = data?.enabled !== false;
  });
  loadSettings();
