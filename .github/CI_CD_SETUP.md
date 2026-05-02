# GitHub Actions CI/CD Setup Guide

## Overview

Complete CI/CD pipeline with 5 automated workflows for building and releasing the Quidec mobile app:

| Workflow | Trigger | Output |
|----------|---------|--------|
| **build-android-apk.yml** | Push to develop/staging/main, manual dispatch | Debug APK |
| **build-android-aab.yml** | Push to main, manual dispatch, tags | App Bundle (Play Store) |
| **build-ios.yml** | Push to main/develop, manual dispatch | IPA + TestFlight |
| **test.yml** | Push to any branch, PRs | Type check, lint, build test |
| **release.yml** | Manual dispatch or git tags | GitHub Release + all builds |

## Required Secrets

Add these to your GitHub repository settings: `Settings > Secrets and variables > Actions`

### Android Signing Secrets

```
KEYSTORE_BASE64              # Base64 encoded .keystore file
KEYSTORE_PASSWORD            # Keystore password
KEY_ALIAS                    # Key alias name
KEY_PASSWORD                 # Key password
```

**Generate keystore:**
```bash
keytool -genkey -v -keystore my-release-key.keystore \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias my-release-alias
```

**Encode to base64:**
```bash
# Mac/Linux
base64 -i my-release-key.keystore

# Windows PowerShell
[Convert]::ToBase64String([System.IO.File]::ReadAllBytes("my-release-key.keystore"))
```

### iOS Signing Secrets (Optional)

```
IOS_PROVISIONING_PROFILE_BASE64  # Base64 encoded .mobileprovision
IOS_CODE_SIGN_IDENTITY_BASE64    # Base64 encoded .p12 certificate
IOS_CODE_SIGN_PASSWORD            # Certificate password
APPLE_ID                          # Apple Developer ID
APPLE_ID_PASSWORD                 # App-specific password
ASC_PROVIDER                      # App Store Connect provider
```

### Server Secrets (Optional)

```
VITE_SERVER_URL                   # WebSocket server (defaults to wss://quidec-server.onrender.com)
```

### Notifications (Optional)

```
SLACK_WEBHOOK_URL                 # Slack webhook for build notifications
```

## Workflow Details

### 1. Test & Lint (`test.yml`)

Runs on every push and PR. Tests:
- TypeScript type checking
- ESLint linting
- Code formatting
- Build output validation
- Security audit

**Trigger:** Push to any branch or PR
**Time:** ~15 minutes

### 2. Build Android APK (`build-android-apk.yml`)

Builds debug and release APK for testing.

**Trigger:** 
- Push to develop/staging/main
- Manual workflow dispatch (select build type)

**Time:** ~20 minutes

**Output:** `app-debug.apk` or `app-release.apk`

**Usage:**
```bash
# Manual trigger from GitHub UI
# Or push to develop branch
git push origin develop
```

### 3. Build Android App Bundle (`build-android-aab.yml`)

Builds App Bundle for Google Play Store (recommended).

**Trigger:**
- Push to main branch
- Manual workflow dispatch
- Git tag (v*.*.*)

**Time:** ~20 minutes

**Output:** `app-release.aab` (ready for Play Store)

**Note:** Requires `KEYSTORE_BASE64` secret

### 4. Build iOS (`build-ios.yml`)

Builds IPA for TestFlight and App Store.

**Trigger:**
- Push to main/develop
- Manual workflow dispatch (select config)

**Time:** ~30 minutes

**Output:** `App.ipa` (TestFlight/App Store)

**Note:** Requires code signing secrets

### 5. Release (`release.yml`)

Orchestrates all builds and creates GitHub Release.

**Trigger:**
- Manual workflow dispatch (specify version)
- Git tag (v*.*.*)

**Time:** ~90 minutes total

**Output:** 
- GitHub Release
- APK + AAB + IPA artifacts
- Changelog

## How to Use

### 1. Set Up Secrets

```bash
# Go to GitHub Settings > Secrets
# Add Android secrets:
KEYSTORE_BASE64
KEYSTORE_PASSWORD
KEY_ALIAS
KEY_PASSWORD
```

