#!/usr/bin/env bash
# NearuVibe Build Script (macOS / Linux)
# Usage: chmod +x build.sh && ./build.sh [--mac|--win|--all]
set -euo pipefail

PLATFORM="${1:---mac}"

echo "=== NearuVibe Build ==="

# Step 1: Freeze Python orchestrator with PyInstaller
echo ""
echo "[1/3] Freezing orchestrator with PyInstaller..."
pushd orchestrator > /dev/null

if ! command -v pyinstaller &> /dev/null; then
    echo "Installing PyInstaller..."
    pip install pyinstaller
fi

pyinstaller nearu-orchestrator.spec --noconfirm
popd > /dev/null

echo "Orchestrator frozen to orchestrator/dist/nearu-orchestrator/"

# Step 2: Build Electron client
echo ""
echo "[2/3] Building Electron client..."
pushd client > /dev/null
npm run build
popd > /dev/null

echo "Client built to client/out/"

# Step 3: Package with electron-builder
echo ""
echo "[3/3] Packaging with electron-builder ($PLATFORM)..."
pushd client > /dev/null

case "$PLATFORM" in
    --mac)  npx electron-builder --mac ;;
    --win)  npx electron-builder --win ;;
    --all)  npx electron-builder --mac --win ;;
    *)      echo "Unknown platform: $PLATFORM (use --mac, --win, or --all)"; exit 1 ;;
esac

popd > /dev/null

echo ""
echo "=== Build Complete ==="
echo "Output in client/release/"
