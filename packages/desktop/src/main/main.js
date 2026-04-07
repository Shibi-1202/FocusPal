const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, globalShortcut, dialog, shell } = require('electron');
const crypto = require('crypto');
const http = require('http');
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
let pendingGoogleAuthFlow = null;
const USER_SCOPED_KEYS = new Set([
  'tasks',
  'taskHistory',
  'lastCloudTaskSync',
  'breakInterval',
  'breakWaterInterval',
  'breakStretchInterval',
  'breakEyesInterval',
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
const GOOGLE_AUTH_TIMEOUT_MS = 5 * 60 * 1000;
const RENDERER_WEB_PREFERENCES = {
  nodeIntegration: false,
  contextIsolation: true,
  preload: path.join(__dirname, 'preload.js')
};
const RUNTIME_ASSET_DIR = path.join(__dirname, '../../assets');
const WINDOW_ICON_PATH = path.join(
  RUNTIME_ASSET_DIR,
  process.platform === 'win32' ? 'icon.ico' : 'icon.png'
);
const TRAY_ICON_PATH = path.join(
  RUNTIME_ASSET_DIR,
  process.platform === 'win32' ? 'icon.ico' : 'icon.png'
);

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
    icon: rest.icon || WINDOW_ICON_PATH,
    webPreferences: {
      ...RENDERER_WEB_PREFERENCES,
      ...webPreferences
    }
  });
}

function createFallbackTrayIcon() {
  return nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAdgAAAHYBTnsmCAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAFJSURBVDiNpdM9S8NAGMDx/5Nc0kKhUBwEwUVwcRMcXPwAfgAHBxEHQXDRr+Dg4CI4iYOTk4uDgyAIQnFwEAQHBUGQYqFJm+Z6DqZN2qTW5x7u7vfcc/cS/lMopQghEEKglEIpBSEESimUUiilIIRAKYVSCqUUSikIIVBKQQiBUgpCCJRSKKUghEAphVIKQgiUUiilIIRAKYVSCkIIlFIopSCEQCmFUgpCCJRSKKUghEAphVIKQgiUUiilIIRAKYVSCkIIlFIopSCEQCmFUgpCCJRSKKUghEAphVIKQgiUUiilIIRAKYVSCkIIlFIopSCEQCmFUgpCCJRSKKUghEAphVIKQgiUUiilIIRAKYVSCkIIlFIopSCEQCmFUgpCCJRSKKUghEAphVIKQgiUUiilIIRAKYVSCkIIlFIopSCEQCmFUgpCCJRSKKX4AXYVXKzFfX1yAAAAAElFTkSuQmCC'
  );
}

function getTrayIcon() {
  const icon = nativeImage.createFromPath(TRAY_ICON_PATH);
  if (icon && !icon.isEmpty()) {
    const size = process.platform === 'win32' ? 16 : 18;
    return icon.resize({ width: size, height: size });
  }

  return createFallbackTrayIcon();
}

function destroyTray() {
  if (!tray) {
    return;
  }

  try {
    tray.destroy();
  } catch (err) {
    console.error('Tray destroy error:', err);
  } finally {
    tray = null;
  }
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

function toBase64Url(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function createCodeVerifier() {
  return toBase64Url(crypto.randomBytes(32));
}

function createCodeChallenge(verifier) {
  return toBase64Url(crypto.createHash('sha256').update(verifier).digest());
}

function createOAuthResponsePage(title, message) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: #0d1117;
      color: #e6edf3;
      font: 16px/1.5 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      padding: 24px;
    }
    .card {
      max-width: 480px;
      width: 100%;
      padding: 24px;
      border-radius: 16px;
      background: #161b22;
      border: 1px solid rgba(240, 246, 252, 0.1);
      box-shadow: 0 20px 48px rgba(0, 0, 0, 0.35);
    }
    h1 {
      margin: 0 0 12px;
      font-size: 22px;
    }
    p {
      margin: 0;
      color: #9da7b3;
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;
}

function closePendingGoogleAuthFlow(error = null) {
  if (!pendingGoogleAuthFlow) {
    return;
  }

  const { server, timeoutId, reject } = pendingGoogleAuthFlow;
  pendingGoogleAuthFlow = null;

  if (timeoutId) {
    clearTimeout(timeoutId);
  }

  if (server) {
    try {
      server.close();
    } catch (closeError) {
      console.error('Google auth server close error:', closeError);
    }
  }

  if (error) {
    reject(error);
  }
}

function waitForGoogleOAuthCallback(redirectURL) {
  if (pendingGoogleAuthFlow) {
    throw new Error('A Google sign-in attempt is already in progress.');
  }

  const callbackURL = new URL(redirectURL);
  if (callbackURL.protocol !== 'http:') {
    throw new Error('Google auth redirect URL must use http://127.0.0.1 or localhost.');
  }

  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const requestURL = new URL(req.url || '/', `${callbackURL.protocol}//${req.headers.host || callbackURL.host}`);

      if (requestURL.pathname !== callbackURL.pathname) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not found');
        return;
      }

      const code = requestURL.searchParams.get('code');
      const error = requestURL.searchParams.get('error');
      const errorDescription = requestURL.searchParams.get('error_description');

      if (error) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(createOAuthResponsePage('Authentication Cancelled', 'Google sign-in did not complete. Return to FocusPal and try again.'));
        closePendingGoogleAuthFlow(new Error(errorDescription || error));
        return;
      }

      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(createOAuthResponsePage('Authentication Failed', 'No authorization code was returned. Return to FocusPal and try again.'));
        closePendingGoogleAuthFlow(new Error('Google sign-in failed because no authorization code was returned.'));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(createOAuthResponsePage('Authentication Complete', 'You can now return to FocusPal. This tab can be closed.'));

      const activeFlow = pendingGoogleAuthFlow;
      pendingGoogleAuthFlow = null;
      if (activeFlow?.timeoutId) {
        clearTimeout(activeFlow.timeoutId);
      }
      if (activeFlow?.server) {
        try {
          activeFlow.server.close();
        } catch (closeError) {
          console.error('Google auth server close error:', closeError);
        }
      }
      resolve({ code });
    });

    server.once('error', (err) => {
      pendingGoogleAuthFlow = null;
      reject(
        new Error(
          err?.code === 'EADDRINUSE'
            ? `Google sign-in could not start because ${callbackURL.origin} is already in use.`
            : `Google sign-in could not start: ${err.message}`
        )
      );
    });

    server.listen(Number(callbackURL.port), callbackURL.hostname, () => {
      const timeoutId = setTimeout(() => {
        closePendingGoogleAuthFlow(new Error('Google sign-in timed out. Try again.'));
      }, GOOGLE_AUTH_TIMEOUT_MS);

      pendingGoogleAuthFlow = {
        server,
        timeoutId,
        reject
      };
    });
  });
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

