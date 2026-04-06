#!/bin/bash

# FocusPal Monorepo Test Script
# This script verifies that the monorepo setup is working correctly

echo "🧪 Testing FocusPal Monorepo Setup"
echo "=================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
PASSED=0
FAILED=0

# Test function
test_step() {
    echo -n "Testing: $1... "
}

pass() {
    echo -e "${GREEN}✓ PASS${NC}"
    ((PASSED++))
}

fail() {
    echo -e "${RED}✗ FAIL${NC}"
    if [ ! -z "$1" ]; then
        echo "  Error: $1"
    fi
    ((FAILED++))
}

# Test 1: Check if packages exist
test_step "Package directories exist"
if [ -d "packages/shared" ] && [ -d "packages/desktop" ] && [ -d "packages/backend" ]; then
    pass
else
    fail "Missing package directories"
fi

# Test 2: Check if shared package is built
test_step "Shared package built"
if [ -d "packages/shared/dist" ] && [ -f "packages/shared/dist/index.js" ]; then
    pass
else
    fail "Shared package not built"
fi

# Test 3: Check if node_modules exist
test_step "Dependencies installed"
if [ -d "node_modules" ]; then
    pass
else
    fail "Dependencies not installed"
fi

# Test 4: Check if shared package can be imported
test_step "Shared package importable"
cd packages/desktop
if node -e "const { APIClient } = require('@focuspal/shared'); console.log('OK');" > /dev/null 2>&1; then
    cd ../..
    pass
else
    cd ../..
    fail "Cannot import shared package"
fi

# Test 5: Check if all exports are available
test_step "All exports available"
cd packages/desktop
EXPORTS=$(node -e "const shared = require('@focuspal/shared'); console.log(Object.keys(shared).length);" 2>/dev/null)
cd ../..
if [ "$EXPORTS" -gt "10" ]; then
    pass
else
    fail "Missing exports (found: $EXPORTS)"
fi

# Test 6: Check package.json files
test_step "Package configurations valid"
if [ -f "package.json" ] && [ -f "packages/shared/package.json" ] && [ -f "packages/desktop/package.json" ] && [ -f "packages/backend/package.json" ]; then
    pass
else
    fail "Missing package.json files"
fi

# Test 7: Check if workspace is configured
test_step "npm workspace configured"
if grep -q '"workspaces"' package.json; then
    pass
else
    fail "Workspace not configured in root package.json"
fi

# Test 8: Check if shared package has correct main entry
test_step "Shared package entry point"
if grep -q '"main": "dist/index.js"' packages/shared/package.json; then
    pass
else
    fail "Incorrect main entry in shared package"
fi

# Test 9: Check if TypeScript config exists
test_step "TypeScript configuration"
if [ -f "packages/shared/tsconfig.json" ]; then
    pass
else
    fail "Missing TypeScript configuration"
fi

# Test 10: Check if documentation exists
test_step "Documentation complete"
if [ -f "README.md" ] && [ -f "QUICKSTART.md" ] && [ -f "COMMANDS.md" ]; then
    pass
else
    fail "Missing documentation files"
fi

# Summary
echo ""
echo "=================================="
echo "Test Results:"
echo -e "  ${GREEN}Passed: $PASSED${NC}"
echo -e "  ${RED}Failed: $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ All tests passed! Monorepo is ready.${NC}"
    exit 0
else
    echo -e "${RED}❌ Some tests failed. Please check the errors above.${NC}"
    exit 1
fi
