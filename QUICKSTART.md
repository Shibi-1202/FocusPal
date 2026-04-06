# FocusPal - Quick Start Guide

Get up and running with FocusPal in 5 minutes!

## Prerequisites

- Node.js 18+ installed
- pnpm 8+ (will install in Step 1)
- PostgreSQL installed (for backend)
- Linux or Windows OS

## Step 1: Install pnpm & Dependencies

```bash
# Install pnpm globally (if you don't have it)
npm install -g pnpm

# Install all project dependencies
pnpm install
```

This will:
- Install all dependencies for all packages
- Build the shared package automatically
- Set up the monorepo workspace

## Step 2: Verify Setup

```bash
./scripts/test-monorepo.sh
```

You should see:
```
✅ All tests passed! Monorepo is ready.
```

## Step 3: Set Up Backend (Optional)

If you want to use the backend API:

```bash
cd packages/backend

# Copy environment template
cp .env.example .env

# Edit .env with your database credentials
nano .env

# Set up database
psql -U postgres -f src/config/database.sql

# Start backend
pnpm start
```

Backend will run on `http://localhost:3000`

## Step 4: Run Desktop App

```bash
pnpm start:desktop
```

The FocusPal widget will appear in the bottom-right corner of your screen!

## What You'll See

1. **Floating Dot**: A small purple dot in the bottom-right corner
2. **Click to Open**: Click the dot to open the task widget
3. **Drag to Move**: Click and hold to drag the widget anywhere
4. **Right-click Tray**: Access settings and quit from the system tray

## Basic Usage

### Creating a Task

1. Click the floating dot
2. Click "Add Task" button
3. Fill in task details:
   - Task name
   - Start/End time
   - Priority (affects color)
   - Recurring schedule
4. Click "Save"

### Task Colors

- 🔴 Red: Critical priority
- 🟠 Amber: High priority
- 🟡 Yellow: Medium priority
- 🟢 Green: Low priority
- 🔵 Blue: Info/Notes
- 🟣 Purple: Personal

### Settings

Right-click the tray icon → Settings to configure:
- Auto-start on login
- Break reminders
- End-of-day prompts
- Word lookup cache size
- Time format (12H/24H)

## Development Mode

### Run Desktop in Dev Mode
```bash
pnpm dev:desktop
```

### Run Backend in Dev Mode
```bash
pnpm dev:backend
```

### Make Changes to Shared Code
```bash
cd packages/shared
# Edit files in src/
pnpm build
# Changes now available to desktop app
```

## Building Installers

### Linux (.deb + AppImage)
```bash
cd packages/desktop
pnpm build-linux
```

Installers will be in `packages/desktop/dist/`

### Windows (.exe)
```bash
cd packages/desktop
pnpm build-win
```

## Troubleshooting

### Desktop app won't start
```bash
# Rebuild shared package
pnpm build:shared

# Try starting again
pnpm start:desktop
```

### Backend connection error
```bash
# Make sure backend is running
cd packages/backend
pnpm start

# Check if it's on port 3000
curl http://localhost:3000/api/health
```

### Import errors
```bash
# Clean and reinstall
pnpm clean
pnpm install
```

## Next Steps

1. ✅ App is running
2. Create your first task
3. Try dragging the widget
4. Explore settings
5. Set up backend for cloud sync
6. Read the full documentation:
   - [Architecture](./ARCHITECTURE.md)
   - [Monorepo Strategy](./MONOREPO_STRATEGY.md)
   - [Product Requirements](./PRD.md)

## Commands Cheat Sheet

```bash
# Development
pnpm dev:desktop             # Run desktop app
pnpm dev:backend             # Run backend API

# Building
pnpm build:all               # Build everything
pnpm build:shared            # Build shared package only

# Testing
./scripts/test-monorepo.sh   # Test monorepo setup
pnpm test                    # Run all tests

# Starting
pnpm start:desktop           # Start desktop app
pnpm start:backend           # Start backend API

# Cleaning
pnpm clean                   # Clean all build artifacts
```

## Getting Help

- Check [README.md](./README.md) for full documentation
- Check [COMMANDS.md](./COMMANDS.md) for all available commands
- Check [ARCHITECTURE.md](./ARCHITECTURE.md) for system design

## Success Checklist

- [ ] Dependencies installed (`npm install`)
- [ ] Tests pass (`./scripts/test-monorepo.sh`)
- [ ] Desktop app starts (`npm run start:desktop`)
- [ ] Widget appears on screen
- [ ] Can click and drag widget
- [ ] Can open settings
- [ ] Backend running (optional)

---

**Ready to build?** Start creating tasks and boost your productivity! 🚀
