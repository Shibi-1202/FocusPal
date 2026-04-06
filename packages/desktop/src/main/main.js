const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, globalShortcut, dialog } = require('electron');
const path = require('path');
const Store = require('electron-store');
const FocusPalTheme = require('../common/appTheme');
const { shiftDateKey } = require('../common/dateUtils');
const { SupabaseClient, SupabaseRequestError } = require('./supabaseClient');

const store = new Store();
const supabaseClient = new SupabaseClient();

let widgetWindow = null;
let settingsWindow = null;
let authWindow = null;
let tray = null;
let clipboardMonitorInterval = null;
let lastClipboardText = '';
let isQuitting = false;
let currentCollapsedMode = 'dot';
let currentWidgetState = 'collapsed';
let widgetAnchorCenter = null;
let suppressAnchorCapture = 0;
let pendingLookupWord = '';
let lookupOpenTimeout = null;
let lookupAnchorCenter = null;
let lookupCollapsedState = null;
let cloudStateCache = null;
let cloudStateUserId = null;
const USER_SCOPED_KEYS = new Set([
  'tasks',
  'taskHistory',
  'lastCloudTaskSync',
  'breakInterval',
  'wordLookupEnabled',
  'notificationSound',
  'appTheme',
  'breakWater',
  'breakStretch',
  'breakEyes',
  'breakWaterMessage',
  'breakStretchMessage',
  'breakEyesMessage',
  'eodPrompt',
  'taskConfirmations',
  'pomodoroSettings'
]);
const CLOUD_SYNC_KEYS = new Set(
  Array.from(USER_SCOPED_KEYS).filter((key) => key !== 'lastCloudTaskSync')
);

// ── Window sizes ──────────────────────────────────────────────────────────────
const WIDGET_DOT = { width: 48, height: 48 };
const WIDGET_PILL = { width: 168, height: 48 };
const WIDGET_EXPANDED  = { width: 400, height: 260 };
const WIDGET_LOOKUP = { width: 480, height: 220 };
const RENDERER_WEB_PREFERENCES = {
  nodeIntegration: false,
  contextIsolation: true,
  preload: path.join(__dirname, 'preload.js')
};

function getBottomRightPos(w, h) {
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  return { x: sw - w - 16, y: sh - h - 16 };
}

function getCollapsedBounds(mode) {
  return mode === 'pill' ? WIDGET_PILL : WIDGET_DOT;
}

function normalizePosition(position) {
  return {
    x: Math.round(Number(position?.x) || 0),
    y: Math.round(Number(position?.y) || 0)
  };
}

