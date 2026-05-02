#!/bin/bash

# Generate Android Keystore for GitHub Actions

echo "=========================================="
echo "Android Keystore Generation for CI/CD"
echo "=========================================="
echo ""

# Check for existing keystore
if [ -f "my-release-key.keystore" ]; then
    read -p "Keystore already exists. Overwrite? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Skipped."
        exit 0
    fi
fi

# Get information
read -p "Enter keystore password: " KEYSTORE_PASSWORD
read -p "Enter key alias (e.g., my-release-alias): " KEY_ALIAS
read -p "Enter key password: " KEY_PASSWORD

# Generate keystore
echo ""
echo "Generating keystore..."
keytool -genkey -v -keystore my-release-key.keystore \
    -keyalg RSA \
    -keysize 2048 \
    -validity 10000 \
    -alias "$KEY_ALIAS" \
    -storepass "$KEYSTORE_PASSWORD" \
    -keypass "$KEY_PASSWORD" \
    -dname "CN=Quidec, OU=Mobile, O=Quidec, L=Unknown, ST=Unknown, C=US"

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Keystore created successfully!"
    echo ""
    echo "📋 Encoding to base64..."
    echo ""
    
    # Encode to base64
    if [[ "$OSTYPE" == "darwin"* ]]; then
        KEYSTORE_BASE64=$(base64 -i my-release-key.keystore)
    else
        KEYSTORE_BASE64=$(base64 -w 0 my-release-key.keystore)
    fi
    
    echo "=========================================="
    echo "GitHub Secrets to Add:"
    echo "=========================================="
    echo ""
    echo "1. KEYSTORE_BASE64:"
    echo "$KEYSTORE_BASE64"
    echo ""
    echo "2. KEYSTORE_PASSWORD:"
    echo "$KEYSTORE_PASSWORD"
    echo ""
    echo "3. KEY_ALIAS:"
    echo "$KEY_ALIAS"
    echo ""
    echo "4. KEY_PASSWORD:"
    echo "$KEY_PASSWORD"
    echo ""
    echo "=========================================="
    echo ""
    echo "📍 Next steps:"
    echo "1. Go to GitHub: Settings > Secrets and variables > Actions"
    echo "2. Add the secrets above"
    echo "3. Keep my-release-key.keystore SAFE and DO NOT commit"
    echo "4. Add my-release-key.keystore to .gitignore"
    echo ""
    echo "To add to .gitignore:"
    echo 'echo "my-release-key.keystore" >> .gitignore'
    echo ""
else
    echo "❌ Failed to generate keystore"
    exit 1
fi
