const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('fp', {
  // Widget size
  expand:   ()      => ipcRenderer.send('widget-expand'),
  collapse: ()      => ipcRenderer.send('widget-collapse'),
  setCollapsedState: (mode) => ipcRenderer.send('widget-set-collapsed-state', mode),

  // Dragging
  getPosition: ()   => ipcRenderer.invoke('get-position'),
  setPosition: (x, y) => ipcRenderer.invoke('set-position', x, y),
  savePosition: (pos) => ipcRenderer.send('save-position', pos),

  // Persistent store
  get: (key)        => ipcRenderer.invoke('store-get', key),
  set: (key, value) => ipcRenderer.invoke('store-set', key, value),

  // Settings window
  openSettings: (tab) => ipcRenderer.send('open-settings', tab),
  closeSettings: () => ipcRenderer.send('close-settings'),
  notifySettingsUpdated: () => ipcRenderer.send('settings-updated'),

  // Auto-start
  setAutoStart: (enabled) => ipcRenderer.invoke('set-auto-start', enabled),
  getAutoStart: ()        => ipcRenderer.invoke('get-auto-start'),

  // Quit app
  quit: () => ipcRenderer.send('quit-app'),
  forceQuit: () => ipcRenderer.send('force-quit-app'),

  // Window controls
  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  closeWindow: () => ipcRenderer.send('close-window'),

  // EOD result
  sendEodResult: (result) => ipcRenderer.send('eod-result', result),

  // System DND
  toggleSystemDND: (enable) => ipcRenderer.invoke('toggle-system-dnd', enable),

  // Listen for data reload
  onReloadData: (cb) => ipcRenderer.on('reload-data', cb),

  // Authentication methods
  auth: {
    login: (email, password) => ipcRenderer.invoke('auth-login', email, password),
    register: (name, email, password) => ipcRenderer.invoke('auth-register', name, email, password),
    loginWithGoogle: () => ipcRenderer.invoke('auth-google'),
    logout: () => ipcRenderer.invoke('auth-logout'),
    getUser: () => ipcRenderer.invoke('auth-get-user'),
    requestPasswordReset: (email) => ipcRenderer.invoke('auth-forgot-password', email)
  },

  // Word lookup events
  onWordSelected: (cb) => ipcRenderer.on('word-selected', (e, data) => cb(data)),
  onWordCleared: (cb) => ipcRenderer.on('word-cleared', cb),
  onLookupClosed: (cb) => ipcRenderer.on('lookup-closed', cb),
  onLookupRequested: (cb) => ipcRenderer.on('lookup-requested', (e, data) => cb(data)),
  onLookupSettingUpdated: (cb) => ipcRenderer.on('lookup-setting-updated', (e, data) => cb(data)),
  openLookup: () => ipcRenderer.send('widget-lookup-open'),
  closeLookup: (state) => ipcRenderer.send('widget-lookup-close', state),
  resizeLookup: (size) => ipcRenderer.send('widget-lookup-resize', size),

  // Notifications
  onShowNotification: (cb) => ipcRenderer.on('show-notification', (e, data) => cb(data)),
  onFocusModeShortcut: (cb) => ipcRenderer.on('focus-mode-shortcut', cb),

  // Tab selection
  onSelectTab: (cb) => ipcRenderer.on('select-tab', (e, tab) => cb(tab)),

});