function createRendererWindow(options) {
  const { webPreferences = {}, ...rest } = options;
  return new BrowserWindow({
    ...rest,
    webPreferences: {
      ...RENDERER_WEB_PREFERENCES,
      ...webPreferences
    }
  });
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function snapToHorizontalEdge(position, size) {
  const margin = 16;
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  const snappedX = (() => {
    const leftDist = position.x;
    const rightDist = sw - (position.x + size.width);
    if (leftDist <= rightDist) {
      return clamp(margin, margin, sw - size.width - margin);
    }
    return clamp(sw - size.width - margin, margin, sw - size.width - margin);
  })();

  const yAvail = sh - size.height - margin;
  const snappedY = clamp(position.y, margin, Math.max(margin, yAvail));

  return { x: snappedX, y: snappedY };
}

function getCenterFromPosition(position, size) {
  const normalized = normalizePosition(position);
  return {
    x: normalized.x + Math.round(size.width / 2),
    y: normalized.y + Math.round(size.height / 2)
  };
}

function getPositionFromCenter(center, size) {
  const normalized = normalizePosition(center);
  return {
    x: normalized.x - Math.round(size.width / 2),
    y: normalized.y - Math.round(size.height / 2)
  };
}

function setWidgetAnchorCenter(center) {
  widgetAnchorCenter = normalizePosition(center);
  return widgetAnchorCenter;
}

function captureWidgetAnchorFromWindow() {
  if (!widgetWindow || widgetWindow.isDestroyed()) {
    return widgetAnchorCenter;
  }

  const bounds = widgetWindow.getBounds();
  return setWidgetAnchorCenter({
    x: bounds.x + Math.round(bounds.width / 2),
    y: bounds.y + Math.round(bounds.height / 2)
  });
}

function getWidgetAnchorCenter() {
  if (widgetAnchorCenter) {
    return widgetAnchorCenter;
  }

  const storedCenter = store.get('widgetAnchorCenter');
  if (storedCenter) {
    return setWidgetAnchorCenter(storedCenter);
  }

  const savedPos = store.get('widgetPosition');
  if (savedPos) {
    const savedMode = store.get('widgetCollapsedMode') === 'pill' ? 'pill' : 'dot';
    return setWidgetAnchorCenter(getCenterFromPosition(savedPos, getCollapsedBounds(savedMode)));
  }

  return setWidgetAnchorCenter(getCenterFromPosition(getBottomRightPos(WIDGET_DOT.width, WIDGET_DOT.height), WIDGET_DOT));
}

function getCollapsedAnchorPosition(mode = currentCollapsedMode) {
  return getPositionFromCenter(getWidgetAnchorCenter(), getCollapsedBounds(mode));
}

function persistCollapsedPosition(mode = currentCollapsedMode) {
  const center = getWidgetAnchorCenter();
  const position = getCollapsedAnchorPosition(mode);
  store.set('widgetAnchorCenter', center);
  store.set('widgetPosition', position);
  store.set('widgetCollapsedMode', mode);
  return position;
}

function applySnappedCollapsedPosition(position, mode) {
  const bounds = getCollapsedBounds(mode);
  const snapped = snapToHorizontalEdge(position, bounds);
  setWidgetAnchorCenter(getCenterFromPosition(snapped, bounds));
  return snapped;
}

function setWidgetBounds(size, position = null) {
  if (!widgetWindow || widgetWindow.isDestroyed()) return;
  const [currentX, currentY] = widgetWindow.getPosition();
  const nextPosition = position ? normalizePosition(position) : { x: currentX, y: currentY };
  suppressAnchorCapture += 1;
  widgetWindow.setBounds({ x: nextPosition.x, y: nextPosition.y, ...size }, true);
  setImmediate(() => {
    suppressAnchorCapture = Math.max(0, suppressAnchorCapture - 1);
  });
}

function getWindowFromSender(event) {
  return event?.sender ? BrowserWindow.fromWebContents(event.sender) : null;
}

function isWordLookupEnabled() {
  return getLocalStoreValue('wordLookupEnabled') !== false;
}

function broadcastLookupSetting(enabled = isWordLookupEnabled()) {
  const payload = { enabled };
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    widgetWindow.webContents.send('lookup-setting-updated', payload);
  }
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('lookup-setting-updated', payload);
  }
}

function normalizeSupabaseUser(user) {
  if (!user) return null;

  return {
    id: user.id,
    email: user.email || '',
    displayName: user.user_metadata?.display_name || user.user_metadata?.name || '',
    createdAt: user.created_at || null
  };
}

function clearCloudStateCache() {
  cloudStateCache = null;
  cloudStateUserId = null;
}

function ensurePrimaryUserId(userId) {
  if (!userId) {
    return;
  }

  if (!store.get('app.primaryUserId')) {
    store.set('app.primaryUserId', userId);
  }
}

function getCurrentUserId() {
  return store.get('auth.user.id') || null;
}

function getUserScopedStoreKey(userId, key) {
  return `users.${userId}.${key}`;
}

function getLocalStoreValue(key) {
  const userId = getCurrentUserId();

  if (!USER_SCOPED_KEYS.has(key) || !userId) {
    return store.get(key);
  }

  const scopedKey = getUserScopedStoreKey(userId, key);
  if (store.has(scopedKey)) {
    return store.get(scopedKey);
  }

  if (
    cloudStateUserId === userId &&
    cloudStateCache &&
    !Object.prototype.hasOwnProperty.call(cloudStateCache, key)
  ) {
    return undefined;
  }

  const primaryUserId = store.get('app.primaryUserId');
  if (primaryUserId && primaryUserId === userId && store.has(key)) {
    return store.get(key);
  }

  return undefined;
}

function setLocalStoreValue(key, value) {
  const userId = getCurrentUserId();

  if (!USER_SCOPED_KEYS.has(key) || !userId) {
    store.set(key, value);
    return;
  }

  const scopedKey = getUserScopedStoreKey(userId, key);
  store.set(scopedKey, value);
}