### 2. Manual Test Build

```bash
# Push to develop branch
git push origin develop

# Or use GitHub UI:
# Actions tab > Build Android APK > Run workflow
```

### 3. Manual Release Build

```bash
# Option A: Use workflow dispatch
# GitHub Actions tab > Release workflow > Run workflow
# Enter version: 1.0.0

# Option B: Use git tag
git tag -a v1.0.0 -m "Release 1.0.0"
git push origin v1.0.0
```

### 4. Check Build Status

View progress in GitHub Actions tab:
- Real-time logs
- Artifact downloads
- Build reports

## Environment Variables

### Build Commands

Each workflow uses production build settings:
- TypeScript strict mode
- Terser minification (2 passes)
- Tree shaking enabled
- No source maps

### Server Connection

Default: `wss://quidec-server.onrender.com`

Override via `VITE_SERVER_URL` secret

## Troubleshooting

### Build Fails: "Keystore not found"

**Solution:** Add `KEYSTORE_BASE64` to secrets

### APK Won't Install

**Check:**
- Compatible Android version
- USB debugging enabled
- `adb` installed

### iOS Build Fails: "Code signing error"

**Solution:** 
- Add iOS code signing secrets
- Verify certificate is valid
- Check provisioning profile

### Build Hangs on Gradle

**Solution:**
- Workflow has 45-minute timeout
- Check Gradle output logs
- Try manual rebuild

## Security Best Practices

✅ **Store secrets safely:**
- Never commit .keystore or certificates
- Use GitHub Secrets for sensitive data
- Rotate credentials periodically
- Use app-specific passwords (Apple ID)

✅ **Version control:**
- Keep workflows in git
- Tag releases properly
- Document changes

✅ **Access control:**
- Limit who can trigger releases
- Use branch protection rules
- Require reviews for main branch

## Advanced Configuration

### Custom Build Steps

Edit workflows to add:
- Analytics integration
- Crash reporting setup
- Obfuscation configuration
- Performance optimization

### Deployment Integration

Workflows support:
- Upload to Play Store API
- TestFlight auto-deployment
- Firebase App Distribution
- Custom webhooks

### Notifications

Enable in `release.yml`:
- Slack notifications
- Email alerts
- Custom webhooks

## CI/CD Matrix

| Event | Workflow | Action |
|-------|----------|--------|
| Push to develop | test + build-apk | Run tests, build APK |
| Push to main | test + build-apk + build-aab | Full build, prepare release |
| Git tag v*.*.* | release | Build all, create release |
| Manual dispatch | Any workflow | User-triggered build |
| Pull request | test | Lint, type check only |

## Performance Tuning

**Current timeouts:**
- Ubuntu builds: 45 minutes
- macOS builds: 60 minutes

**Caching:**
- npm dependencies
- Gradle artifacts
- CocoaPods (iOS)

**Parallelization:**
- Test runs before builds
- Builds run in parallel
- Release aggregates results

## Next Steps

1. **Add Android secrets** to GitHub
2. **Test build pipeline**: Push to develop branch
3. **Create first release**: Use workflow dispatch or git tag
4. **Monitor builds**: Check Actions tab for status
5. **Set up notifications**: Add Slack webhook (optional)

## Examples

### Build for Testing
```bash
git checkout develop
git add .
git commit -m "New feature"
git push origin develop
# Watch Actions tab for APK
```

### Create Release
```bash
git checkout main
git tag -a v1.0.1 -m "Release 1.0.1"
git push origin v1.0.1
# Workflow triggers, builds all, creates release
```

### Manual Release (No Tag)
```bash
# GitHub Actions UI:
# Actions > Release > Run workflow
# Enter version: 1.0.1
# Workflow handles everything
```

## Support

- **Workflow logs:** GitHub Actions tab > select workflow > view logs
- **Build reports:** Download from artifacts
- **Documentation:** See workflow YAML files for details

---

**Status:** ✅ All workflows configured and ready to use

**Start:** Push code → Workflows trigger automatically
