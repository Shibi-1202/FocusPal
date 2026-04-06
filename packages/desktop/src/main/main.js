const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, globalShortcut, dialog } = require('electron');
const path = require('path');
const os = require('os');
const { randomUUID } = require('crypto');
const Store = require('electron-store');
const { APIClient } = require('@focuspal/shared');

const store = new Store();

// Initialize API client
const apiClient = new APIClient({
  baseURL: process.env.NODE_ENV === 'production'
    ? 'https://api.focuspal.com'
    : 'http://localhost:3000'
});

let widgetWindow = null;
let settingsWindow = null;
let authWindow = null;
let tray = null;
let clipboardMonitorInterval = null;
let lastClipboardText = '';
let currentCollapsedMode = 'dot';
let currentWidgetState = 'collapsed';
let widgetAnchorCenter = null;
let suppressAnchorCapture = 0;
let pendingLookupWord = '';
let lookupOpenTimeout = null;
let lookupAnchorCenter = null;
let lookupCollapsedState = null;
const USER_SCOPED_KEYS = new Set([
  'tasks',
  'taskHistory',
  'wordCache',
  'lastCloudTaskSync'
]);

// ── Window sizes ──────────────────────────────────────────────────────────────
const WIDGET_DOT = { width: 48, height: 48 };
const WIDGET_PILL = { width: 168, height: 48 };
const WIDGET_EXPANDED  = { width: 400, height: 260 };
const WIDGET_LOOKUP    = { width: 480, height: 220 };

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

function getCurrentUserId() {
  return store.get('auth.user.id') || null;
}

function getUserScopedStoreKey(userId, key) {
  return `users.${userId}.${key}`;
}

function getStoreValue(key) {
  const userId = getCurrentUserId();

  if (!USER_SCOPED_KEYS.has(key) || !userId) {
    return store.get(key);
  }

  const scopedKey = getUserScopedStoreKey(userId, key);
  if (store.has(scopedKey)) {
    return store.get(scopedKey);
  }

  const primaryUserId = store.get('app.primaryUserId');
  if (primaryUserId && primaryUserId === userId && store.has(key)) {
    return store.get(key);
  }

  return undefined;
}

function setStoreValue(key, value) {
  const userId = getCurrentUserId();

  if (!USER_SCOPED_KEYS.has(key) || !userId) {
    store.set(key, value);
    return;
  }

  const scopedKey = getUserScopedStoreKey(userId, key);
  store.set(scopedKey, value);
}

function showLookupForPendingWord() {
  if (!pendingLookupWord || !widgetWindow || widgetWindow.isDestroyed()) {
    return;
  }

  if (typeof widgetWindow.showInactive === 'function') {
    widgetWindow.showInactive();
  } else {
    widgetWindow.show();
  }
  setWidgetBounds(WIDGET_LOOKUP);
  widgetWindow.webContents.send('lookup-requested', { word: pendingLookupWord });
}

function launchMainApp() {
  if (!widgetWindow || widgetWindow.isDestroyed()) {
    createWidgetWindow();
  }

  if (!tray) {
    createTray();
  }

  startClipboardMonitor();
  syncCurrentDevicePosition(store.get('widgetPosition'));
}

function getDeviceRegistration() {
  let deviceId = store.get('device.id');
  if (!deviceId) {
    deviceId = randomUUID();
    store.set('device.id', deviceId);
  }

  return {
    deviceId,
    deviceName: `${os.hostname()} (${process.platform})`,
    platform: process.platform,
    widgetPosition: store.get('widgetPosition') || null
  };
}

async function syncCurrentDevicePosition(position) {
  if (!apiClient.getAccessToken()) {
    return;
  }

  try {
    const payload = getDeviceRegistration();
    payload.widgetPosition = position || payload.widgetPosition;
    await apiClient.post('/api/user/device', payload);
  } catch (err) {
    console.error('Device sync error:', err.message);
  }
}