function readLookupSelectionText(clipboard) {
  try {
    const selectionText = clipboard.readText('selection');
    if (selectionText) {
      return selectionText.trim();
    }
  } catch (err) {
    // Ignore primary-selection read failures and fall back to the regular clipboard.
  }

  try {
    return (clipboard.readText() || '').trim();
  } catch (err) {
    return '';
  }
}

function startClipboardMonitor() {
  const { clipboard } = require('electron');
  stopClipboardMonitor();
  lastClipboardText = readLookupSelectionText(clipboard);

  clipboardMonitorInterval = setInterval(() => {
    try {
      const trimmed = readLookupSelectionText(clipboard);

      if (!isWordLookupEnabled()) {
        if (pendingLookupWord || lookupOpenTimeout) {
          pendingLookupWord = '';

          if (lookupOpenTimeout) {
            clearTimeout(lookupOpenTimeout);
            lookupOpenTimeout = null;
          }

          if (widgetWindow && !widgetWindow.isDestroyed()) {
            widgetWindow.webContents.send('word-cleared');
          }
        }

        lastClipboardText = trimmed;
        return;
      }

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
          lastClipboardText = trimmed;
          pendingLookupWord = '';
          if (lookupOpenTimeout) {
            clearTimeout(lookupOpenTimeout);
            lookupOpenTimeout = null;
          }

          if (widgetWindow && !widgetWindow.isDestroyed()) {
            widgetWindow.webContents.send('word-cleared');
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

function teardownAuthenticatedShell() {
  stopClipboardMonitor();
  destroyTray();

  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.close();
  }

  if (widgetWindow && !widgetWindow.isDestroyed()) {
    widgetWindow.close();
  }
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
    if (!isQuitting && !hasSession) {
      teardownAuthenticatedShell();
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
  tray = new Tray(getTrayIcon());
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

  if (error instanceof Error && error.message) {
    return error.message;
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

ipcMain.handle('auth-google', async () => {
  try {
    if (!supabaseClient.isConfigured()) {
      return {
        success: false,
        error: supabaseClient.getConfigError()
      };
    }

    const redirectURL = supabaseClient.getGoogleAuthRedirectURL();
    if (!redirectURL) {
      return {
        success: false,
        error: 'Google auth redirect URL is not configured.'
      };
    }

    const codeVerifier = createCodeVerifier();
    const codeChallenge = createCodeChallenge(codeVerifier);

    const callbackPromise = waitForGoogleOAuthCallback(redirectURL);
    const authURL = supabaseClient.getOAuthAuthorizeURL({
      provider: 'google',
      redirectTo: redirectURL,
      codeChallenge
    });

    await shell.openExternal(authURL);

    const { code } = await callbackPromise;
    const session = await supabaseClient.exchangeOAuthCodeForSession({
      authCode: code,
      codeVerifier
    });

    if (authWindow && !authWindow.isDestroyed()) {
      authWindow.show();
      authWindow.focus();
    }

    await completeAuthSuccess(session);
    return { success: true, user: normalizeSupabaseUser(session.user) };
  } catch (err) {
    closePendingGoogleAuthFlow();
    console.error('Google auth error:', err);
    return {
      success: false,
      error: getAuthErrorMessage(err, 'Google sign-in failed')
    };
  }
});

ipcMain.handle('auth-logout', async () => {
  try {
    await supabaseClient.signOut();
  } catch (err) {
    console.error('Logout error:', err);
  }
  
  clearAuthSession();
  teardownAuthenticatedShell();
  
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
  closePendingGoogleAuthFlow();
  stopClipboardMonitor();
  globalShortcut.unregisterAll();
});