async function ensureCloudStateLoaded(force = false) {
  const userId = getCurrentUserId();
  const { accessToken } = supabaseClient.getSession();

  if (!userId || !accessToken || !supabaseClient.isConfigured()) {
    return {};
  }

  if (!force && cloudStateCache && cloudStateUserId === userId) {
    return cloudStateCache;
  }

  const row = await supabaseClient.getAppState(userId);
  const nextState = row?.data && typeof row.data === 'object' ? row.data : {};

  cloudStateCache = { ...nextState };
  cloudStateUserId = userId;

  Object.entries(nextState).forEach(([key, value]) => {
    if (CLOUD_SYNC_KEYS.has(key)) {
      setLocalStoreValue(key, value);
    }
  });

  return cloudStateCache;
}

async function getStoreValue(key) {
  const localValue = getLocalStoreValue(key);
  if (localValue !== undefined) {
    return localValue;
  }

  if (!CLOUD_SYNC_KEYS.has(key)) {
    return undefined;
  }

  const cloudState = await ensureCloudStateLoaded();
  if (Object.prototype.hasOwnProperty.call(cloudState, key)) {
    const value = cloudState[key];
    setLocalStoreValue(key, value);
    return value;
  }

  return undefined;
}

async function setStoreValue(key, value) {
  setLocalStoreValue(key, value);

  if (!CLOUD_SYNC_KEYS.has(key)) {
    return;
  }

  const userId = getCurrentUserId();
  const { accessToken } = supabaseClient.getSession();

  if (!userId || !accessToken || !supabaseClient.isConfigured()) {
    return;
  }

  const currentState = await ensureCloudStateLoaded();
  const nextState = {
    ...currentState,
    [key]: value
  };

  cloudStateCache = nextState;
  cloudStateUserId = userId;
  await supabaseClient.upsertAppState(userId, nextState);
}

function showLookupForPendingWord() {
  if (!isWordLookupEnabled() || !pendingLookupWord || !widgetWindow || widgetWindow.isDestroyed()) {
    return;
  }

  const word = pendingLookupWord;

  if (typeof widgetWindow.showInactive === 'function') {
    widgetWindow.showInactive();
  } else {
    widgetWindow.show();
  }

  const sendLookupRequest = () => {
    if (!widgetWindow || widgetWindow.isDestroyed()) {
      return;
    }
    widgetWindow.webContents.send('lookup-requested', { word });
  };

  if (widgetWindow.webContents.isLoading()) {
    widgetWindow.webContents.once('did-finish-load', sendLookupRequest);
  } else {
    sendLookupRequest();
  }
}

function startClipboardMonitor() {
  const { clipboard } = require('electron');
  stopClipboardMonitor();

  clipboardMonitorInterval = setInterval(() => {
    try {
      if (!isWordLookupEnabled()) {
        if (lastClipboardText || pendingLookupWord || lookupOpenTimeout) {
          lastClipboardText = '';
          pendingLookupWord = '';

          if (lookupOpenTimeout) {
            clearTimeout(lookupOpenTimeout);
            lookupOpenTimeout = null;
          }

          if (widgetWindow && !widgetWindow.isDestroyed()) {
            widgetWindow.webContents.send('word-cleared');
          }
        }
        return;
      }

      let text = '';

      try {
        text = clipboard.readText('selection');
      } catch (err) {
        text = clipboard.readText();
      }

      const trimmed = (text || '').trim();

      if (trimmed && trimmed !== lastClipboardText) {
        const wordCount = trimmed.split(/\s+/).length;

        if (trimmed.length >= 3 && trimmed.length < 40 && wordCount === 1) {
          lastClipboardText = trimmed;
          pendingLookupWord = trimmed;

          if (lookupOpenTimeout) {
            clearTimeout(lookupOpenTimeout);
          }

          lookupOpenTimeout = setTimeout(() => {
            showLookupForPendingWord();
          }, 180);
        } else if (trimmed.length < 3 || wordCount !== 1) {
          pendingLookupWord = '';
          if (lookupOpenTimeout) {
            clearTimeout(lookupOpenTimeout);
            lookupOpenTimeout = null;
          }
        }
      } else if (!trimmed && lastClipboardText) {
        lastClipboardText = '';
        pendingLookupWord = '';

        if (lookupOpenTimeout) {
          clearTimeout(lookupOpenTimeout);
          lookupOpenTimeout = null;
        }

        if (widgetWindow && !widgetWindow.isDestroyed()) {
          widgetWindow.webContents.send('word-cleared');
        }
      }
    } catch (err) {
      // Ignore clipboard access errors.
    }
  }, 500);
}

