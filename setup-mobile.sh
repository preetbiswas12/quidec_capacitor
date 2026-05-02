#!/usr/bin/env bash

# Quidec Mobile App Build Setup Script
# Automatically configures the mobile app for development and production builds

set -e

echo "=========================================="
echo "Quidec Mobile App Build Setup"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check prerequisites
check_prerequisites() {
    echo "Checking prerequisites..."
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        echo -e "${RED}✗ Node.js not found${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ Node.js $(node -v)${NC}"
    
    # Check pnpm
    if ! command -v pnpm &> /dev/null; then
        echo -e "${RED}✗ pnpm not found${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ pnpm $(pnpm -v)${NC}"
    
    # Check Java
    if command -v java &> /dev/null; then
        echo -e "${GREEN}✓ Java $(java -version 2>&1 | grep version)${NC}"
    else
        echo -e "${YELLOW}⚠ Java not found (required for Android builds)${NC}"
    fi
    
    # Check Android SDK
    if [ -z "$ANDROID_HOME" ]; then
        echo -e "${YELLOW}⚠ ANDROID_HOME not set (required for Android builds)${NC}"
    else
        echo -e "${GREEN}✓ ANDROID_HOME: $ANDROID_HOME${NC}"
    fi
    
    echo ""
}

# Install dependencies
install_dependencies() {
    echo "Installing dependencies..."
    cd web
    pnpm install
    cd ..
    echo -e "${GREEN}✓ Dependencies installed${NC}"
    echo ""
}

# Setup environment files
setup_env() {
    echo "Setting up environment files..."
    
    if [ ! -f web/.env ]; then
        echo "Creating .env for production..."
        cat > web/.env << 'EOF'
VITE_SERVER_URL=wss://quidec-server.onrender.com
VITE_API_URL=https://quidec-server.onrender.com
VITE_PACKAGE_NAME=com.quidec.chat
VITE_APP_NAME=Quidec
VITE_APP_VERSION=1.0.0
VITE_DEBUG=false
VITE_ALLOW_CLEARTEXT=false
EOF
        echo -e "${GREEN}✓ Created .env${NC}"
    fi
    
    if [ ! -f web/.env.development ]; then
        echo "Creating .env.development for local development..."
        cat > web/.env.development << 'EOF'
VITE_SERVER_URL=ws://localhost:3000
VITE_API_URL=http://localhost:3000
VITE_PACKAGE_NAME=com.quidec.chat
VITE_APP_NAME=Quidec
VITE_APP_VERSION=1.0.0
VITE_DEBUG=true
VITE_ALLOW_CLEARTEXT=true
EOF
        echo -e "${GREEN}✓ Created .env.development${NC}"
    fi
    
    echo ""
}

# Build web app
build_web() {
    echo "Building web app..."
    cd web
    pnpm build:web
    cd ..
    echo -e "${GREEN}✓ Web app built${NC}"
    echo ""
}

# Sync to Capacitor
sync_capacitor() {
    echo "Syncing to Capacitor..."
    cd web
    
    echo "Syncing Android..."
    npx cap sync android
    
    if command -v xcode-select &> /dev/null; then
        echo "Syncing iOS..."
        npx cap sync ios
    fi
    
    cd ..
    echo -e "${GREEN}✓ Capacitor synced${NC}"
    echo ""
}

# Create keystore for signing
create_keystore() {
    echo ""
    read -p "Do you want to create a release keystore for Android signing? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        if command -v keytool &> /dev/null; then
            keytool -genkey -v -keystore web/my-release-key.keystore \
              -keyalg RSA -keysize 2048 -validity 10000 \
              -alias my-release-alias
            echo -e "${GREEN}✓ Keystore created: web/my-release-key.keystore${NC}"
        else
            echo -e "${RED}✗ keytool not found${NC}"
        fi
    fi
    echo ""
}

# Print next steps
print_next_steps() {
    echo "=========================================="
    echo -e "${GREEN}Setup Complete!${NC}"
    echo "=========================================="
    echo ""
    echo "Next steps:"
    echo ""
    echo "1. For development (with hot reload):"
    echo "   Terminal 1: cd web && pnpm dev"
    echo "   Terminal 2: pnpm sync:android"
    echo ""
    echo "2. For Android debug APK:"
    echo "   pnpm build:android:apk"
    echo ""
    echo "3. For Android release AAB (Play Store):"
    echo "   pnpm build:android:aab"
    echo ""
    echo "4. For iOS:"
    echo "   pnpm open:ios (then build in Xcode)"
    echo ""
    echo "5. View detailed build instructions:"
    echo "   cat web/MOBILE_BUILD_GUIDE.md"
    echo ""
    echo "Documentation: web/MOBILE_BUILD_GUIDE.md"
    echo "Environment: web/.env (production) / web/.env.development (dev)"
    echo ""
}

# Main execution
main() {
    check_prerequisites
    install_dependencies
    setup_env
    build_web
    sync_capacitor
    create_keystore
    print_next_steps
}

# Run main function
main
