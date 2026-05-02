# Android Keystore Setup Guide

## Step 1: Generate Release Keystore (One-time)

Run this command in the `web/` directory:

```powershell
cd android
keytool -genkey -v -keystore keystore.jks -keyalg RSA -keysize 2048 -validity 10000 -alias quidec_key
```

You'll be prompted for:
- **Keystore password**: Remember this! Example: `MySecurePassword123`
- **Key password**: Same as keystore password is fine
- **Name (First and Last)**: `Quidec Developer`
- **Organizational Unit**: `Mobile Development`
- **Organization**: `Aegix`
- **City/Locality**: Your city
- **State/Province**: Your state
- **Country Code**: `IN` (or your country)

This creates `android/keystore.jks` with your release key.

---

## Step 2: Add Keystore to GitHub Secrets

### Convert keystore to base64:

```powershell
cd android
certutil -encode keystore.jks keystore.b64
# Read the file and copy the content (skip first and last lines)
# Or use PowerShell:
$bytes = [System.IO.File]::ReadAllBytes("keystore.jks")
$base64 = [Convert]::ToBase64String($bytes)
$base64 | Set-Clipboard  # Copies to clipboard
```

### Add to GitHub Secrets:

1. Go to **Settings → Secrets and variables → Actions**
2. Add these secrets:
   - **KEYSTORE_BASE64**: Paste the base64 encoded keystore
   - **KEYSTORE_PASSWORD**: Your keystore password
   - **KEY_ALIAS**: `quidec_key` (or whatever you chose)
   - **KEY_PASSWORD**: Same as keystore password

---

## Step 3: Protect Your Keystore

Add to `.gitignore` (keep locally only, never commit):

```
android/keystore.jks
android/keystore.b64
*.jks
*.keystore
```

---

## Automated Build Process

Once configured:
- **Push to `develop`/`staging`**: Triggers release APK build with signing
- **Fallback**: If secrets aren't set, builds unsigned debug APK

Your workflow now:
✅ Checks if keystore exists
✅ Uses signing if available
✅ Falls back to debug build if not
✅ Exports APK to `android/app/build/outputs/apk/`

---

## Testing Locally (Optional)

To test signing locally before pushing:

```powershell
cd android
set KEYSTORE_PATH=%cd%\keystore.jks
set KEYSTORE_PASSWORD=YourPassword
set KEY_ALIAS=quidec_key
set KEY_PASSWORD=YourPassword

.\gradlew clean assembleRelease
```

The signed APK will be in `app/build/outputs/apk/release/app-release.apk`