function stopClipboardMonitor() {
  if (clipboardMonitorInterval) {
    clearInterval(clipboardMonitorInterval);
    clipboardMonitorInterval = null;
  }

  if (lookupOpenTimeout) {
    clearTimeout(lookupOpenTimeout);
    lookupOpenTimeout = null;
  }

  lastClipboardText = '';
  pendingLookupWord = '';
}

function launchMainApp() {
  if (!widgetWindow || widgetWindow.isDestroyed()) {
    createWidgetWindow();
  }

  if (!tray) {
    createTray();
  }

  startClipboardMonitor();
}



// ── Create auth window ────────────────────────────────────────────────────────
function createAuthWindow() {
  if (authWindow && !authWindow.isDestroyed()) {
    authWindow.focus();
    return;
  }

  authWindow = createRendererWindow({
    width: 450,
    height: 650,
    center: true,
    frame: false,
    resizable: false,
    alwaysOnTop: false,
    skipTaskbar: false
  });

  authWindow.loadFile(path.join(__dirname, '../renderer/auth.html'));

  authWindow.on('closed', () => {
    authWindow = null;

    const hasSession = Boolean(store.get('auth.accessToken') && store.get('auth.refreshToken'));
    if (!isQuitting && !hasSession && !tray && !widgetWindow && !settingsWindow) {
      app.quit();
    }
  });
}

// ── Create widget window ──────────────────────────────────────────────────────
function createWidgetWindow() {
  currentCollapsedMode = store.get('widgetCollapsedMode') === 'pill' ? 'pill' : 'dot';
  const initialPos = getCollapsedAnchorPosition('dot');
  currentWidgetState = 'collapsed';

  widgetWindow = createRendererWindow({
    width: WIDGET_DOT.width,
    height: WIDGET_DOT.height,
    x: initialPos.x,
    y: initialPos.y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: true,
    hasShadow: false,
    type: 'toolbar'          // Stays above most windows on Linux
  });

  widgetWindow.setAlwaysOnTop(true, 'screen-saver'); // Highest level
  widgetWindow.loadFile(path.join(__dirname, '../renderer/widget.html'));

  widgetWindow.on('move', () => {
    if (!widgetWindow || widgetWindow.isDestroyed()) return;
    if (suppressAnchorCapture > 0) {
      return;
    }

    captureWidgetAnchorFromWindow();
  });

  widgetWindow.on('closed', () => { widgetWindow = null; });
}

// ── Create settings window ────────────────────────────────────────────────────
function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }
  settingsWindow = createRendererWindow({
    width: 520,
    height: 640,
    frame: false,
    transparent: false,
    resizable: false,
    center: true,
    skipTaskbar: false
  });
  settingsWindow.loadFile(path.join(__dirname, '../renderer/settings.html'));
  settingsWindow.on('closed', () => { settingsWindow = null; });
}

function selectSettingsTab(tabPayload) {
  createSettingsWindow();
  if (!tabPayload || !settingsWindow || settingsWindow.isDestroyed()) {
    return;
  }

  const sendSelection = () => {
    settingsWindow.webContents.send('select-tab', tabPayload);
  };

  if (settingsWindow.webContents.isLoading()) {
    settingsWindow.webContents.once('did-finish-load', sendSelection);
  } else {
    sendSelection();
  }
}

// ── Tray ──────────────────────────────────────────────────────────────────────
function createTray() {
  // Create a simple 16x16 purple dot icon
  const icon = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAdgAAAHYBTnsmCAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAFJSURBVDiNpdM9S8NAGMDx/5Nc0kKhUBwEwUVwcRMcXPwAfgAHBxEHQXDRr+Dg4CI4iYOTk4uDgyAIQnFwEAQHBUGQYqFJm+Z6DqZN2qTW5x7u7vfcc/cS/lMopQghEEKglEIpBSEESimUUiilIIRAKYVSCqUUSikIIVBKQQiBUgpCCJRSKKUghEAphVIKQgiUUiilIIRAKYVSCkIIlFIopSCEQCmFUgpCCJRSKKUghEAphVIKQgiUUiilIIRAKYVSCkIIlFIopSCEQCmFUgpCCJRSKKUghEAphVIKQgiUUiilIIRAKYVSCkIIlFIopSCEQCmFUgpCCJRSKKUghEAphVIKQgiUUiilIIRAKYVSCkIIlFIopSCEQCmFUgpCCJRSKKUghEAphVIKQgiUUiilIIRAKYVSCkIIlFIopSCEQCmFUgpCCJRSKKX4AXYVXKzFfX1yAAAAAElFTkSuQmCC'
  );
  
  tray = new Tray(icon);
  tray.setToolTip('FocusPal');
  const menu = Menu.buildFromTemplate([
    { label: 'Show Widget', click: () => widgetWindow?.show() },
    { label: 'Settings',    click: () => createSettingsWindow() },
    { type: 'separator' },
    { label: 'Quit FocusPal', click: () => app.quit() }
  ]);
  tray.setContextMenu(menu);
  tray.on('click', () => widgetWindow?.show());
}

