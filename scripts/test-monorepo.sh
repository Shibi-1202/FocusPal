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
if [ -d "packages/desktop" ]; then
    pass
else
    fail "Missing package directories"
fi

# Test 2: Check if node_modules exist
test_step "Dependencies installed"
if [ -d "node_modules" ]; then
    pass
else
    fail "Dependencies not installed"
fi

# Test 3: Check package.json files
test_step "Package configurations valid"
if [ -f "package.json" ] && [ -f "packages/desktop/package.json" ]; then
    pass
else
    fail "Missing package.json files"
fi

# Test 4: Check if workspace is configured
test_step "npm workspace configured"
if grep -q '"workspaces"' package.json; then
    pass
else
    fail "Workspace not configured in root package.json"
fi

# Test 5: Check desktop entry point
test_step "Desktop entry point"
if [ -f "packages/desktop/src/main/main.js" ]; then
    pass
else
    fail "Missing desktop main process entry"
fi

# Test 6: Check desktop config
test_step "Desktop Supabase configuration"
if [ -f "packages/desktop/config/supabase.example.json" ] && [ -f "packages/desktop/src/main/supabaseConfig.js" ]; then
    pass
else
    fail "Missing Supabase configuration files"
fi

# Test 7: Check desktop packaging config
test_step "Desktop packaging configuration"
if [ -f "packages/desktop/electron-builder.yml" ]; then
    pass
else
    fail "Missing electron-builder configuration"
fi

# Test 8: Check if documentation exists
test_step "Documentation complete"
if [ -f "README.md" ] && [ -f "SUPABASE_SETUP.txt" ] && [ -f "GO_LIVE_INSTRUCTIONS.txt" ]; then
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
