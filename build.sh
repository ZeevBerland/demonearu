#!/usr/bin/env bash
# NearuVibe Build Script (macOS / Linux)
# Usage: chmod +x build.sh && ./build.sh [--mac|--win|--all]
set -euo pipefail

PLATFORM="${1:---mac}"

echo "=== NearuVibe Build ==="

# Step 1: Freeze Python orchestrator with PyInstaller
echo ""
echo "[1/4] Freezing orchestrator with PyInstaller..."
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
echo "[2/4] Building Electron client..."
pushd client > /dev/null
npm run build
popd > /dev/null

echo "Client built to client/out/"

# Step 3: Package with electron-builder (skip its signing on macOS)
echo ""
echo "[3/4] Packaging with electron-builder ($PLATFORM)..."
pushd client > /dev/null

case "$PLATFORM" in
    --mac)
        CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac --dir --publish never
        ;;
    --win)
        npx electron-builder --win --publish never
        ;;
    --all)
        CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac --dir --publish never
        npx electron-builder --win --publish never
        ;;
    *)
        echo "Unknown platform: $PLATFORM (use --mac, --win, or --all)"
        exit 1
        ;;
esac

popd > /dev/null

# Step 4: Re-sign macOS app to fix Team ID mismatch, then create DMG/ZIP
if [[ "$PLATFORM" == "--mac" || "$PLATFORM" == "--all" ]]; then
    echo ""
    echo "[4/4] Signing and packaging macOS app..."

    APP=$(find client/release -name "*.app" -maxdepth 2 -type d | head -1)
    if [ -z "$APP" ]; then
        echo "ERROR: No .app bundle found in client/release/"
        exit 1
    fi

    echo "  Fixing permissions..."
    chmod -R +x "$APP/Contents/Resources/orchestrator/" 2>/dev/null || true

    echo "  Re-signing: $APP"
    codesign --force --deep --sign - "$APP"
    codesign --verify --deep --strict "$APP" 2>&1 || true

    APP_DIR=$(dirname "$APP")
    APP_NAME=$(basename "$APP")
    VERSION=$(node -p "require('./client/package.json').version")

    echo "  Creating DMG..."
    hdiutil create -volname "NearuVibe" -srcfolder "$APP_DIR" \
        -ov -format UDZO "client/release/NearuVibe-${VERSION}-arm64.dmg"

    echo "  Creating ZIP..."
    cd "$APP_DIR" && ditto -c -k --sequesterRsrc --keepParent "$APP_NAME" \
        "../NearuVibe-${VERSION}-mac.zip"
    cd - > /dev/null
else
    echo ""
    echo "[4/4] Skipping macOS signing (not a mac build)."
fi

echo ""
echo "=== Build Complete ==="
echo "Output in client/release/"
