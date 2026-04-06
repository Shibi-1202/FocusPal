# @focuspal/shared

Shared code for FocusPal across all platforms (Desktop, Mobile, Web).

## What's Inside

- **API Client:** HTTP client with authentication and token refresh
- **Types:** TypeScript interfaces for all data models
- **Utils:** Common utilities (time formatting, validation, etc.)
- **Constants:** Shared constants (colors, sizes, defaults)

## Usage

### In Desktop App
```javascript
import { APIClient, Task, formatTime } from '@focuspal/shared';

const api = new APIClient({ baseURL: 'https://api.focuspal.com' });
```

### In Mobile App
```typescript
import { APIClient, Task, formatTime } from '@focuspal/shared';

const api = new APIClient({ baseURL: 'https://api.focuspal.com' });
```

## Development

```bash
# Build
yarn build

# Watch mode
yarn dev

# Clean
yarn clean
```

## Structure

```
src/
├── api/           # API client and endpoints
├── types/         # TypeScript types
├── utils/         # Utilities
├── constants/     # Constants
└── index.ts       # Main export
```
