#!/bin/bash

# FocusPal Monorepo Setup Script
# This script restructures the project into a monorepo

echo "🚀 Setting up FocusPal Monorepo..."

# Create packages directory
mkdir -p packages/{shared,desktop,mobile}

# Move existing desktop code
echo "📦 Moving desktop code..."
mkdir -p packages/desktop
mv src packages/desktop/ 2>/dev/null || true
mv electron-builder.yml packages/desktop/ 2>/dev/null || true
cp package.json packages/desktop/

# Move backend code
echo "📦 Moving backend code..."
mv backend packages/ 2>/dev/null || true

# Create shared package
echo "📦 Creating shared package..."
mkdir -p packages/shared/src/{api,types,utils,constants}

cat > packages/shared/package.json << 'EOF'
{
  "name": "@focuspal/shared",
  "version": "1.0.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "axios": "^1.6.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0"
  }
}
EOF

cat > packages/shared/tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "declaration": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
EOF

cat > packages/shared/src/index.ts << 'EOF'
// Shared exports
export * from './api';
export * from './types';
export * from './utils';
export * from './constants';
EOF

# Create root package.json
echo "📦 Creating root package.json..."
cat > package.json << 'EOF'
{
  "name": "focuspal-monorepo",
  "version": "1.0.0",
  "private": true,
  "workspaces": [
    "packages/*"
  ],
  "scripts": {
    "dev:desktop": "yarn workspace @focuspal/desktop dev",
    "dev:mobile": "yarn workspace @focuspal/mobile start",
    "dev:backend": "yarn workspace @focuspal/backend dev",
    "build:desktop": "yarn workspace @focuspal/desktop build",
    "build:mobile": "yarn workspace @focuspal/mobile build:android",
    "build:backend": "yarn workspace @focuspal/backend build",
    "build:all": "yarn build:desktop && yarn build:mobile && yarn build:backend",
    "test": "yarn workspaces run test",
    "lint": "yarn workspaces run lint",
    "clean": "yarn workspaces run clean"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "eslint": "^8.0.0",
    "prettier": "^3.0.0"
  }
}
EOF

# Update desktop package.json
echo "📦 Updating desktop package.json..."
cat > packages/desktop/package.json << 'EOF'
{
  "name": "@focuspal/desktop",
  "version": "1.0.0",
  "description": "FocusPal Desktop App",
  "main": "src/main/main.js",
  "scripts": {
    "start": "electron . --no-sandbox",
    "dev": "electron . --dev --no-sandbox",
    "build": "electron-builder",
    "build-linux": "electron-builder --linux",
    "build-win": "electron-builder --win",
    "build-all": "electron-builder --linux --win"
  },
  "dependencies": {
    "@focuspal/shared": "1.0.0",
    "electron-store": "^8.1.0"
  },
  "devDependencies": {
    "electron": "^28.0.0",
    "electron-builder": "^24.0.0"
  }
}
EOF

# Update backend package.json
echo "📦 Updating backend package.json..."
if [ -f "packages/backend/package.json" ]; then
  # Add name field
  sed -i 's/"name": "focuspal-backend"/"name": "@focuspal\/backend"/' packages/backend/package.json
fi

# Create .gitignore
echo "📦 Creating .gitignore..."
cat > .gitignore << 'EOF'
# Dependencies
node_modules/
*/node_modules/

# Build outputs
dist/
*/dist/
build/
*/build/

# Environment
.env
.env.local
*.log

# OS
.DS_Store
Thumbs.db

# IDE
.vscode/
.idea/
*.swp
*.swo

# Electron
packages/desktop/dist/

# Mobile
packages/mobile/android/app/build/
packages/mobile/ios/build/
EOF

echo "✅ Monorepo setup complete!"
echo ""
echo "Next steps:"
echo "1. Run: yarn install"
echo "2. Run: yarn dev:desktop (or dev:mobile, dev:backend)"
echo "3. Run: yarn build:all"