function storeAuthSession(response) {
  const accessToken = response?.access_token || response?.accessToken || null;
  const refreshToken = response?.refresh_token || response?.refreshToken || null;
  const user = normalizeSupabaseUser(response?.user);

  store.set('auth.accessToken', accessToken);
  store.set('auth.refreshToken', refreshToken);
  store.set('auth.user', user);
  supabaseClient.setSession(accessToken, refreshToken);
  clearCloudStateCache();

  ensurePrimaryUserId(user?.id);
}

function clearAuthSession() {
  store.delete('auth.accessToken');
  store.delete('auth.refreshToken');
  store.delete('auth.user');
  supabaseClient.clearSession();
  clearCloudStateCache();
}

function getAuthErrorMessage(error, fallback) {
  if (error instanceof SupabaseRequestError) {
    return error.message || fallback;
  }

  return fallback;
}

function getSessionPayload(response) {
  if (!response) return null;
  if (response.session?.access_token) {
    return {
      ...response.session,
      user: response.user || response.session.user
    };
  }

  if (response.access_token) {
    return response;
  }

  return null;
}

async function completeAuthSuccess(response) {
  storeAuthSession(response);
  try {
    await ensureCloudStateLoaded(true);
  } catch (err) {
    console.error('Cloud state hydrate error:', err);
  }

  setTimeout(() => {
    if (authWindow && !authWindow.isDestroyed()) {
      authWindow.close();
    }
    launchMainApp();
  }, 1500);
}

// ── IPC handlers ──────────────────────────────────────────────────────────────

// Widget expand / collapse → resize window
ipcMain.on('widget-expand', () => {
  if (!widgetWindow) return;
  captureWidgetAnchorFromWindow();
  currentWidgetState = 'expanded';
  setWidgetBounds(WIDGET_EXPANDED, getPositionFromCenter(getWidgetAnchorCenter(), WIDGET_EXPANDED));
});

ipcMain.on('widget-collapse', () => {
  if (!widgetWindow) return;
  captureWidgetAnchorFromWindow();
  currentWidgetState = 'collapsed';
  const nextPosition = getCollapsedAnchorPosition(currentCollapsedMode);
  const snapped = applySnappedCollapsedPosition(nextPosition, currentCollapsedMode);
  setWidgetBounds(getCollapsedBounds(currentCollapsedMode), snapped);
  persistCollapsedPosition(currentCollapsedMode);
});

ipcMain.on('widget-set-collapsed-state', (event, mode) => {
  currentCollapsedMode = mode === 'pill' ? 'pill' : 'dot';
  if (!widgetWindow || widgetWindow.isDestroyed()) return;

  const senderWindow = getWindowFromSender(event);
  if (senderWindow !== widgetWindow) return;

  if (currentWidgetState === 'collapsed') {
    captureWidgetAnchorFromWindow();
    const nextPosition = getCollapsedAnchorPosition(currentCollapsedMode);
    const snapped = applySnappedCollapsedPosition(nextPosition, currentCollapsedMode);
    setWidgetBounds(getCollapsedBounds(currentCollapsedMode), snapped);
    persistCollapsedPosition(currentCollapsedMode);
  }
});

ipcMain.on('widget-lookup-open', (event) => {
  if (!widgetWindow || widgetWindow.isDestroyed()) return;

  const senderWindow = getWindowFromSender(event);
  if (senderWindow !== widgetWindow) return;

  if (currentWidgetState !== 'lookup') {
    if (currentWidgetState === 'collapsed') {
      lookupCollapsedState = {
        position: getCollapsedAnchorPosition(currentCollapsedMode),
        mode: currentCollapsedMode
      };
    } else {
      captureWidgetAnchorFromWindow();
      lookupCollapsedState = null;
    }

    lookupAnchorCenter = getWidgetAnchorCenter();
  }

  currentWidgetState = 'lookup';
  const anchorCenter = lookupAnchorCenter || getWidgetAnchorCenter();
  setWidgetBounds(WIDGET_LOOKUP, getPositionFromCenter(anchorCenter, WIDGET_LOOKUP));
});

