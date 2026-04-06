# FocusPal Monorepo

A smart floating productivity companion for Desktop (Windows, Linux) and Mobile (Android).

## 🚀 Quick Start

**New to FocusPal?** Check out the [Quick Start Guide](./QUICKSTART.md) to get running in 5 minutes!

```bash
# Install and build
pnpm install

# Verify setup
pnpm test:monorepo

# Start desktop app
pnpm start:desktop
```

## 🏗️ Monorepo Structure

```
focuspal/
├── packages/
│   ├── shared/          # Shared code (API client, types, utils)
│   ├── desktop/         # Electron app (Windows, Linux)
│   ├── mobile/          # React Native app (Android) - Coming soon
│   └── backend/         # Node.js API server
├── scripts/             # Build and deployment scripts
├── docs/                # Documentation
└── package.json         # Root workspace configuration
```

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- pnpm 8+ (fast, efficient package manager)
- PostgreSQL (for backend)

### Installation

```bash
# Install pnpm if you don't have it
npm install -g pnpm

# Install all dependencies
pnpm install

# This will also build the shared package
```

### Development

```bash
# Run desktop app
pnpm dev:desktop

# Run backend API (in another terminal)
pnpm dev:backend

# Build shared package (if you make changes)
pnpm build:shared
```

### Building

```bash
# Build all packages
pnpm build:all

# Build specific package
pnpm build:desktop
pnpm build:backend

# Build desktop installers
cd packages/desktop
pnpm build-linux    # .deb and AppImage
pnpm build-win      # .exe installer and portable
```

## 📦 Packages

### @focuspal/shared
Shared code used across all platforms:
- API client
- TypeScript types
- Utilities
- Constants

### @focuspal/desktop
Electron desktop application:
- Windows (.exe)
- Linux (.deb, AppImage)

### @focuspal/backend
Node.js API server:
- Authentication
- Cloud sync
- Analytics
- Word lookup cache

### @focuspal/mobile (Coming Soon)
React Native mobile app:
- Android (.apk)

## 🛠️ Development Workflow

### Making Changes

**Shared Code:**
```bash
cd packages/shared
# Make changes
pnpm build
# Changes automatically available to desktop/mobile
```

**Desktop:**
```bash
cd packages/desktop
pnpm dev
```

**Backend:**
```bash
cd packages/backend
pnpm dev
```

### Adding Dependencies

**To shared package:**
```bash
pnpm add axios --filter @focuspal/shared
```

**To desktop package:**
```bash
pnpm add electron-store --filter @focuspal/desktop
```

**To root (dev dependencies):**
```bash
pnpm add -D -w typescript
```

## 📚 Documentation

- [Quick Start](./QUICKSTART.md) - Get started in 5 minutes
- [Commands Reference](./COMMANDS.md) - All commands in one place
- [Architecture](./ARCHITECTURE.md) - System design and deployment
- [Product Requirements](./PRD.md) - Feature specifications
- [Development Plan](./PLAN.md) - Implementation roadmap

## 🧪 Testing

```bash
# Run all tests
pnpm test

# Test specific package
pnpm --filter @focuspal/shared test
```

## 🚢 Deployment

### Quick Local Testing
```bash
# One-command setup and run
./quick-start.sh
```

### Backend Deployment

**Railway (Recommended):**
```bash
cd packages/backend
railway login
railway init
railway add postgresql
railway up
```

**Manual Setup:**
See [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) for complete instructions.

### Desktop Distribution
```bash
cd packages/desktop
pnpm build-all
# Installers in packages/desktop/dist/
```

### Testing
```bash
# Test backend API
./test-api.sh

# Test with cloud backend
./test-api.sh https://your-api.railway.app
```

For detailed deployment instructions, see [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md).

## 📝 Scripts

- `pnpm dev:desktop` - Run desktop app in development
- `pnpm dev:backend` - Run backend API in development
- `pnpm build:all` - Build all packages
- `pnpm test:monorepo` - Test monorepo setup
- `pnpm clean` - Clean all build artifacts
- `pnpm test` - Run all tests
- `pnpm lint` - Lint all packages

## 🤝 Contributing

1. Make changes in appropriate package
2. Build shared package if modified
3. Test changes
4. Commit with conventional commits

## 📄 License

MIT

## 🔗 Links

- [Backend API Documentation](./packages/backend/README.md)
- [Shared Package Documentation](./packages/shared/README.md)
