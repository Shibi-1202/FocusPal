// ── State ──────────────────────────────────────────────────────────────────
  let expanded = false;
  let allTasks = [];
  let tasks = [];
  let taskHistoryEntries = [];
  let breakIntervalMin = 45;
  let breakTimer = null;
  let clockInterval = null;
  let tickInterval = null;
  let collapsedTickInterval = null;
  let taskTransitionInterval = null;
  let taskConfirmationsEnabled = true;
  let lastActiveTaskId = null;
  let taskStartNotified = new Set();
  let snoozedTasks = new Map(); // taskId -> snoozeUntil timestamp
  let taskPromptState = null;
  let taskPromptResolver = null;
  let collapsedMode = 'dot';
  let taskTransitionCheckInFlight = false;
  
  // Word lookup state
  let lookupInactivityTimeout = null;
  let currentLookupWord = null;
  let wordCache = new Map(); // word -> {definition, translation, timestamp}
  let maxCacheSize = 20;
  let lastLookupFetchAt = 0;
  const LOOKUP_CACHE_VERSION = 2;
  
  let taskWarningPlayed = new Set(); // Track which tasks have played warning
  
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

  function getTaskDurationMs(task) {
    return Math.max(60 * 1000, timeToMs(task.end) - timeToMs(task.start));
  }

  function getTaskStartMs(task) {
    if (task.startedAt) {
      const startedMs = new Date(task.startedAt).getTime();
      if (!Number.isNaN(startedMs)) {
        return startedMs;
      }
    }

    return timeToMs(task.start);
  }

  function getTaskEndMs(task) {
    if (task.actualEndAt) {
      const endMs = new Date(task.actualEndAt).getTime();
      if (!Number.isNaN(endMs)) {
        return endMs;
      }
    }

    return timeToMs(task.end);
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
      .filter((task) => timeToMs(task.start) <= now)
      .sort((a, b) => timeToMs(a.start) - timeToMs(b.start))[0] || null;
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
      .filter((task) => timeToMs(task.start) > now)
      .sort((a, b) => timeToMs(a.start) - timeToMs(b.start))[0] || null;
  }

  function isResolvedStatus(status) {
    return status === 'completed' || status === 'partial' || status === 'skipped';
  }

  function getTaskDate(task) {
    return task.instanceDate || task.taskDate || new Date().toISOString().split('T')[0];
  }

  function openTaskPrompt(promptState) {
    taskPromptState = { ...promptState };

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

    if (resolve) {
      resolve(result);
    }
  }

  function updateTaskPromptStatus(status) {
    if (!taskPromptState || taskPromptState.type !== 'end') return;
    taskPromptState.selectedStatus = status;
    render();
  }

  function updateTaskPromptNote(value) {
    if (!taskPromptState || taskPromptState.type !== 'end') return;
    taskPromptState.note = value;
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
      const note = escapeHtml(taskPromptState.note || '');

      content.innerHTML = `
        <div class="task-prompt">
          <div class="task-prompt-header">
            <div class="task-prompt-title">How did it go?</div>
            <div class="task-prompt-subtitle">Save the outcome here. Once saved, the task is archived and removed from today’s schedule.</div>
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
              <span>Made progress, but not all of it</span>
            </button>
            <button class="task-prompt-btn status ${selectedStatus === 'skipped' ? 'active' : ''}" onclick="updateTaskPromptStatus('skipped')">
              <strong>Didn’t Start</strong>
              <span>Couldn’t begin the task today</span>
            </button>
          </div>
          <div class="task-prompt-label">Quick note</div>
          <textarea class="task-prompt-note" placeholder="How did it go? Any blockers?" oninput="updateTaskPromptNote(this.value)">${note}</textarea>
          <div class="task-prompt-actions" style="grid-template-columns: 1fr;">
            <button class="task-prompt-btn primary" onclick="resolveTaskPrompt({ status: '${selectedStatus}', note: taskPromptState ? (taskPromptState.note || '') : '' })">Save outcome</button>
          </div>
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

  function applyCollapsedState({ mode, title, subtitle, priority, urgent }) {
    const dot = document.getElementById('dot');
    const titleEl = document.getElementById('pill-title');
    const timeEl = document.getElementById('pill-time');
    const breakVisible = document.getElementById('break-bar').classList.contains('visible');
    const lookupVisible = document.getElementById('lookup-card').classList.contains('visible');
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
      const scheduledStartMs = timeToMs(readyToStart.start);
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
      const startsIn = timeToMs(next.start) - Date.now();
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

    snoozedTasks.delete(normalizedTaskId);
    taskStartNotified.add(normalizedTaskId);

    await saveTasks();
    render();
  }

  function deferTaskStart(taskId, minutes = 1) {
    const normalizedTaskId = String(taskId);
    snoozedTasks.set(normalizedTaskId, Date.now() + minutes * 60 * 1000);
    taskStartNotified.delete(normalizedTaskId);
    render();
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
      
      // Task ending soon (5 minutes warning)
      if (active && !taskWarningPlayed.has(activeTaskId)) {
        const endMs = getTaskEndMs(active);
        const remaining = endMs - Date.now();
        const fiveMinutes = 5 * 60 * 1000;
        
        if (remaining <= fiveMinutes && remaining > 0) {
          taskWarningPlayed.add(activeTaskId);
          
          // Show notification
          showNotification(
            '⏰',
            'Task Ending Soon',
            `"${active.name}" ends in 5 minutes`,
            10000
          );
          
        }
      }

      // Task ended
      if (lastActiveTaskId && !active && lastActiveTaskId !== activeTaskId) {
        const endedTask = tasks.find(t => String(t.id) === String(lastActiveTaskId));
        if (endedTask && endedTask.status !== 'skipped') {
          const startMs = getTaskStartMs(endedTask);
          const endMs = getTaskEndMs(endedTask);
          const actualDuration = fmtDuration(endMs - startMs);
          
          const result = await openTaskPrompt({
            type: 'end',
            taskId: String(endedTask.id),
            name: endedTask.name,
            plannedDurationText: fmtDuration(getTaskDurationMs(endedTask)),
            actualDurationText: actualDuration,
            selectedStatus: 'completed',
            note: ''
          });
          
          if (result) {
            await archiveTaskOutcome(endedTask, result.status, result.note || '');
            console.log(`Task "${endedTask.name}" completed:`, result);
          }
        }
        
        // Clear warning flag for ended task
        taskWarningPlayed.delete(lastActiveTaskId);
      }
      
      lastActiveTaskId = activeTaskId;
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
    const plannedDuration = Math.max(0, (timeToMs(task.end) - timeToMs(task.start)) / (60 * 1000));
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
    taskWarningPlayed.delete(normalizedTaskId);
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

  function scheduleBreak() {
    if (breakTimer) clearTimeout(breakTimer);
    if (!breakIntervalMin || breakIntervalMin <= 0) return;
    breakTimer = setTimeout(() => {
      showBreak();
    }, breakIntervalMin * 60 * 1000);
  }

  function showBreak() {
    const enabledBreaks = [
      breakTypes.water ? { key: 'water', icon: '💧', text: breakMessages.water || 'Time for a water break!' } : null,
      breakTypes.stretch ? { key: 'stretch', icon: '🧘', text: breakMessages.stretch || 'Time to stretch and move around!' } : null,
      breakTypes.eyes ? { key: 'eyes', icon: '👁️', text: breakMessages.eyes || 'Eye rest: look 20ft away for 20 seconds' } : null
    ].filter(Boolean);

    if (enabledBreaks.length === 0) {
      return;
    }

    const selectedBreak = enabledBreaks[Math.floor(Math.random() * enabledBreaks.length)];
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
    document.getElementById('break-bar').classList.remove('visible');
    document.getElementById('dot').classList.remove('break');
    scheduleBreak(); // restart countdown
  });

  // ── Expand / collapse ──────────────────────────────────────────────────────
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
    } else {
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

  // ── Load data ──────────────────────────────────────────────────────────────
  async function loadData() {
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
    
    breakIntervalMin = (await window.fp.get('breakInterval'))   ?? 45;
    breakTypes.water   = (await window.fp.get('breakWater'))    ?? true;
    breakTypes.stretch = (await window.fp.get('breakStretch')) ?? false;
    breakTypes.eyes    = (await window.fp.get('breakEyes'))    ?? false;
    const legacyBreakMessage = (await window.fp.get('breakMessage')) || '';
    breakMessages.water = (await window.fp.get('breakWaterMessage')) || legacyBreakMessage;
    breakMessages.stretch = (await window.fp.get('breakStretchMessage')) || '';
    breakMessages.eyes = (await window.fp.get('breakEyesMessage')) || '';
    taskConfirmationsEnabled = (await window.fp.get('taskConfirmations')) ?? true;
    
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
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 = Sunday, 6 = Saturday
    const todayStr = today.toISOString().split('T')[0];
    
    const result = [];
    
    storedTasks.forEach(task => {
      // Check if task should appear today based on recurring pattern
      let shouldInclude = false;
      
      if (!task.recurring || task.recurring === 'none') {
        const scheduledDate = task.instanceDate || task.taskDate;
        shouldInclude = !scheduledDate || scheduledDate === todayStr;
      } else if (task.recurring === 'daily') {
        shouldInclude = true;
      } else if (task.recurring === 'weekdays') {
        // Monday = 1, Friday = 5
        shouldInclude = dayOfWeek >= 1 && dayOfWeek <= 5;
      } else if (task.recurring === 'weekends') {
        // Saturday = 6, Sunday = 0
        shouldInclude = dayOfWeek === 0 || dayOfWeek === 6;
      }
      
      if (shouldInclude) {
        // Create instance for today if it doesn't already exist
        const instanceId = `${task.id}_${todayStr}`;
        const existingInstance = storedTasks.find(t => t.id === instanceId);
        const hasRecordedOutcome = hasTaskHistoryForDate(instanceId, todayStr, task.id);
        
        if (existingInstance) {
          if (!isResolvedStatus(existingInstance.status)) {
            result.push(existingInstance);
          }
        } else if (hasRecordedOutcome) {
          return;
        } else if (task.recurring && task.recurring !== 'none') {
          // Create new instance for recurring task
          result.push({
            ...task,
            id: instanceId,
            sourceTaskId: task.id,
            status: 'pending',
            completionNote: '',
            completedAt: null,
            instanceDate: todayStr,
            taskDate: todayStr
          });
        } else {
          // Non-recurring task
          if (!isResolvedStatus(task.status)) {
            result.push(task);
          }
        }
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
  document.getElementById('btn-settings').addEventListener('click', () => window.fp.openSettings());
  document.getElementById('btn-close').addEventListener('click', () => window.fp.quit());

  // ── Dragging (move the window) ─────────────────────────────────────────────
  // The drag-handle uses -webkit-app-region:drag so Electron handles it natively.
  // No JS needed for that strip.

  // ── Word Lookup Feature ────────────────────────────────────────────────────

  async function waitForLookupBudget() {
    const elapsed = Date.now() - lastLookupFetchAt;
    if (elapsed < 1000) {
      await new Promise((resolve) => setTimeout(resolve, 1000 - elapsed));
    }
    lastLookupFetchAt = Date.now();
  }

  async function syncWordCacheEntry(word, definition, translation) {
    const result = await window.fp.api.request('POST', '/api/word-lookup/cache', {
      word,
      definition,
      translation
    });

    if (!result?.success) {
      console.error('Word cache sync error:', result?.error || 'Unknown sync failure');
    }
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
  
  // Fetch definition from Free Dictionary API
  async function fetchDefinition(word) {
    try {
      const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`);
      if (!response.ok) throw new Error('Word not found');
      
      const data = await response.json();
      const entry = data[0];

      const phonetic = entry.phonetic
        ? `<div class="lookup-phonetic">${entry.phonetic}</div>`
        : '';

      const meaningBlocks = (entry.meanings || [])
        .slice(0, 3)
        .map((meaning) => {
          const topDefinition = meaning.definitions?.[0];
          if (!topDefinition?.definition) {
            return '';
          }

          const example = topDefinition.example
            ? `<div class="lookup-example">"${topDefinition.example}"</div>`
            : '';

          return `
            <div class="lookup-definition-item">
              <div class="lookup-part-of-speech">${meaning.partOfSpeech || 'meaning'}</div>
              <div class="lookup-definition">${topDefinition.definition}</div>
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
  
  // Fetch translation from MyMemory API
  async function fetchTranslation(word) {
    try {
      const response = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=en|ta`);
      if (!response.ok) throw new Error('Translation failed');
      
      const data = await response.json();
      const translation = data.responseData.translatedText;
      
      if (translation && translation !== word) {
        return {
          html: `
          <div class="lookup-translation-wrap">
            <div class="lookup-translation-card">
              <div class="lookup-translation-main">${translation}</div>
              <div class="lookup-translation-sub">Tamil translation for "${word}"</div>
            </div>
          </div>
        `,
          state: 'content'
        };
      } else {
        return { html: 'No translation available', state: 'error' };
      }
    } catch (err) {
      console.error('Translation fetch error:', err);
      return { html: 'Unable to fetch translation', state: 'error' };
    }
  }
  
  // Show lookup card
  async function showLookupCard(word) {
    currentLookupWord = word;
    
    // Hide all other views
    document.getElementById('dot').style.display = 'none';
    document.getElementById('card').classList.remove('visible');
    
    // Show lookup card
    const lookupCard = document.getElementById('lookup-card');
    lookupCard.classList.add('visible');
    
    // Update word
    document.getElementById('lookup-word').textContent = word;
    
    // Show loading state
    setLookupContentState('definition', 'Loading...', 'loading');
    setLookupContentState('translation', 'Loading...', 'loading');
    
    // Resize window
    window.fp.openLookup();
    adaptLookupPanelSize();
    
    // Check cache first
    if (wordCache.has(word) && wordCache.get(word)?.version === LOOKUP_CACHE_VERSION) {
      const cached = wordCache.get(word);
      wordCache.delete(word);
      wordCache.set(word, cached);
      setLookupContentState('definition', cached.definition, 'content');
      setLookupContentState('translation', cached.translation, 'content');
      adaptLookupPanelSize();
    } else {
      await waitForLookupBudget();

      // Fetch definition and translation
      const [definitionResult, translationResult] = await Promise.all([
        fetchDefinition(word),
        fetchTranslation(word)
      ]);
      
      setLookupContentState('definition', definitionResult.html, definitionResult.state);
      setLookupContentState('translation', translationResult.html, translationResult.state);
      
      // Cache result (LRU eviction)
      if (wordCache.size >= maxCacheSize) {
        const firstKey = wordCache.keys().next().value;
        wordCache.delete(firstKey);
      }
      wordCache.set(word, {
        definition: definitionResult.html,
        translation: translationResult.html,
        timestamp: Date.now(),
        version: LOOKUP_CACHE_VERSION
      });
      
      // Save cache to storage
      await window.fp.set('wordCache', Array.from(wordCache.entries()));
      await syncWordCacheEntry(word, definitionResult.html, translationResult.html);
      adaptLookupPanelSize();
    }
    
    // Auto-close after 30 seconds of inactivity
    resetLookupInactivityTimer();
  }
  
  function closeLookupCard() {
    const lookupCard = document.getElementById('lookup-card');
    lookupCard.classList.remove('visible');
    currentLookupWord = null;
    
    if (lookupInactivityTimeout) {
      clearTimeout(lookupInactivityTimeout);
      lookupInactivityTimeout = null;
    }
    
    // Notify main process to resize back
    window.fp.closeLookup(expanded ? 'expanded' : 'collapsed');
  }
  
  function resetLookupInactivityTimer() {
    if (lookupInactivityTimeout) clearTimeout(lookupInactivityTimeout);
    
    lookupInactivityTimeout = setTimeout(() => {
      closeLookupCard();
    }, 30000); // 30 seconds
  }
  
  // Event listeners for word lookup
  document.getElementById('lookup-close').addEventListener('click', () => {
    closeLookupCard();
  });
  
  window.fp.onLookupRequested(async (data) => {
    if (data?.word) {
      await showLookupCard(data.word);
    }
  });
  
  window.fp.onLookupClosed(() => {
    // Return to previous state
    if (taskPromptState || expanded) {
      document.getElementById('card').classList.add('visible');
      document.getElementById('dot').style.display = 'none';
    } else {
      document.getElementById('dot').style.display = 'flex';
      document.getElementById('card').classList.remove('visible');
    }
  });

  window.fp.onWordSelected(() => {});
  window.fp.onWordCleared(() => {
    if (currentLookupWord) {
      closeLookupCard();
    }
  });
  
  // Load word cache from storage
  async function loadWordCache() {
    const cached = await window.fp.get('wordCache');
    if (cached && Array.isArray(cached)) {
      wordCache = new Map(
        cached.filter((entry) => {
          const value = entry?.[1];
          return value && value.version === LOOKUP_CACHE_VERSION;
        })
      );
    }
    
    const cacheSize = await window.fp.get('wordCacheSize');
    if (cacheSize) {
      maxCacheSize = cacheSize;
    }
  }
  
  loadWordCache();

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

  // Check for streak milestones
  async function checkStreakMilestones() {
    const streak = await window.fp.get('dailyStreak') || 0;
    const lastMilestone = await window.fp.get('lastStreakMilestone') || 0;
    
    // Milestone thresholds
    const milestones = [3, 7, 14, 30, 60, 90, 180, 365];
    
    for (const milestone of milestones) {
      if (streak >= milestone && lastMilestone < milestone) {
        // New milestone reached!
        showNotification(
          '🔥',
          `${milestone} Day Streak!`,
          `Amazing! You've maintained your streak for ${milestone} days. Keep it up!`,
          10000
        );
        
        await window.fp.set('lastStreakMilestone', milestone);
        break;
      }
    }
  }

  // Listen for notifications from main process
  window.fp.onShowNotification((data) => {
    showNotification(data.icon, data.title, data.message, data.duration);
  });

  window.fp.onFocusModeShortcut(() => {
    toggleFocusMode();
  });

  // Check milestones on load
  checkStreakMilestones();

  // ── Streak Calculation ─────────────────────────────────────────────────────
  
  async function calculateDailyStreaks() {
    const tasks = await window.fp.get('tasks') || [];
    const today = new Date().toISOString().split('T')[0];
    
    const todayTasks = tasks.filter(t => !t.instanceDate || t.instanceDate === today);
    const total = todayTasks.length;
    const completed = todayTasks.filter(t => t.status === 'completed').length;
    
    if (total === 0) return; // No tasks today
    
    const completionRate = (completed / total) * 100;
    
    // Calculate focus time
    let totalFocusMinutes = 0;
    todayTasks.forEach(t => {
      if (t.status === 'completed' || t.status === 'partial') {
        const [startH, startM] = t.start.split(':').map(Number);
        const [endH, endM] = t.end.split(':').map(Number);
        const startMinutes = startH * 60 + startM;
        const endMinutes = endH * 60 + endM;
        totalFocusMinutes += (endMinutes - startMinutes);
      }
    });
    
    const focusHours = totalFocusMinutes / 60;
    
    // Update daily streak (>50% completion)
    let dailyStreak = await window.fp.get('dailyStreak') || 0;
    const lastStreakDate = await window.fp.get('lastStreakDate') || '';
    
    if (completionRate >= 50) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      
      if (lastStreakDate === yesterdayStr || dailyStreak === 0) {
        dailyStreak++;
      } else if (lastStreakDate !== today) {
        dailyStreak = 1; // Reset streak
      }
      
      await window.fp.set('dailyStreak', dailyStreak);
      await window.fp.set('lastStreakDate', today);
    } else if (lastStreakDate !== today) {
      // Streak broken
      await window.fp.set('dailyStreak', 0);
    }
    
    // Update perfect days (100% completion)
    if (completionRate === 100) {
      let perfectDays = await window.fp.get('perfectDaysThisMonth') || 0;
      const lastPerfectDate = await window.fp.get('lastPerfectDate') || '';
      
      if (lastPerfectDate !== today) {
        perfectDays++;
        await window.fp.set('perfectDaysThisMonth', perfectDays);
        await window.fp.set('lastPerfectDate', today);
      }
    }
    
    // Update focus streak (>4h focus time)
    let focusStreak = await window.fp.get('focusStreak') || 0;
    const lastFocusDate = await window.fp.get('lastFocusDate') || '';
    
    if (focusHours >= 4) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      
      if (lastFocusDate === yesterdayStr || focusStreak === 0) {
        focusStreak++;
      } else if (lastFocusDate !== today) {
        focusStreak = 1;
      }
      
      await window.fp.set('focusStreak', focusStreak);
      await window.fp.set('lastFocusDate', today);
    } else if (lastFocusDate !== today) {
      await window.fp.set('focusStreak', 0);
    }
    
    // Check for new milestones
    checkStreakMilestones();
  }
  
  // Calculate streaks when tasks are saved
  window.addEventListener('beforeunload', () => {
    calculateDailyStreaks();
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
      if (pomodoroSettings.muteBreaksInFocus && breakTimer) {
        clearTimeout(breakTimer);
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
        scheduleBreak();
      }
    }

    updateCollapsedWidget();
  }
  
  // Keyboard shortcut: Ctrl+Shift+F
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'F') {
      e.preventDefault();
      toggleFocusMode();
    }
  });
  
  // Button handlers
  document.getElementById('btn-pomodoro').addEventListener('click', startPomodoro);
  document.getElementById('btn-focus').addEventListener('click', toggleFocusMode);