ipcMain.on('widget-lookup-resize', (event, size) => {
  if (!widgetWindow || widgetWindow.isDestroyed()) return;

  const senderWindow = getWindowFromSender(event);
  if (senderWindow !== widgetWindow) return;

  const width = Math.max(WIDGET_LOOKUP.width, Math.min(Number(size?.width) || WIDGET_LOOKUP.width, 640));
  const height = Math.max(WIDGET_LOOKUP.height, Math.min(Number(size?.height) || WIDGET_LOOKUP.height, 420));
  const nextSize = { width, height };
  const anchorCenter = lookupAnchorCenter || getWidgetAnchorCenter();
  setWidgetBounds(nextSize, getPositionFromCenter(anchorCenter, nextSize));
});

ipcMain.on('widget-lookup-close', (event, state) => {
  if (!widgetWindow || widgetWindow.isDestroyed()) return;

  const senderWindow = getWindowFromSender(event);
  if (senderWindow !== widgetWindow) return;

  const anchorCenter = lookupAnchorCenter || getWidgetAnchorCenter();

  if (state === 'expanded') {
    currentWidgetState = 'expanded';
    setWidgetAnchorCenter(anchorCenter);
    setWidgetBounds(WIDGET_EXPANDED, getPositionFromCenter(anchorCenter, WIDGET_EXPANDED));
  } else {
    currentWidgetState = 'collapsed';

    if (lookupCollapsedState) {
      currentCollapsedMode = lookupCollapsedState.mode;
      const snapped = applySnappedCollapsedPosition(lookupCollapsedState.position, currentCollapsedMode);
      setWidgetBounds(getCollapsedBounds(currentCollapsedMode), snapped);
      persistCollapsedPosition(currentCollapsedMode);
    } else {
      setWidgetAnchorCenter(anchorCenter);
      const nextPosition = getCollapsedAnchorPosition(currentCollapsedMode);
      const snapped = applySnappedCollapsedPosition(nextPosition, currentCollapsedMode);
      setWidgetBounds(getCollapsedBounds(currentCollapsedMode), snapped);
      persistCollapsedPosition(currentCollapsedMode);
    }
  }

  lookupAnchorCenter = null;
  lookupCollapsedState = null;
  widgetWindow.webContents.send('lookup-closed');
});

// Save window position after drag
ipcMain.on('save-position', (e, pos) => {
  setWidgetAnchorCenter(getCenterFromPosition(pos, getCollapsedBounds(currentCollapsedMode)));
  persistCollapsedPosition(currentCollapsedMode);
});

// Get position for renderer drag
ipcMain.handle('get-position', () => {
  try {
    return widgetWindow?.getPosition() ?? [0, 0];
  } catch (err) {
    console.error('get-position error:', err);
    return [0, 0];
  }
});

ipcMain.handle('set-position', (e, x, y) => {
  try {
    const nextPosition = normalizePosition({ x, y });
    widgetWindow?.setPosition(nextPosition.x, nextPosition.y);
  } catch (err) {
    console.error('set-position error:', err);
  }
});

// Store CRUD
ipcMain.handle('store-get', async (e, key) => {
  try {
    return await getStoreValue(key);
  } catch (err) {
    console.error('store-get error:', err);
    return null;
  }
});

ipcMain.handle('store-set', async (e, key, value) => {
  try {
    await setStoreValue(key, value);
    if (key === 'wordLookupEnabled') {
      broadcastLookupSetting(value !== false);
    }
    return true;
  } catch (err) {
    console.error('store-set error:', err);
    return false;
  }
});

