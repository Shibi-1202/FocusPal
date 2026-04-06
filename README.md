# FocusPal

FocusPal is a floating desktop productivity companion for Windows and Linux.
The current app uses Supabase directly for authentication and cloud-synced user
state.

## Workspace

```text
packages/
  desktop/   Electron desktop app
scripts/     Local repo helper scripts
```

## Requirements

- Node.js 18+
- pnpm 8+
- A Supabase project

## Local setup

1. Install dependencies:

```bash
pnpm install
```

2. Configure Supabase for the desktop app:

- Copy `packages/desktop/config/supabase.example.json`
- Fill in `packages/desktop/config/supabase.json`
- Apply `SUPABASE_SETUP.sql` to your Supabase project

3. Start the desktop app:

```bash
pnpm start:desktop
```

## Useful commands

```bash
pnpm dev:desktop
pnpm build:desktop
pnpm test:monorepo
```

## Packaging

Build installers from the desktop package:

```bash
cd packages/desktop
pnpm build-linux
pnpm build-win
```

Build output:

```text
packages/desktop/dist/
```

## Live setup

Use these files:

- `SUPABASE_SETUP.sql`
- `SUPABASE_SETUP.txt`
- `GO_LIVE_INSTRUCTIONS.txt`

## Notes

- Windows and Linux desktop targets are configured
- macOS packaging is not configured yet
- The old custom backend has been removed from the active repo architecture
