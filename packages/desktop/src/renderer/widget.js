// ── State ──────────────────────────────────────────────────────────────────
  const { DEFAULT_NOTIFICATION_SOUND, normalizeNotificationSound } = window.FocusPalRendererUtils;
  const {
    createRecurringTaskInstance,
    getTaskDate,
    getTaskDateTimeMs,
    getTaskDurationMs,
    getTaskEndMs,
    getTaskScheduledEndMs,
    getTaskScheduledStartMs,
    getTaskStartMs,
    getTodayString,
    isResolvedStatus,
    shouldTaskAppearOnDate
  } = window.FocusPalTaskUtils;
  let expanded = false;
  let allTasks = [];
  let tasks = [];
  let taskHistoryEntries = [];
  const BREAK_INTERVAL_DEFAULTS = { water: 45, stretch: 60, eyes: 20 };
  let breakIntervalsMin = { ...BREAK_INTERVAL_DEFAULTS };
  let breakTimer = null;
  let breakDueAtMs = { water: null, stretch: null, eyes: null };
  let activeBreakKey = null;
  let lastBreakScheduleSignature = '';
  let clockInterval = null;
  let tickInterval = null;
  let collapsedTickInterval = null;
  let taskTransitionInterval = null;
  let widgetInactivityTimeout = null;
  let lookupInactivityTimeout = null;
  let taskConfirmationsEnabled = true;
  let notificationSound = DEFAULT_NOTIFICATION_SOUND;
  let lastActiveTaskId = null;
  let taskStartNotified = new Set();
  let snoozedTasks = new Map(); // taskId -> snoozeUntil timestamp
  let taskPromptState = null;
  let taskPromptResolver = null;
  let collapsedMode = 'dot';
  let taskTransitionCheckInFlight = false;
  let currentLookupWord = null;
  let lastLookupFetchAt = 0;
  let wordLookupEnabled = true;
  const WIDGET_INACTIVITY_MS = 10 * 1000;
  const LOOKUP_INACTIVITY_MS = 30 * 1000;
  const LOOKUP_FETCH_GAP_MS = 1000;
  
  // Pomodoro state
  let pomodoroSettings = {
    workDuration: 25,
    shortBreak: 5,
    longBreak: 15,
    cyclesBeforeLong: 4,
    autoStartBreak: true,
    autoStartWork: true,
    strictMode: false,
    autoFocusCritical: false,
    muteBreaksInFocus: false
  };
  let pomodoroActive = false;
  let pomodoroTimer = null;
  let pomodoroTimeRemaining = 0; // in seconds
  let pomodoroMode = 'work'; // 'work', 'shortBreak', 'longBreak'
  let pomodoroCycleCount = 0;
  
  // Focus mode state
  let focusModeActive = false;

  // ── Helpers ────────────────────────────────────────────────────────────────
  function fmt(date) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  function pad(n) { return String(n).padStart(2, '0'); }
  function fmtDuration(ms) {
    if (ms <= 0) return '00:00';
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    if (h > 0) return `${pad(h)}:${pad(m % 60)}:${pad(s % 60)}`;
    return `${pad(m)}:${pad(s % 60)}`;
  }

  function escapeHtml(value = '') {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function timeToMs(timeStr) {
    const [h, m] = timeStr.split(':').map(Number);
    const now = new Date();
    const t = new Date(now);
    t.setHours(h, m, 0, 0);
    
    // Handle times that cross midnight
    if (t < now && now.getHours() > 12 && h < 12) {
      t.setDate(t.getDate() + 1);
    }
    
    return t.getTime();
  }

  function msToTimeString(ms) {
    const date = new Date(ms);
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function getDeferredUntil(taskId, now = Date.now()) {
    const normalizedTaskId = String(taskId);
    const deferredUntil = snoozedTasks.get(normalizedTaskId);

    if (deferredUntil && now < deferredUntil) {
      return deferredUntil;
    }

    if (deferredUntil) {
      snoozedTasks.delete(normalizedTaskId);
    }

    return null;
  }

  function getReadyToStartTask() {
    const now = Date.now();

    return tasks
      .filter((task) => !isResolvedStatus(task.status))
      .filter((task) => task.status !== 'active')
      .filter((task) => !getDeferredUntil(task.id, now))
      .filter((task) => getTaskScheduledStartMs(task) <= now)
      .sort((a, b) => getTaskScheduledStartMs(a) - getTaskScheduledStartMs(b))[0] || null;
  }

  function getActiveTask() {
    const now = Date.now();
    return tasks.find((task) => {
      if (task.status !== 'active') {
        return false;
      }

      return getTaskStartMs(task) <= now && now < getTaskEndMs(task);
    }) || null;
  }

  function getNextTask() {
    const now = Date.now();
    return tasks
      .filter((task) => !isResolvedStatus(task.status))
      .filter((task) => task.status !== 'active')
      .filter((task) => getTaskScheduledStartMs(task) > now)
      .sort((a, b) => getTaskScheduledStartMs(a) - getTaskScheduledStartMs(b))[0] || null;
  }

  function isLookupVisible() {
    return document.getElementById('lookup-card').classList.contains('visible');
  }

  function applyLookupSetting(enabled) {
    wordLookupEnabled = enabled !== false;

    const toggleButton = document.getElementById('btn-lookup-status');
    const dotIndicator = document.querySelector('#dot .lookup-indicator');
    const stateLabel = wordLookupEnabled ? 'active' : 'off';

    toggleButton.classList.toggle('active', wordLookupEnabled);
    toggleButton.title = `Word lookup ${stateLabel}. Click to turn ${wordLookupEnabled ? 'off' : 'on'}.`;
    toggleButton.setAttribute('aria-pressed', wordLookupEnabled ? 'true' : 'false');
    dotIndicator.style.display = wordLookupEnabled ? '' : 'none';
    dotIndicator.title = wordLookupEnabled ? 'Word lookup active' : 'Word lookup off';

    if (!wordLookupEnabled && currentLookupWord) {
      closeLookupCard();
    }
  }

  async function toggleLookupSetting() {
    registerWidgetActivity();
    const previousEnabled = wordLookupEnabled;
    const nextEnabled = !wordLookupEnabled;
    applyLookupSetting(nextEnabled);
    const didSave = await window.fp.set('wordLookupEnabled', nextEnabled);
    if (!didSave) {
      applyLookupSetting(previousEnabled);
      throw new Error('Failed to persist lookup setting');
    }
  }

  function openTaskPrompt(promptState) {
    taskPromptState = { ...promptState };
    clearWidgetInactivityTimer();

    return new Promise((resolve) => {
      taskPromptResolver = resolve;

      if (currentLookupWord) {
        closeLookupCard();
      }

      if (!expanded) {
        toggleExpand();
      } else {
        document.getElementById('dot').style.display = 'none';
        document.getElementById('card').classList.add('visible');
        render();
      }
    });
  }

  function resolveTaskPrompt(result) {
    const resolve = taskPromptResolver;
    taskPromptState = null;
    taskPromptResolver = null;
    render();
    resetWidgetInactivityTimer();

    if (resolve) {
      resolve(result);
    }
  }

  function updateTaskPromptStatus(status) {
    if (!taskPromptState || taskPromptState.type !== 'end') return;
    taskPromptState.selectedStatus = status;
    render();
  }

  function renderTaskPrompt(content) {
    if (!taskPromptState) return false;

    if (taskPromptState.type === 'start') {
      content.innerHTML = `
        <div class="task-prompt">
          <div class="task-prompt-header">
            <div class="task-prompt-title">Ready to start?</div>
            <div class="task-prompt-subtitle">This task is due, but the timer will only begin when you start it.</div>
          </div>
          <div class="task-prompt-task">
            <div class="task-prompt-task-name">${escapeHtml(taskPromptState.name)}</div>
            <div class="task-prompt-meta">${escapeHtml(taskPromptState.startTime)} - ${escapeHtml(taskPromptState.endTime)} · <strong>${escapeHtml(taskPromptState.durationText)}</strong></div>
          </div>
          <div class="task-prompt-actions">
            <button class="task-prompt-btn primary" onclick="resolveTaskPrompt({ action: 'start' })">Start now</button>
            <button class="task-prompt-btn ghost" onclick="resolveTaskPrompt({ action: 'skip' })">Not now</button>
          </div>
        </div>`;
      return true;
    }

    if (taskPromptState.type === 'end') {
      const selectedStatus = taskPromptState.selectedStatus || 'completed';
      const isPartialSelected = selectedStatus === 'partial';
      const promptSubtitle = isPartialSelected
        ? 'Add more time to continue this task. Later tasks will shift automatically if needed.'
        : 'Save the outcome here. Once saved, the task is archived and removed from today’s schedule.';
      const promptActions = isPartialSelected
        ? `
          <div class="task-prompt-extension">
            <div class="task-prompt-extension-label">Add more time</div>
            <div class="task-prompt-extension-options">
              <button class="task-prompt-btn extension" onclick="resolveTaskPrompt({ action: 'extend', minutes: 5 })">+5 min</button>
              <button class="task-prompt-btn extension" onclick="resolveTaskPrompt({ action: 'extend', minutes: 10 })">+10 min</button>
              <button class="task-prompt-btn extension" onclick="resolveTaskPrompt({ action: 'extend', minutes: 15 })">+15 min</button>
            </div>
          </div>`
        : `
          <div class="task-prompt-actions" style="grid-template-columns: 1fr;">
            <button class="task-prompt-btn primary" onclick="resolveTaskPrompt({ status: 'completed' })">Save outcome</button>
          </div>`;

      content.innerHTML = `
        <div class="task-prompt">
          <div class="task-prompt-header">
            <div class="task-prompt-title">How did it go?</div>
            <div class="task-prompt-subtitle">${promptSubtitle}</div>
          </div>
          <div class="task-prompt-task">
            <div class="task-prompt-task-name">${escapeHtml(taskPromptState.name)}</div>
            <div class="task-prompt-meta">Planned <strong>${escapeHtml(taskPromptState.plannedDurationText)}</strong> · Actual <strong>${escapeHtml(taskPromptState.actualDurationText)}</strong></div>
          </div>
          <div class="task-prompt-actions" style="grid-template-columns: 1fr;">
            <button class="task-prompt-btn status ${selectedStatus === 'completed' ? 'active' : ''}" onclick="updateTaskPromptStatus('completed')">
              <strong>Completed</strong>
              <span>Finished as planned</span>
            </button>
            <button class="task-prompt-btn status ${selectedStatus === 'partial' ? 'active' : ''}" onclick="updateTaskPromptStatus('partial')">
              <strong>Partially Done</strong>
              <span>Keep working and push the next task forward</span>
            </button>
          </div>
          ${promptActions}
        </div>`;
      return true;
    }

    return false;
  }

  function hasTaskHistoryForDate(taskId, date, sourceTaskId = null) {
    return taskHistoryEntries.some((entry) => {
      if (entry.date !== date) return false;
      if (String(entry.taskId) === String(taskId)) return true;
      if (sourceTaskId && String(entry.sourceTaskId) === String(sourceTaskId)) return true;
      return false;
    });
  }

  function compareTasksBySchedule(a, b) {
    const startDiff = getTaskScheduledStartMs(a) - getTaskScheduledStartMs(b);
    if (startDiff !== 0) return startDiff;

    const endDiff = getTaskScheduledEndMs(a) - getTaskScheduledEndMs(b);
    if (endDiff !== 0) return endDiff;

    return String(a.id).localeCompare(String(b.id));
  }

  function shiftFollowingTasks(anchorTask) {
    const anchorId = String(anchorTask.id);
    const anchorDate = getTaskDate(anchorTask);
    const orderedTasks = tasks
      .filter((task) => !isResolvedStatus(task.status))
      .filter((task) => getTaskDate(task) === anchorDate)
      .sort(compareTasksBySchedule);

    let pastAnchor = false;
    let previousEndMs = getTaskEndMs(anchorTask);

    for (const task of orderedTasks) {
      if (!pastAnchor) {
        if (String(task.id) === anchorId) {
          pastAnchor = true;
        }
        continue;
      }

      if (task.status === 'active') {
        continue;
      }

      const scheduledStartMs = getTaskScheduledStartMs(task);
      const durationMs = getTaskDurationMs(task);

      if (scheduledStartMs < previousEndMs) {
        const shiftedStartMs = previousEndMs;
        const shiftedEndMs = shiftedStartMs + durationMs;
        task.start = msToTimeString(shiftedStartMs);
        task.end = msToTimeString(shiftedEndMs);
        task.startedAt = null;
        task.actualEndAt = null;
        task.completedAt = null;
        previousEndMs = shiftedEndMs;
      } else {
        previousEndMs = getTaskScheduledEndMs(task);
      }
    }
  }

  function applyCollapsedState({ mode, title, subtitle, priority, urgent }) {
    const dot = document.getElementById('dot');
    const titleEl = document.getElementById('pill-title');
    const timeEl = document.getElementById('pill-time');
    const breakVisible = document.getElementById('break-bar').classList.contains('visible');
    const lookupVisible = isLookupVisible();
    const nextMode = mode === 'pill' ? 'pill' : 'dot';

    titleEl.textContent = title;
    timeEl.textContent = subtitle;

    dot.className = nextMode;

    if (nextMode === 'pill') {
      dot.classList.add('active');
    }

    if (priority) {
      dot.classList.add(`priority-${priority}`);
    }

    if (urgent) {
      dot.classList.add('urgent');
    }

    if (breakVisible) {
      dot.classList.add('break');
    }

    collapsedMode = nextMode;

    if (!expanded && !lookupVisible) {
      window.fp.setCollapsedState(nextMode);
    }
  }

  function updateCollapsedWidget() {
    const active = getActiveTask();

    if (pomodoroActive) {
      const minutes = Math.floor(pomodoroTimeRemaining / 60);
      const seconds = pomodoroTimeRemaining % 60;
      const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
      const label = focusModeActive ? 'Focus' : pomodoroMode === 'work' ? 'Pomodoro' : 'Break';
      applyCollapsedState({
        mode: 'pill',
        title: label,
        subtitle: timeStr,
        priority: pomodoroMode === 'work' ? 'critical' : 'info',
        urgent: pomodoroTimeRemaining <= 5 * 60
      });
      return;
    }

    if (active) {
      const remaining = Math.max(0, getTaskEndMs(active) - Date.now());
      applyCollapsedState({
        mode: 'pill',
        title: focusModeActive ? 'Focus Session' : active.name,
        subtitle: fmtDuration(remaining),
        priority: active.priority || 'medium',
        urgent: remaining <= 5 * 60 * 1000
      });
      return;
    }

    applyCollapsedState({
      mode: 'dot',
      title: 'FocusPal',
      subtitle: 'Idle',
      priority: null,
      urgent: false
    });
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  function render() {
    const active = getActiveTask();
    const readyToStart = getReadyToStartTask();
    const next   = getNextTask();
    const content = document.getElementById('main-content');
    updateCollapsedWidget();

    if (renderTaskPrompt(content)) {
      return;
    }

    // If pomodoro is active, show pomodoro timer
    if (pomodoroActive) {
      const minutes = Math.floor(pomodoroTimeRemaining / 60);
      const seconds = pomodoroTimeRemaining % 60;
      const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
      const modeLabel = pomodoroMode === 'work' ? 'Work' : pomodoroMode === 'shortBreak' ? 'Short Break' : 'Long Break';
      const cycleInfo = pomodoroMode === 'work' ? `Cycle ${pomodoroCycleCount + 1}/${pomodoroSettings.cyclesBeforeLong}` : '';
      
      content.innerHTML = `
        <div id="task-block">
          <div class="task-label">🍅 Pomodoro ${modeLabel}</div>
          <div class="task-name" style="font-size: 32px; font-family: 'DM Mono', monospace; text-align: center; margin: 20px 0;">${timeStr}</div>
          <div class="task-time" style="text-align: center;">${cycleInfo}</div>
        </div>
        <div class="progress-wrap">
          <div class="progress-fill" style="width:${((pomodoroSettings.workDuration * 60 - pomodoroTimeRemaining) / (pomodoroSettings.workDuration * 60) * 100).toFixed(1)}%"></div>
        </div>`;
      return;
    }

    if (!active && !readyToStart && !next && tasks.length === 0) {
      content.innerHTML = `
        <div class="empty-state">
          <strong>No tasks planned</strong>
          Open settings to add your schedule
          <br/>
          <button class="add-btn" onclick="window.fp.openSettings('tasks')">Add tasks</button>
        </div>`;
      return;
    }

    let html = '';

    if (active) {
      const startMs = getTaskStartMs(active);
      const endMs   = getTaskEndMs(active);
      const now     = Date.now();
      const elapsed = now - startMs;
      const total   = endMs - startMs;
      const pct     = Math.min(100, (elapsed / total) * 100).toFixed(1);
      const remaining = endMs - now;

      html += `
        <div id="task-block">
          <div class="task-label">Now active</div>
          <div class="task-name">${active.name}</div>
          <div class="task-time">ends at <span>${active.end}</span> · <span id="remaining">${fmtDuration(remaining)}</span> left</div>
        </div>
        <div class="progress-wrap">
          <div class="progress-fill green" id="prog" style="width:${pct}%"></div>
        </div>`;
    } else if (readyToStart) {
      const scheduledStartMs = getTaskScheduledStartMs(readyToStart);
      const durationMs = getTaskDurationMs(readyToStart);

      html += `
        <div id="task-block">
          <div class="task-label">Ready to start</div>
          <div class="task-name">${readyToStart.name}</div>
          <div class="task-time">scheduled for <span>${readyToStart.start}</span> · duration <span>${fmtDuration(durationMs)}</span></div>
          <div class="task-time" style="margin-top:6px;">waiting for you since <span>${fmtDuration(Date.now() - scheduledStartMs)}</span></div>
          <button class="add-btn" onclick="startTaskNow('${readyToStart.id}')" style="margin-top: 12px;">Start now</button>
        </div>
        <div class="progress-wrap"><div class="progress-fill" style="width:0%"></div></div>`;
    } else {
      html += `
        <div id="task-block">
          <div class="task-label">No active task</div>
          <div class="task-name" style="color:var(--muted); font-weight:400; font-size:13px;">Free time</div>
          <button class="add-btn" onclick="window.fp.openSettings('tasks')" style="margin-top: 12px;">+ Add Task</button>
        </div>
        <div class="progress-wrap"><div class="progress-fill" style="width:0%"></div></div>`;
    }

    if (next && !focusModeActive) {
      const startsIn = getTaskScheduledStartMs(next) - Date.now();
      html += `
        <div id="next-block">
          <div class="next-label">Up next</div>
          <div class="next-name">${next.name}</div>
          <div class="task-time" style="color:var(--muted); font-size:10px; margin-top:2px;">
            ${next.start} – ${next.end} · in <span style="color:var(--accent2)">${fmtDuration(startsIn)}</span>
          </div>
        </div>`;
    }

    content.innerHTML = html;
  }

  function tick() {
    if (taskPromptState) {
      updateCollapsedWidget();
      return;
    }

    render();
    
    // Update remaining timer inline without full re-render
    const active = getActiveTask();
    if (active) {
      const endMs = getTaskEndMs(active);
      const remaining = endMs - Date.now();
      const remEl = document.getElementById('remaining');
      if (remEl) remEl.textContent = fmtDuration(remaining);

      const startMs = getTaskStartMs(active);
      const total   = endMs - startMs;
      const elapsed = Date.now() - startMs;
      const pct     = Math.min(100, (elapsed / total) * 100).toFixed(1);
      const progEl  = document.getElementById('prog');
      if (progEl) progEl.style.width = pct + '%';
    }
  }

  async function startTaskNow(taskId) {
    const normalizedTaskId = String(taskId);
    const task = tasks.find((entry) => String(entry.id) === normalizedTaskId);
    if (!task) return;

    const durationMs = getTaskDurationMs(task);
    const startMs = Date.now();
    const endMs = startMs + durationMs;

    task.start = msToTimeString(startMs);
    task.end = msToTimeString(endMs);
    task.status = 'active';
    task.startedAt = new Date(startMs).toISOString();
    task.actualEndAt = new Date(endMs).toISOString();
    task.completedAt = null;
    task.completionNote = '';

    shiftFollowingTasks(task);

    snoozedTasks.delete(normalizedTaskId);
    taskStartNotified.add(normalizedTaskId);

    await saveTasks();

    hideNotification();

    if (expanded) {
      toggleExpand();
    } else {
      updateCollapsedWidget();
      render();
    }
  }

  async function extendTaskByMinutes(task, minutes) {
    const extraMinutes = Math.max(0, Number(minutes) || 0);
    if (!extraMinutes) {
      return;
    }

    const extensionMs = extraMinutes * 60 * 1000;
    const nextEndMs = Math.max(getTaskEndMs(task), Date.now()) + extensionMs;

    task.status = 'active';
    task.end = msToTimeString(nextEndMs);
    task.actualEndAt = new Date(nextEndMs).toISOString();
    task.completedAt = null;
    task.completionNote = '';

    shiftFollowingTasks(task);
    await saveTasks();
    render();
  }

  function deferTaskStart(taskId, minutes = 1) {
    const normalizedTaskId = String(taskId);
    snoozedTasks.set(normalizedTaskId, Date.now() + minutes * 60 * 1000);
    taskStartNotified.delete(normalizedTaskId);
    render();
  }

  function playTaskTransitionSound() {
    if (notificationSound === 'off') {
      return;
    }

    window.FocusPalNotificationSound?.play(notificationSound);
  }

  async function checkTaskTransitions() {
    if (taskTransitionCheckInFlight) return;
    if (!taskConfirmationsEnabled) return;

    taskTransitionCheckInFlight = true;

    try {
      const active = getActiveTask();
      const activeTaskId = active ? String(active.id) : null;
      const readyToStart = !active ? getReadyToStartTask() : null;
      const readyTaskId = readyToStart ? String(readyToStart.id) : null;
      
      // Task ready to start
      if (!active && readyToStart && !taskStartNotified.has(readyTaskId)) {
        taskStartNotified.add(readyTaskId);
        playTaskTransitionSound();

        const result = await openTaskPrompt({
          type: 'start',
          taskId: readyTaskId,
          name: readyToStart.name,
          startTime: readyToStart.start,
          endTime: readyToStart.end,
          priority: readyToStart.priority || 'medium',
          durationText: fmtDuration(getTaskDurationMs(readyToStart))
        });
        
        if (result.action === 'skip') {
          deferTaskStart(readyTaskId);
        } else if (result.action === 'start') {
          await startTaskNow(readyTaskId);
        } else {
          deferTaskStart(readyTaskId);
        }
      }
      
      // Task ended
      if (lastActiveTaskId && !active && lastActiveTaskId !== activeTaskId) {
        const endedTask = tasks.find(t => String(t.id) === String(lastActiveTaskId));
        if (endedTask && endedTask.status !== 'skipped') {
          const startMs = getTaskStartMs(endedTask);
          const endMs = getTaskEndMs(endedTask);
          const actualDuration = fmtDuration(endMs - startMs);
          playTaskTransitionSound();
          
          const result = await openTaskPrompt({
            type: 'end',
            taskId: String(endedTask.id),
            name: endedTask.name,
            plannedDurationText: fmtDuration(getTaskDurationMs(endedTask)),
            actualDurationText: actualDuration,
            selectedStatus: 'completed'
          });
          
          if (result) {
            if (result.action === 'extend') {
              await extendTaskByMinutes(endedTask, result.minutes);
            } else if (result.status === 'completed') {
              await archiveTaskOutcome(endedTask, result.status);
              console.log(`Task "${endedTask.name}" completed:`, result);
            }
          }
        }
      }
      
      const currentActiveTask = getActiveTask();
      lastActiveTaskId = currentActiveTask ? String(currentActiveTask.id) : null;
    } finally {
      taskTransitionCheckInFlight = false;
    }
  }

  async function saveTasks() {
    const currentIds = new Set(tasks.map(task => task.id));
    const mergedTasks = [
      ...allTasks.filter(task => !currentIds.has(task.id)),
      ...tasks
    ];

    allTasks = mergedTasks;
    await window.fp.set('tasks', mergedTasks);
    window.fp.notifySettingsUpdated();
  }

  async function recordTaskHistory(task) {
    const history = taskHistoryEntries.length ? [...taskHistoryEntries] : (await window.fp.get('taskHistory')) || [];
    const plannedDuration = Math.max(0, getTaskDurationMs(task) / (60 * 1000));
    const entry = {
      taskId: task.id,
      sourceTaskId: task.sourceTaskId || null,
      date: getTaskDate(task),
      status: task.status,
      plannedDuration,
      actualDuration: plannedDuration,
      completionNote: task.completionNote || '',
      focusScore: task.status === 'completed' ? 100 : task.status === 'partial' ? 60 : 0,
      createdAt: new Date().toISOString()
    };

    history.push(entry);
    taskHistoryEntries = history;
    await window.fp.set('taskHistory', history);
  }

  async function removeTaskFromSchedule(taskId) {
    const normalizedTaskId = String(taskId);
    tasks = tasks.filter(task => String(task.id) !== normalizedTaskId);
    allTasks = allTasks.filter(task => String(task.id) !== normalizedTaskId);
    taskStartNotified.delete(normalizedTaskId);
    snoozedTasks.delete(normalizedTaskId);
    if (lastActiveTaskId && String(lastActiveTaskId) === normalizedTaskId) {
      lastActiveTaskId = null;
    }
    await window.fp.set('tasks', allTasks);
    window.fp.notifySettingsUpdated();
    render();
  }

  async function archiveTaskOutcome(task, status, note = '') {
    task.status = status;
    task.completionNote = note;
    task.completedAt = new Date().toISOString();
    await recordTaskHistory(task);
    await removeTaskFromSchedule(task.id);
  }

  function updateClock() {
    document.getElementById('clock').textContent = fmt(new Date());
  }

  // ── Break reminder ─────────────────────────────────────────────────────────
  let breakTypes = { water: true, stretch: false, eyes: false };
  let breakMessages = {
    water: '',
    stretch: '',
    eyes: ''
  };

  function getBreakIntervalMs(key) {
    return Math.max(0, Number(breakIntervalsMin[key]) || 0) * 60 * 1000;
  }

  function getEnabledBreakKeys() {
    return Object.keys(breakTypes).filter((key) => breakTypes[key] && getBreakIntervalMs(key) > 0);
  }

  function getEnabledBreakCount() {
    return getEnabledBreakKeys().length;
  }

  function getBreakScheduleSignature() {
    return ['water', 'stretch', 'eyes'].map((key) =>
      `${key}:${breakTypes[key] ? '1' : '0'}:${Math.max(0, Number(breakIntervalsMin[key]) || 0)}`
    ).join('|');
  }

  function isBreakReminderVisible() {
    return document.getElementById('break-bar').classList.contains('visible');
  }

  function hideBreakReminder() {
    document.getElementById('break-bar').classList.remove('visible');
    document.getElementById('dot').classList.remove('break');
    activeBreakKey = null;
  }

  function breaksMutedRightNow() {
    return focusModeActive && pomodoroSettings.muteBreaksInFocus;
  }

  function scheduleBreak({ reset = false, resetKeys = [] } = {}) {
    if (breakTimer) {
      clearTimeout(breakTimer);
      breakTimer = null;
    }

    const signature = getBreakScheduleSignature();
    const configChanged = signature !== lastBreakScheduleSignature;
    lastBreakScheduleSignature = signature;
    const enabledKeys = getEnabledBreakKeys();

    if (getEnabledBreakCount() === 0) {
      breakDueAtMs = { water: null, stretch: null, eyes: null };
      activeBreakKey = null;
      return;
    }

    const now = Date.now();
    ['water', 'stretch', 'eyes'].forEach((key) => {
      const intervalMs = getBreakIntervalMs(key);
      if (!breakTypes[key] || !intervalMs) {
        breakDueAtMs[key] = null;
        return;
      }

      if (reset || configChanged || resetKeys.includes(key) || !breakDueAtMs[key]) {
        breakDueAtMs[key] = now + intervalMs;
      }
    });

    if (breaksMutedRightNow()) return;
    if (isBreakReminderVisible()) return;

    const nextBreakKey = enabledKeys
      .filter((key) => breakDueAtMs[key])
      .sort((a, b) => breakDueAtMs[a] - breakDueAtMs[b])[0];

    if (!nextBreakKey) {
      return;
    }

    breakTimer = setTimeout(() => {
      breakTimer = null;
      const dueBreaks = getEnabledBreakKeys()
        .filter((key) => breakDueAtMs[key] && breakDueAtMs[key] <= Date.now() + 250)
        .sort((a, b) => breakDueAtMs[a] - breakDueAtMs[b]);

      if (!dueBreaks.length) {
        scheduleBreak();
        return;
      }

      showBreak(dueBreaks[0]);
    }, Math.max(250, breakDueAtMs[nextBreakKey] - now));
  }

  function showBreak(key) {
    if (breaksMutedRightNow()) {
      return;
    }

    const breakLookup = {
      water: { key: 'water', icon: '💧', text: breakMessages.water || 'Time for a water break!' },
      stretch: { key: 'stretch', icon: '🧘', text: breakMessages.stretch || 'Time to stretch and move around!' },
      eyes: { key: 'eyes', icon: '👁️', text: breakMessages.eyes || 'Eye rest: look 20ft away for 20 seconds' }
    };
    const selectedBreak = breakLookup[key];

    if (!selectedBreak || !breakTypes[key]) {
      return;
    }

    const now = Date.now();
    activeBreakKey = key;
    getEnabledBreakKeys().forEach((breakKey) => {
      if (breakKey !== key && breakDueAtMs[breakKey] && breakDueAtMs[breakKey] <= now) {
        breakDueAtMs[breakKey] = now + getBreakIntervalMs(breakKey);
      }
    });

    const icon = selectedBreak.icon;
    const text = selectedBreak.text;
    
    // Show in-app notification
    showNotification(icon, 'Break Reminder', text, 30000);
    
    document.getElementById('break-bar').querySelector('.bb-icon').textContent = icon;
    document.getElementById('break-text').textContent = text;
    document.getElementById('break-bar').classList.add('visible');
    document.getElementById('dot').classList.add('break');
    
    // Auto-expand widget if collapsed
    if (!expanded) toggleExpand();
  }

  document.getElementById('break-dismiss').addEventListener('click', () => {
    const resetKey = activeBreakKey;
    hideBreakReminder();
    scheduleBreak({ resetKeys: resetKey ? [resetKey] : [] });
  });

  // ── Expand / collapse ──────────────────────────────────────────────────────
  function clearWidgetInactivityTimer() {
    if (widgetInactivityTimeout) {
      clearTimeout(widgetInactivityTimeout);
      widgetInactivityTimeout = null;
    }
  }

  function shouldAutoCollapseWidget() {
    return expanded && !taskPromptState && !isBreakReminderVisible() && !isLookupVisible();
  }

  function resetWidgetInactivityTimer() {
    clearWidgetInactivityTimer();

    if (!shouldAutoCollapseWidget()) {
      return;
    }

    widgetInactivityTimeout = setTimeout(() => {
      widgetInactivityTimeout = null;
      if (shouldAutoCollapseWidget()) {
        toggleExpand();
      }
    }, WIDGET_INACTIVITY_MS);
  }

  function registerWidgetActivity() {
    if (!expanded) return;
    resetWidgetInactivityTimer();
  }

  function toggleExpand() {
    expanded = !expanded;
    const dot  = document.getElementById('dot');
    const card = document.getElementById('card');
    if (expanded) {
      dot.style.display  = 'none';
      card.classList.add('visible');
      window.fp.expand();
      render();
      if (!tickInterval)  tickInterval  = setInterval(tick, 1000);
      if (!clockInterval) clockInterval = setInterval(updateClock, 1000);
      updateClock();
      updateCollapsedWidget();
      resetWidgetInactivityTimer();
    } else {
      clearWidgetInactivityTimer();
      updateCollapsedWidget();
      card.classList.remove('visible');
      dot.style.display = 'flex';
      window.fp.collapse();
      clearInterval(tickInterval);  tickInterval  = null;
      clearInterval(clockInterval); clockInterval = null;
    }
  }

  // ── Dragging the dot ───────────────────────────────────────────────────────
  let isDraggingDot = false;
  let hasMoved = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dotStartX = 0;
  let dotStartY = 0;
  const DRAG_THRESHOLD = 5; // pixels to distinguish click from drag

  const dot = document.getElementById('dot');

  dot.addEventListener('mousedown', async (e) => {
    isDraggingDot = true;
    hasMoved = false;
    dragStartX = e.screenX;
    dragStartY = e.screenY;
    const [x, y] = await window.fp.getPosition();
    dotStartX = x;
    dotStartY = y;
    e.preventDefault();
  });

  document.addEventListener('mousemove', async (e) => {
    if (!isDraggingDot) return;
    
    const deltaX = e.screenX - dragStartX;
    const deltaY = e.screenY - dragStartY;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    
    if (distance > DRAG_THRESHOLD) {
      hasMoved = true;
      const newX = dotStartX + deltaX;
      const newY = dotStartY + deltaY;
      await window.fp.setPosition(newX, newY);
    }
  });

  document.addEventListener('mouseup', async (e) => {
    if (isDraggingDot) {
      isDraggingDot = false;
      
      if (hasMoved) {
        // Was a drag - save position
        const [x, y] = await window.fp.getPosition();
        window.fp.savePosition({ x, y });
      } else {
        // Was a click - expand
        toggleExpand();
      }
    }
  });

  const widgetCard = document.getElementById('card');
  widgetCard.addEventListener('pointerdown', registerWidgetActivity);
  widgetCard.addEventListener('mousemove', registerWidgetActivity);
  widgetCard.addEventListener('wheel', registerWidgetActivity, { passive: true });
  widgetCard.addEventListener('touchstart', registerWidgetActivity, { passive: true });

  // ── Load data ──────────────────────────────────────────────────────────────
  async function loadData() {
    await window.FocusPalTheme?.loadAndApply();
    taskHistoryEntries = (await window.fp.get('taskHistory')) || [];
    const storedTasks = (await window.fp.get('tasks')) || [];
    const cleanedTasks = storedTasks.filter((task) => {
      if (!isResolvedStatus(task.status)) {
        return true;
      }

      return task.recurring && task.recurring !== 'none' && !task.instanceDate;
    });

    allTasks = cleanedTasks;
    if (cleanedTasks.length !== storedTasks.length) {
      await window.fp.set('tasks', cleanedTasks);
    }
    
    // Generate recurring task instances for today
    tasks = generateRecurringTasks(allTasks);
    
    const legacyBreakInterval = await window.fp.get('breakInterval');
    breakIntervalsMin.water = (await window.fp.get('breakWaterInterval')) ?? legacyBreakInterval ?? BREAK_INTERVAL_DEFAULTS.water;
    breakIntervalsMin.stretch = (await window.fp.get('breakStretchInterval')) ?? legacyBreakInterval ?? BREAK_INTERVAL_DEFAULTS.stretch;
    breakIntervalsMin.eyes = (await window.fp.get('breakEyesInterval')) ?? legacyBreakInterval ?? BREAK_INTERVAL_DEFAULTS.eyes;
    breakTypes.water   = (await window.fp.get('breakWater'))    ?? true;
    breakTypes.stretch = (await window.fp.get('breakStretch')) ?? false;
    breakTypes.eyes    = (await window.fp.get('breakEyes'))    ?? false;
    const legacyBreakMessage = (await window.fp.get('breakMessage')) || '';
    breakMessages.water = (await window.fp.get('breakWaterMessage')) || legacyBreakMessage;
    breakMessages.stretch = (await window.fp.get('breakStretchMessage')) || '';
    breakMessages.eyes = (await window.fp.get('breakEyesMessage')) || '';
    taskConfirmationsEnabled = (await window.fp.get('taskConfirmations')) ?? true;
    applyLookupSetting((await window.fp.get('wordLookupEnabled')) !== false);
    notificationSound = normalizeNotificationSound(await window.fp.get('notificationSound'));
    
    // Load pomodoro settings
    const savedPomodoro = await window.fp.get('pomodoroSettings');
    if (savedPomodoro) {
      pomodoroSettings = savedPomodoro;
    }
    
    // Auto-activate focus mode for critical tasks
    if (pomodoroSettings.autoFocusCritical) {
      const active = getActiveTask();
      if (active && active.priority === 'critical' && !focusModeActive) {
        toggleFocusMode();
      }
    }
    
    render();
    scheduleBreak();
  }

  function generateRecurringTasks(storedTasks) {
    const todayStr = getTodayString();
    const result = [];

    storedTasks.forEach((task) => {
      if (!shouldTaskAppearOnDate(task, todayStr)) {
        return;
      }

      if (task.recurring && task.recurring !== 'none') {
        const instanceId = `${task.id}_${todayStr}`;
        const existingInstance = storedTasks.find((entry) => String(entry.id) === instanceId);
        const hasRecordedOutcome = hasTaskHistoryForDate(instanceId, todayStr, task.id);

        if (existingInstance) {
          if (!isResolvedStatus(existingInstance.status)) {
            result.push(existingInstance);
          }
          return;
        }

        if (!hasRecordedOutcome) {
          result.push(createRecurringTaskInstance(task, todayStr));
        }
        return;
      }

      if (!isResolvedStatus(task.status)) {
        result.push(task);
      }
    });
    
    return result;
  }

  window.fp.onReloadData(() => loadData());
  loadData();
  if (!collapsedTickInterval) {
    collapsedTickInterval = setInterval(updateCollapsedWidget, 1000);
  }
  if (!taskTransitionInterval) {
    taskTransitionInterval = setInterval(() => {
      checkTaskTransitions();
    }, 1000);
  }
  updateCollapsedWidget();
  checkTaskTransitions();

  // ── Button handlers ────────────────────────────────────────────────────────
  document.getElementById('btn-collapse').addEventListener('click', toggleExpand);
  document.getElementById('btn-lookup-status').addEventListener('click', () => {
    toggleLookupSetting().catch((err) => {
      console.error('Lookup setting toggle error:', err);
    });
  });
  document.getElementById('btn-settings').addEventListener('click', () => window.fp.openSettings());
  document.getElementById('btn-close').addEventListener('click', () => window.fp.quit());

  // ── Dragging (move the window) ─────────────────────────────────────────────
  // The drag-handle uses -webkit-app-region:drag so Electron handles it natively.
  // No JS needed for that strip.

  // ── Word Lookup Feature ────────────────────────────────────────────────────
  async function waitForLookupBudget() {
    const elapsed = Date.now() - lastLookupFetchAt;
    if (elapsed < LOOKUP_FETCH_GAP_MS) {
      await new Promise((resolve) => setTimeout(resolve, LOOKUP_FETCH_GAP_MS - elapsed));
    }
    lastLookupFetchAt = Date.now();
  }

  function adaptLookupPanelSize() {
    requestAnimationFrame(() => {
      const header = document.querySelector('.lookup-header');
      const definitionCol = document.getElementById('lookup-definition-col');
      const translationCol = document.getElementById('lookup-translation-col');
      const word = document.getElementById('lookup-word').textContent || '';

      const contentHeight = Math.max(
        definitionCol?.scrollHeight || 0,
        translationCol?.scrollHeight || 0,
        150
      );
      const desiredHeight = Math.min(400, Math.max(220, Math.ceil((header?.offsetHeight || 54) + contentHeight + 18)));
      const desiredWidth = word.length > 18 ? 620 : 560;

      window.fp.resizeLookup({
        width: desiredWidth,
        height: desiredHeight
      });
    });
  }

  function setLookupContentState(type, html, state = 'content') {
    const element = document.getElementById(`lookup-${type}-content`);
    element.innerHTML = html;

    if (state === 'loading') {
      element.className = 'lookup-loading';
    } else if (state === 'error') {
      element.className = 'lookup-error';
    } else {
      element.className = '';
    }
  }

  async function fetchDefinition(word) {
    try {
      const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
      if (!response.ok) throw new Error('Word not found');

      const data = await response.json();
      const entry = data[0];

      const phonetic = entry.phonetic
        ? `<div class="lookup-phonetic">${escapeHtml(entry.phonetic)}</div>`
        : '';

      const meaningBlocks = (entry.meanings || [])
        .slice(0, 3)
        .map((meaning) => {
          const topDefinition = meaning.definitions?.[0];
          if (!topDefinition?.definition) {
            return '';
          }

          const example = topDefinition.example
            ? `<div class="lookup-example">"${escapeHtml(topDefinition.example)}"</div>`
            : '';

          return `
            <div class="lookup-definition-item">
              <div class="lookup-part-of-speech">${escapeHtml(meaning.partOfSpeech || 'meaning')}</div>
              <div class="lookup-definition">${escapeHtml(topDefinition.definition)}</div>
              ${example}
            </div>
          `;
        })
        .filter(Boolean)
        .join('');

      if (!meaningBlocks) {
        return { html: 'No definition found', state: 'error' };
      }

      return {
        html: `
        ${phonetic}
        <div class="lookup-definition-list">
          ${meaningBlocks}
        </div>
      `,
        state: 'content'
      };
    } catch (err) {
      console.error('Definition fetch error:', err);
      return { html: 'Unable to fetch definition', state: 'error' };
    }
  }

  async function fetchTranslation(word) {
    try {
      const response = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=en|ta`);
      if (!response.ok) throw new Error('Translation failed');

      const data = await response.json();
      const translation = data.responseData?.translatedText;

      if (translation && translation !== word) {
        return {
          html: `
          <div class="lookup-translation-wrap">
            <div class="lookup-translation-card">
              <div class="lookup-translation-main">${escapeHtml(translation)}</div>
              <div class="lookup-translation-sub">Tamil translation for "${escapeHtml(word)}"</div>
            </div>
          </div>
        `,
          state: 'content'
        };
      }

      return { html: 'No translation available', state: 'error' };
    } catch (err) {
      console.error('Translation fetch error:', err);
      return { html: 'Unable to fetch translation', state: 'error' };
    }
  }

  async function showLookupCard(word) {
    if (!wordLookupEnabled) {
      return;
    }

    currentLookupWord = word;
    clearWidgetInactivityTimer();

    document.getElementById('dot').style.display = 'none';
    document.getElementById('card').classList.remove('visible');

    const lookupCard = document.getElementById('lookup-card');
    const isFreshOpen = !lookupCard.classList.contains('visible');

    lookupCard.classList.add('visible');
    document.getElementById('lookup-word').textContent = word;
    setLookupContentState('definition', 'Loading...', 'loading');
    setLookupContentState('translation', 'Loading...', 'loading');

    if (isFreshOpen) {
      window.fp.openLookup();
    }
    adaptLookupPanelSize();

    await waitForLookupBudget();

    const [definitionResult, translationResult] = await Promise.all([
      fetchDefinition(word),
      fetchTranslation(word)
    ]);

    if (currentLookupWord !== word) {
      return;
    }

    setLookupContentState('definition', definitionResult.html, definitionResult.state);
    setLookupContentState('translation', translationResult.html, translationResult.state);
    adaptLookupPanelSize();
    resetLookupInactivityTimer();
  }

  function closeLookupCard() {
    if (!isLookupVisible()) {
      currentLookupWord = null;
      return;
    }

    document.getElementById('lookup-card').classList.remove('visible');
    currentLookupWord = null;

    if (lookupInactivityTimeout) {
      clearTimeout(lookupInactivityTimeout);
      lookupInactivityTimeout = null;
    }

    window.fp.closeLookup(expanded ? 'expanded' : 'collapsed');
  }

  function resetLookupInactivityTimer() {
    if (lookupInactivityTimeout) {
      clearTimeout(lookupInactivityTimeout);
    }

    lookupInactivityTimeout = setTimeout(() => {
      closeLookupCard();
    }, LOOKUP_INACTIVITY_MS);
  }

  document.getElementById('lookup-close').addEventListener('click', () => {
    closeLookupCard();
  });

  const lookupCard = document.getElementById('lookup-card');
  const keepLookupAlive = () => {
    if (currentLookupWord) {
      resetLookupInactivityTimer();
    }
  };
  lookupCard.addEventListener('pointerdown', keepLookupAlive);
  lookupCard.addEventListener('mousemove', keepLookupAlive);
  lookupCard.addEventListener('wheel', keepLookupAlive, { passive: true });
  lookupCard.addEventListener('touchstart', keepLookupAlive, { passive: true });

  window.fp.onLookupRequested(async (data) => {
    if (wordLookupEnabled && data?.word) {
      await showLookupCard(data.word);
    }
  });

  window.fp.onLookupSettingUpdated((data) => {
    applyLookupSetting(data?.enabled !== false);
  });

  window.fp.onLookupClosed(() => {
    if (taskPromptState || expanded) {
      document.getElementById('card').classList.add('visible');
      document.getElementById('dot').style.display = 'none';
    } else {
      document.getElementById('dot').style.display = 'flex';
      document.getElementById('card').classList.remove('visible');
    }

    resetWidgetInactivityTimer();
  });

  window.fp.onWordCleared(() => {
    if (currentLookupWord) {
      closeLookupCard();
    }
  });

  // ── In-app Notifications ───────────────────────────────────────────────────
  let notificationTimeout = null;

  function showNotification(icon, title, message, duration = 30000) {
    const notification = document.getElementById('notification');
    const iconEl = document.getElementById('notification-icon');
    const titleEl = document.getElementById('notification-title');
    const bodyEl = document.getElementById('notification-body');
    
    iconEl.textContent = icon;
    titleEl.textContent = title;
    bodyEl.textContent = message;
    
    notification.classList.add('show');
    window.FocusPalNotificationSound?.play(notificationSound);
    
    // Clear existing timeout
    if (notificationTimeout) {
      clearTimeout(notificationTimeout);
    }
    
    // Auto-dismiss after duration
    notificationTimeout = setTimeout(() => {
      hideNotification();
    }, duration);
  }

  function hideNotification() {
    const notification = document.getElementById('notification');
    notification.classList.remove('show');
    
    if (notificationTimeout) {
      clearTimeout(notificationTimeout);
      notificationTimeout = null;
    }
  }

  document.getElementById('notification-close').addEventListener('click', () => {
    hideNotification();
  });

  // Listen for notifications from main process
  window.fp.onShowNotification((data) => {
    showNotification(data.icon, data.title, data.message, data.duration);
  });

  window.fp.onFocusModeShortcut(() => {
    toggleFocusMode();
  });

  // ── Pomodoro Timer ─────────────────────────────────────────────────────────
  
  function startPomodoro() {
    if (pomodoroActive) {
      stopPomodoro();
      return;
    }
    
    pomodoroActive = true;
    pomodoroMode = 'work';
    pomodoroTimeRemaining = pomodoroSettings.workDuration * 60;
    pomodoroCycleCount = 0;
    
    document.getElementById('btn-pomodoro').classList.add('active');
    
    hideNotification();
    if (expanded) {
      toggleExpand();
    }
    updateCollapsedWidget();
    render();
    
    pomodoroTimer = setInterval(() => {
      pomodoroTimeRemaining--;
      
      if (pomodoroTimeRemaining <= 0) {
        pomodoroComplete();
      }
      
      // Update display if needed
      render();
    }, 1000);
  }
  
  function stopPomodoro() {
    pomodoroActive = false;
    if (pomodoroTimer) {
      clearInterval(pomodoroTimer);
      pomodoroTimer = null;
    }
    
    document.getElementById('btn-pomodoro').classList.remove('active');
    hideNotification();
    if (!getActiveTask()) {
      window.fp.setCollapsedState('dot');
    }
    updateCollapsedWidget();
    render();
  }
  
  function pomodoroComplete() {
    clearInterval(pomodoroTimer);
    
    if (pomodoroMode === 'work') {
      pomodoroCycleCount++;
      
      // Determine break type
      if (pomodoroCycleCount >= pomodoroSettings.cyclesBeforeLong) {
        pomodoroMode = 'longBreak';
        pomodoroTimeRemaining = pomodoroSettings.longBreak * 60;
        pomodoroCycleCount = 0;
      } else {
        pomodoroMode = 'shortBreak';
        pomodoroTimeRemaining = pomodoroSettings.shortBreak * 60;
      }
      
      if (pomodoroSettings.autoStartBreak) {
        pomodoroTimer = setInterval(() => {
          pomodoroTimeRemaining--;
          if (pomodoroTimeRemaining <= 0) {
            pomodoroComplete();
          }
          render();
        }, 1000);
      } else {
        pomodoroActive = false;
        document.getElementById('btn-pomodoro').classList.remove('active');
        if (!getActiveTask()) {
          window.fp.setCollapsedState('dot');
        }
      }
    } else {
      // Break complete, start work
      pomodoroMode = 'work';
      pomodoroTimeRemaining = pomodoroSettings.workDuration * 60;
      
      if (pomodoroSettings.autoStartWork) {
        pomodoroTimer = setInterval(() => {
          pomodoroTimeRemaining--;
          if (pomodoroTimeRemaining <= 0) {
            pomodoroComplete();
          }
          render();
        }, 1000);
      } else {
        pomodoroActive = false;
        document.getElementById('btn-pomodoro').classList.remove('active');
        if (!getActiveTask()) {
          window.fp.setCollapsedState('dot');
        }
      }
    }

    hideNotification();
    updateCollapsedWidget();
    render();
  }
  
  // ── Focus Mode ─────────────────────────────────────────────────────────────
  
  function toggleFocusMode() {
    focusModeActive = !focusModeActive;
    
    const btn = document.getElementById('btn-focus');
    const card = document.getElementById('card');
    const nextBlock = document.getElementById('next-block');
    
    if (focusModeActive) {
      if (expanded) {
        toggleExpand();
      }
      btn.classList.add('focus-active');
      card.style.opacity = '0.95';
      if (nextBlock) nextBlock.style.display = 'none';
      
      // Enable system DND
      window.fp.toggleSystemDND(true).catch(err => {
        console.error('Focus mode enable error:', err);
      });
      
      // Mute breaks if enabled
      if (pomodoroSettings.muteBreaksInFocus) {
        if (breakTimer) {
          clearTimeout(breakTimer);
          breakTimer = null;
        }
        breakDueAtMs = { water: null, stretch: null, eyes: null };
        hideBreakReminder();
      }
    } else {
      btn.classList.remove('focus-active');
      card.style.opacity = '1';
      if (nextBlock) nextBlock.style.display = 'block';
      
      // Disable system DND
      window.fp.toggleSystemDND(false).catch(err => {
        console.error('Focus mode disable error:', err);
      });
      
      // Resume breaks
      if (pomodoroSettings.muteBreaksInFocus) {
        scheduleBreak({ reset: true });
      }
    }

    updateCollapsedWidget();
  }
  
  // Keyboard shortcut: Ctrl+Shift+F
  document.addEventListener('keydown', (e) => {
    registerWidgetActivity();
    if (e.ctrlKey && e.shiftKey && e.key === 'F') {
      e.preventDefault();
      toggleFocusMode();
    }
  });
  
  // Button handlers
  document.getElementById('btn-pomodoro').addEventListener('click', startPomodoro);
  document.getElementById('btn-focus').addEventListener('click', toggleFocusMode);
