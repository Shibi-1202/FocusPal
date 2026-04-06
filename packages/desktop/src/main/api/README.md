# Desktop API Integration

## Migration to Shared Package

The API client has been moved to `@focuspal/shared` package. The old `client.js` file is no longer needed.

## Usage

### In Main Process (main.js)

```javascript
const { APIClient } = require('@focuspal/shared');

// Initialize API client
const apiClient = new APIClient({
  baseURL: process.env.NODE_ENV === 'production'
    ? 'https://api.focuspal.com'
    : 'http://localhost:3000'
});

// Set tokens after login
apiClient.setTokens(accessToken, refreshToken);

// Make requests
const tasks = await apiClient.get('/api/tasks');
const newTask = await apiClient.post('/api/tasks', { name: 'My Task' });
```

### In Renderer Process (widget.html, settings.html)

API calls are exposed via IPC through `window.fp.api`:

```javascript
// Set tokens after login
await window.fp.api.setTokens(accessToken, refreshToken);

// Make GET request
const result = await window.fp.api.request('GET', '/api/tasks');
if (result.success) {
  const tasks = result.data;
  console.log('Tasks:', tasks);
} else {
  console.error('Error:', result.error);
}

// Make POST request
const result = await window.fp.api.request('POST', '/api/tasks', {
  name: 'New Task',
  priority: 'high',
  startTime: '09:00',
  endTime: '10:00'
});

// Clear tokens on logout
await window.fp.api.clearTokens();
```

## Available API Methods

All API methods from `@focuspal/shared` are available:

### Authentication
```javascript
const { AuthAPI } = require('@focuspal/shared');
const authAPI = new AuthAPI(apiClient);

await authAPI.register(email, password, name);
await authAPI.login(email, password);
await authAPI.logout(refreshToken);
```

### Tasks
```javascript
const { TasksAPI } = require('@focuspal/shared');
const tasksAPI = new TasksAPI(apiClient);

await tasksAPI.getTasks();
await tasksAPI.createTask(taskData);
await tasksAPI.updateTask(taskId, updates);
await tasksAPI.deleteTask(taskId);
await tasksAPI.completeTask(taskId, status);
```

### Settings
```javascript
const { SettingsAPI } = require('@focuspal/shared');
const settingsAPI = new SettingsAPI(apiClient);

await settingsAPI.getSettings();
await settingsAPI.updateSettings(updates);
```

### Word Lookup
```javascript
const { WordLookupAPI } = require('@focuspal/shared');
const wordLookupAPI = new WordLookupAPI(apiClient);

await wordLookupAPI.getCachedWords();
await wordLookupAPI.addWord(word, definition, translation);
await wordLookupAPI.deleteWord(wordId);
```

## Types

TypeScript types are also available:

```javascript
const { 
  // Types are in the shared package
} = require('@focuspal/shared');
```

## Benefits

✅ Single API client shared across desktop and mobile
✅ Automatic token refresh on 401 errors
✅ Type safety with TypeScript definitions
✅ Consistent error handling
✅ Easy to maintain and update