// ── Clipboard monitoring for word lookup ──────────────────────────────────────
function startClipboardMonitor() {
  const { clipboard } = require('electron');
  stopClipboardMonitor();

  clipboardMonitorInterval = setInterval(() => {
    try {
      // Try to read from selection (Linux primary clipboard)
      let text = '';
      try {
        text = clipboard.readText('selection');
      } catch (e) {
        // Fallback to standard clipboard on Windows/Mac
        text = clipboard.readText();
      }
      
      // Check if text is valid for lookup
      if (text && text !== lastClipboardText) {
        const trimmed = text.trim();
        const wordCount = trimmed.split(/\s+/).length;
        
        // Only trigger for single words between 3 and 39 characters
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
      } else if ((!text || !text.trim()) && lastClipboardText) {
        // Text cleared
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
      // Silently ignore clipboard errors
    }
  }, 500); // Check every 500ms
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
}



// ── Create auth window ────────────────────────────────────────────────────────
function createAuthWindow() {
  if (authWindow && !authWindow.isDestroyed()) {
    authWindow.focus();
    return;
  }

  authWindow = new BrowserWindow({
    width: 450,
    height: 650,
    center: true,
    frame: false,
    resizable: false,
    alwaysOnTop: false,
    skipTaskbar: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  authWindow.loadFile(path.join(__dirname, '../renderer/auth.html'));

  // Prevent closing without authentication
  authWindow.on('close', (e) => {
    const hasToken = store.get('auth.accessToken');
    if (!hasToken) {
      e.preventDefault();
      dialog.showMessageBox(authWindow, {
        type: 'warning',
        title: 'Authentication Required',
        message: 'You must sign in to use FocusPal',
        buttons: ['OK']
      });
    }
  });

  authWindow.on('closed', () => { authWindow = null; });
}

// ── Create widget window ──────────────────────────────────────────────────────
function createWidgetWindow() {
  currentCollapsedMode = store.get('widgetCollapsedMode') === 'pill' ? 'pill' : 'dot';
  const initialPos = getCollapsedAnchorPosition('dot');
  currentWidgetState = 'collapsed';

  widgetWindow = new BrowserWindow({
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
    type: 'toolbar',          // Stays above most windows on Linux
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
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
  settingsWindow = new BrowserWindow({
    width: 520,
    height: 640,
    frame: false,
    transparent: false,
    resizable: false,
    center: true,
    skipTaskbar: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
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
  const canvas = require('electron').nativeImage.createEmpty();
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
  store.set('auth.accessToken', response.accessToken);
  store.set('auth.refreshToken', response.refreshToken);
  store.set('auth.user', response.user);
  apiClient.setTokens(response.accessToken, response.refreshToken);
}

function clearAuthSession() {
  store.delete('auth.accessToken');
  store.delete('auth.refreshToken');
  store.delete('auth.user');
  apiClient.clearTokens();
}

function completeAuthSuccess(response) {
  storeAuthSession(response);

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

  const senderWindow = BrowserWindow.fromWebContents(event.sender);
  if (senderWindow !== widgetWindow) return;

  if (currentWidgetState === 'collapsed') {
    captureWidgetAnchorFromWindow();
    const nextPosition = getCollapsedAnchorPosition(currentCollapsedMode);
    const snapped = applySnappedCollapsedPosition(nextPosition, currentCollapsedMode);
    setWidgetBounds(getCollapsedBounds(currentCollapsedMode), snapped);
    persistCollapsedPosition(currentCollapsedMode);
  }
});

// Widget lookup mode → resize to lookup card
ipcMain.on('widget-lookup-open', () => {
  if (!widgetWindow) return;
  captureWidgetAnchorFromWindow();
  lookupAnchorCenter = getWidgetAnchorCenter();
  lookupCollapsedState = {
    position: getCollapsedAnchorPosition(currentCollapsedMode),
    mode: currentCollapsedMode
  };
  currentWidgetState = 'lookup';
  setWidgetBounds(WIDGET_LOOKUP, getPositionFromCenter(getWidgetAnchorCenter(), WIDGET_LOOKUP));
});

ipcMain.on('widget-lookup-resize', (event, size) => {
  if (!widgetWindow || widgetWindow.isDestroyed()) return;

  const senderWindow = BrowserWindow.fromWebContents(event.sender);
  if (senderWindow !== widgetWindow) return;

  const width = Math.max(WIDGET_LOOKUP.width, Math.min(Number(size?.width) || WIDGET_LOOKUP.width, 640));
  const height = Math.max(WIDGET_LOOKUP.height, Math.min(Number(size?.height) || WIDGET_LOOKUP.height, 420));
  setWidgetBounds({ width, height });
});

ipcMain.on('widget-lookup-close', (event, state) => {
  if (!widgetWindow) return;
  if (state === 'expanded') {
    currentWidgetState = 'expanded';
    setWidgetBounds(WIDGET_EXPANDED, getPositionFromCenter(getWidgetAnchorCenter(), WIDGET_EXPANDED));
  } else {
    currentWidgetState = 'collapsed';
    if (lookupCollapsedState) {
      currentCollapsedMode = lookupCollapsedState.mode;
      const snapped = applySnappedCollapsedPosition(lookupCollapsedState.position, currentCollapsedMode);
      lookupCollapsedState = null;
      lookupAnchorCenter = null;
      setWidgetBounds(getCollapsedBounds(currentCollapsedMode), snapped);
      persistCollapsedPosition(currentCollapsedMode);
      widgetWindow.webContents.send('lookup-closed');
      return;
    } else if (lookupAnchorCenter) {
      setWidgetAnchorCenter(lookupAnchorCenter);
    }
    lookupAnchorCenter = null;
    const nextPosition = getCollapsedAnchorPosition(currentCollapsedMode);
    const snapped = applySnappedCollapsedPosition(nextPosition, currentCollapsedMode);
    setWidgetBounds(getCollapsedBounds(currentCollapsedMode), snapped);
    persistCollapsedPosition(currentCollapsedMode);
  }
  // Return to previous state - let renderer decide
  widgetWindow.webContents.send('lookup-closed');
});

// Save window position after drag
ipcMain.on('save-position', (e, pos) => {
  setWidgetAnchorCenter(getCenterFromPosition(pos, getCollapsedBounds(currentCollapsedMode)));
  const nextPosition = persistCollapsedPosition(currentCollapsedMode);
  syncCurrentDevicePosition(nextPosition);
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
ipcMain.handle('store-get', (e, key) => {
  try {
    return getStoreValue(key);
  } catch (err) {
    console.error('store-get error:', err);
    return null;
  }
});

ipcMain.handle('store-set', (e, key, value) => {
  try {
    setStoreValue(key, value);
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
  const window = BrowserWindow.fromWebContents(event.sender);
  if (window) window.minimize();
});

ipcMain.on('close-window', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (window) window.close();
});

// Quit app with EOD prompt
ipcMain.on('quit-app', async () => {
  const eodPrompt = store.get('eodPrompt', true);
  
  if (eodPrompt) {
    const { dialog, BrowserWindow } = require('electron');
    
    // Create custom EOD dialog
    const eodWindow = new BrowserWindow({
      width: 400,
      height: 250,
      center: true,
      frame: false,
      resizable: false,
      alwaysOnTop: true,
      modal: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js')
      }
    });
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: 'Segoe UI', system-ui, sans-serif;
            background: #1a1a1f;
            color: #f1f0ff;
            padding: 24px;
          }
          h2 { 
            font-size: 20px; 
            margin-bottom: 8px; 
            color: #a78bfa;
            display: flex;
            align-items: center;
            gap: 8px;
          }
          .subtitle {
            font-size: 13px;
            color: #8b8a9e;
            margin-bottom: 28px;
          }
          .question {
            font-size: 15px;
            font-weight: 600;
            color: #f1f0ff;
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
            background: #7c6cfc;
            color: #fff;
          }
          .btn-secondary {
            background: #2e2e35;
            color: #8b8a9e;
          }
          .checkbox-row {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 12px;
            color: #8b8a9e;
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
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          const planningPayload = {
            tab: 'tasks',
            planningDate: tomorrow.toISOString().split('T')[0],
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
    const response = await apiClient.post('/api/auth/login', { email, password });
    completeAuthSuccess(response);
    return { success: true, user: response.user };
  } catch (err) {
    console.error('Login error:', err);
    return { 
      success: false, 
      error: err.response?.data?.error || 'Invalid email or password'
    };
  }
});

ipcMain.handle('auth-register', async (e, name, email, password) => {
  try {
    const response = await apiClient.post('/api/auth/register', { displayName: name, email, password });
    completeAuthSuccess(response);
    return { success: true, user: response.user };
  } catch (err) {
    console.error('Register error:', err);
    const errorMsg = err.response?.data?.error || 'Registration failed';
    return { success: false, error: errorMsg };
  }
});

ipcMain.handle('auth-logout', async () => {
  try {
    const refreshToken = store.get('auth.refreshToken');
    if (refreshToken) {
      await apiClient.post('/api/auth/logout', { refreshToken });
    }
  } catch (err) {
    console.error('Logout error:', err);
  }
  
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
    const response = await apiClient.post('/api/auth/forgot-password', { email });
    return { success: true, ...response };
  } catch (err) {
    console.error('Forgot password error:', err);
    return {
      success: false,
      error: err.response?.data?.error || 'Password reset request failed'
    };
  }
});

// Auth success handler - close auth window and show widget
ipcMain.on('auth-success', () => {
  if (authWindow && !authWindow.isDestroyed()) {
    authWindow.close();
  }
  launchMainApp();
});

// Get API client instance for renderer
ipcMain.handle('api-get-client', () => {
  return {
    baseURL: apiClient.client?.defaults?.baseURL || 'http://localhost:3000',
    hasToken: !!apiClient.getAccessToken()
  };
});

// Set API tokens
ipcMain.handle('api-set-tokens', (e, accessToken, refreshToken) => {
  try {
    apiClient.setTokens(accessToken, refreshToken);
    return { success: true };
  } catch (err) {
    console.error('api-set-tokens error:', err);
    return { success: false, error: err.message };
  }
});

// Clear API tokens
ipcMain.handle('api-clear-tokens', () => {
  try {
    apiClient.clearTokens();
    return { success: true };
  } catch (err) {
    console.error('api-clear-tokens error:', err);
    return { success: false, error: err.message };
  }
});

// Generic API request handler
ipcMain.handle('api-request', async (e, method, url, data) => {
  try {
    let result;
    switch (method.toUpperCase()) {
      case 'GET':
        result = await apiClient.get(url);
        break;
      case 'POST':
        result = await apiClient.post(url, data);
        break;
      case 'PUT':
        result = await apiClient.put(url, data);
        break;
      case 'DELETE':
        result = await apiClient.delete(url);
        break;
      default:
        throw new Error(`Unsupported method: ${method}`);
    }
    return { success: true, data: result };
  } catch (err) {
    console.error('api-request error:', err);
    return { 
      success: false, 
      error: err.response?.data?.error || err.message,
      statusCode: err.response?.status
    };
  }
});

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
    // No tokens, show auth window
    createAuthWindow();
    return;
  }
  
  // Validate token by fetching user profile
  try {
    apiClient.setTokens(accessToken, refreshToken);
    await apiClient.get('/api/user/profile');

    if (!store.has('app.primaryUserId') && store.has('tasks')) {
      const currentUserId = getCurrentUserId();
      if (currentUserId) {
        store.set('app.primaryUserId', currentUserId);
      }
    }
    
    // Token is valid, proceed to main app
    launchMainApp();
  } catch (err) {
    console.error('Token validation failed:', err);
    clearAuthSession();
    createAuthWindow();
  }
});

app.on('window-all-closed', (e) => {
  // Don't quit when all windows close — stay in tray
  e.preventDefault();
});

app.on('before-quit', () => {
  stopClipboardMonitor();
  globalShortcut.unregisterAll();
  if (lookupOpenTimeout) {
    clearTimeout(lookupOpenTimeout);
    lookupOpenTimeout = null;
  }
});