// System DND (Do Not Disturb) integration
ipcMain.handle('toggle-system-dnd', async (e, enable) => {
  try {
    const { exec } = require('child_process');
    const platform = process.platform;
    
    if (platform === 'linux') {
      // For GNOME/Ubuntu with gsettings
      const command = enable 
        ? 'gsettings set org.gnome.desktop.notifications show-banners false'
        : 'gsettings set org.gnome.desktop.notifications show-banners true';
      
      return new Promise((resolve) => {
        exec(command, (error) => {
          if (error) {
            console.error('DND toggle error:', error);
            resolve({ success: false, error: 'Could not toggle system DND. Make sure you are using GNOME/Ubuntu.' });
          } else {
            resolve({ success: true });
          }
        });
      });
    } else if (platform === 'darwin') {
      // macOS - not implemented yet
      return { success: false, error: 'macOS DND integration not yet implemented' };
    } else if (platform === 'win32') {
      // Windows - not implemented yet
      return { success: false, error: 'Windows Focus Assist integration not yet implemented' };
    }
    
    return { success: false, error: 'Unsupported platform' };
  } catch (err) {
    console.error('toggle-system-dnd error:', err);
    return false;
  }
});

// Open settings
ipcMain.on('open-settings', (event, tab) => {
  selectSettingsTab(tab);
});

// Close settings
ipcMain.on('close-settings', () => settingsWindow?.close());
ipcMain.on('force-quit-app', () => app.quit());

// Notify widget when settings change
ipcMain.on('settings-updated', () => {
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    widgetWindow.webContents.send('reload-data');
  }
});

// Handle auto-start toggle
ipcMain.handle('set-auto-start', (e, enabled) => {
  try {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      openAsHidden: false
    });
    return true;
  } catch (err) {
    console.error('set-auto-start error:', err);
    return false;
  }
});

ipcMain.handle('get-auto-start', () => {
  try {
    return app.getLoginItemSettings().openAtLogin;
  } catch (err) {
    console.error('get-auto-start error:', err);
    return false;
  }
});



// Window controls
ipcMain.on('minimize-window', (event) => {
  const window = getWindowFromSender(event);
  if (window) window.minimize();
});

ipcMain.on('close-window', (event) => {
  const window = getWindowFromSender(event);
  if (window) window.close();
});

// Quit app with EOD prompt
ipcMain.on('quit-app', async () => {
  const eodPrompt = getLocalStoreValue('eodPrompt');
  
  if (eodPrompt !== false) {
    const theme = FocusPalTheme.resolveTheme(getLocalStoreValue('appTheme'));
    
    // Create custom EOD dialog
    const eodWindow = createRendererWindow({
      width: 400,
      height: 250,
      center: true,
      frame: false,
      resizable: false,
      alwaysOnTop: true,
      modal: true
    });
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: 'Segoe UI', system-ui, sans-serif;
            background: ${theme.bg2};
            color: ${theme.text};
            padding: 24px;
          }
          h2 { 
            font-size: 20px; 
            margin-bottom: 8px; 
            color: ${theme.accent2};
            display: flex;
            align-items: center;
            gap: 8px;
          }
          .subtitle {
            font-size: 13px;
            color: ${theme.muted};
            margin-bottom: 28px;
          }
          .question {
            font-size: 15px;
            font-weight: 600;
            color: ${theme.text};
            margin-bottom: 16px;
            text-align: center;
          }
          .buttons {
            display: flex;
            gap: 10px;
            margin-bottom: 16px;
          }
          .buttons button {
            flex: 1;
            padding: 12px;
            border: none;
            border-radius: 10px;
            font-family: inherit;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: opacity 0.15s;
          }
          .buttons button:hover { opacity: 0.85; }
          .btn-primary {
            background: ${theme.accent};
            color: #fff;
          }
          .btn-secondary {
            background: ${theme.bg4};
            color: ${theme.muted};
          }
          .checkbox-row {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 12px;
            color: ${theme.muted};
            cursor: pointer;
          }
          .checkbox-row input {
            cursor: pointer;
          }
        </style>
      </head>
      <body>
        <h2>🌙 End of Day</h2>
        <div class="subtitle">Before you go...</div>
        <div class="question">Plan tomorrow?</div>
        
        <div class="buttons">
          <button class="btn-primary" onclick="planTomorrow()">Yes, Plan</button>
          <button class="btn-secondary" onclick="justQuit()">Just Quit</button>
        </div>
        
        <label class="checkbox-row">
          <input type="checkbox" id="dont-show" />
          <span>Don't show again</span>
        </label>
        
        <script>
          function planTomorrow() {
            const dontShow = document.getElementById('dont-show').checked;
            window.fp.sendEodResult({ action: 'plan', dontShow });
          }
          
          function justQuit() {
            const dontShow = document.getElementById('dont-show').checked;
            window.fp.sendEodResult({ action: 'quit', dontShow });
          }
        </script>
      </body>
      </html>
    `;
    
    eodWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    
    return new Promise((resolve) => {
      let handled = false;

      ipcMain.once('eod-result', (e, result) => {
        handled = true;
        if (!eodWindow.isDestroyed()) {
          eodWindow.close();
        }
        
        if (result.dontShow) {
          store.set('eodPrompt', false);
        }
        
        if (result.action === 'plan') {
          const planningPayload = {
            tab: 'tasks',
            planningDate: shiftDateKey(1),
            quitAfterSave: true
          };

          selectSettingsTab(planningPayload);
          resolve();
        } else {
          app.quit();
        }
      });
      
      eodWindow.on('closed', () => {
        if (handled) {
          return;
        }

        // If window closed without action, just quit
        handled = true;
        resolve();
        app.quit();
      });
    });
  } else {
    app.quit();
  }
});

// ── API handlers ──────────────────────────────────────────────────────────────

// Authentication handlers
ipcMain.handle('auth-login', async (e, email, password) => {
  try {
    const response = await supabaseClient.signInWithPassword({ email, password });
    const session = getSessionPayload(response);
    await completeAuthSuccess(session);
    return { success: true, user: normalizeSupabaseUser(session.user) };
  } catch (err) {
    console.error('Login error:', err);
    return { 
      success: false, 
      error: getAuthErrorMessage(err, 'Invalid email or password')
    };
  }
});

ipcMain.handle('auth-register', async (e, name, email, password) => {
  try {
    const response = await supabaseClient.signUp({ displayName: name, email, password });
    const session = getSessionPayload(response);

    if (!session) {
      return {
        success: true,
        pendingConfirmation: true,
        message: 'Check your email to confirm your account before signing in.'
      };
    }

    await completeAuthSuccess(session);
    return { success: true, user: normalizeSupabaseUser(session.user) };
  } catch (err) {
    console.error('Register error:', err);
    const errorMsg = getAuthErrorMessage(err, 'Registration failed');
    return { success: false, error: errorMsg };
  }
});

ipcMain.handle('auth-logout', async () => {
  try {
    await supabaseClient.signOut();
  } catch (err) {
    console.error('Logout error:', err);
  }
  
  stopClipboardMonitor();
  clearAuthSession();
  
  // Close widget and settings windows
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    widgetWindow.close();
  }
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.close();
  }
  
  // Show auth window
  createAuthWindow();
  
  return { success: true };
});

ipcMain.handle('auth-get-user', () => {
  try {
    return store.get('auth.user');
  } catch (err) {
    console.error('Get user error:', err);
    return null;
  }
});

ipcMain.handle('auth-forgot-password', async (e, email) => {
  try {
    await supabaseClient.requestPasswordReset(email);
    return {
      success: true,
      message: 'If the account exists, a reset link has been sent.'
    };
  } catch (err) {
    console.error('Forgot password error:', err);
    return {
      success: false,
      error: getAuthErrorMessage(err, 'Password reset request failed')
    };
  }
});

// Auth success handler - close auth window and show widget
// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  globalShortcut.register('CommandOrControl+Shift+F', () => {
    if (widgetWindow && !widgetWindow.isDestroyed()) {
      widgetWindow.webContents.send('focus-mode-shortcut');
    }
  });
  
  // Check for stored tokens
  const accessToken = store.get('auth.accessToken');
  const refreshToken = store.get('auth.refreshToken');
  
  if (!accessToken || !refreshToken) {
    createAuthWindow();
    return;
  }
  
  try {
    supabaseClient.setSession(accessToken, refreshToken);
    const user = await supabaseClient.getUser();
    const normalizedUser = normalizeSupabaseUser(user);
    store.set('auth.accessToken', supabaseClient.getSession().accessToken);
    store.set('auth.refreshToken', supabaseClient.getSession().refreshToken);
    store.set('auth.user', normalizedUser);
    ensurePrimaryUserId(normalizedUser?.id);
    clearCloudStateCache();
    await ensureCloudStateLoaded(true);
    launchMainApp();
  } catch (err) {
    console.error('Token validation failed:', err);
    clearAuthSession();
    createAuthWindow();
  }
});

app.on('window-all-closed', (e) => {
  // Only keep the app resident once the main app/tray has been launched.
  if (!isQuitting && tray) {
    e.preventDefault();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  stopClipboardMonitor();
  globalShortcut.unregisterAll();
});
