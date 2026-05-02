# 🚀 Complete Build Pipeline Setup

This document explains the full automated build system for Quidec mobile app.

## Overview

**5 GitHub Actions Workflows:**

| Workflow | Purpose | Trigger |
|----------|---------|---------|
| **verify.yml** | Code quality + build test | Every push/PR |
| **test.yml** | Type check, lint, security | Every push |
| **build-android-apk.yml** | Debug & release APK | Push or manual |
| **build-android-aab.yml** | Play Store App Bundle | Main branch or manual |
| **build-ios.yml** | TestFlight/App Store IPA | Main branch or manual |
| **release.yml** | Full orchestrated release | Manual or git tag |

## Quick Start

### 1. Generate Android Keystore

```bash
cd web/.github
bash generate-keystore.sh

# Answer prompts:
# - Keystore password: [enter password]
# - Key alias: my-release-alias
# - Key password: [enter password]

# ✅ Script outputs: KEYSTORE_BASE64, KEYSTORE_PASSWORD, KEY_ALIAS, KEY_PASSWORD
```

### 2. Add Secrets to GitHub

```
Settings > Secrets and variables > Actions > New repository secret
```

**Add these secrets:**
```
KEYSTORE_BASE64         [from generate-keystore.sh output]
KEYSTORE_PASSWORD       [from generate-keystore.sh output]
KEY_ALIAS              [from generate-keystore.sh output]
KEY_PASSWORD           [from generate-keystore.sh output]
VITE_SERVER_URL        wss://quidec-server.onrender.com (optional)
```

### 3. Add .gitignore Entry

```bash
echo "my-release-key.keystore" >> .gitignore
git add .gitignore
git commit -m "Add keystore to gitignore"
git push
```

### 4. Test the Pipeline

```bash
# Push to develop branch
git push origin develop

# View in GitHub Actions tab - should see:
# 1. verify.yml - Code quality checks
# 2. test.yml - Type check & lint
# 3. build-android-apk.yml - Build APK
```

## Workflow Details

### verify.yml - Code Quality Verification

**When:** Every push & pull request  
**Time:** ~10 minutes  
**Actions:**
- TypeScript type check
- Code formatting (Prettier)
- ESLint linting
- Build verification (Vite)

**Failure:** Blocks merge to main branch

### test.yml - Testing

**When:** Every push  
**Time:** ~15 minutes  
**Actions:**
- Type checking (4 attempts with different Node versions)
- Security audit (npm audit)
- Build test

### build-android-apk.yml - Android APK Build

**When:** 
- Push to develop/staging/main
- Manual workflow dispatch

**Time:** ~20 minutes  
**Outputs:**
- Debug APK: `app-debug.apk`
- Release APK: `app-release.apk` (if signed)

**Manual Trigger:**
```
GitHub Actions > Build Android APK > Run workflow > Select build_type
```

### build-android-aab.yml - Android App Bundle

**When:**
- Push to main branch
- Manual workflow dispatch
- Git tags (v*.*.*)

**Time:** ~20 minutes  
**Output:**
- `app-release.aab` (ready for Play Store)

**Requires:** KEYSTORE_BASE64 secret

### build-ios.yml - iOS Build

**When:**
- Push to main/develop
- Manual workflow dispatch

**Time:** ~30 minutes  
**Output:**
- `App.ipa` (TestFlight/App Store)
- Simulator build (Debug)

**Optional:** Auto-upload to TestFlight if secrets configured

### release.yml - Full Release Orchestration

**When:**
- Manual workflow dispatch (specify version)
- Git tag (v*.*.*)

**Time:** ~90 minutes  
**Process:**
1. Run tests
2. Build Android APK (parallel)
3. Build Android AAB (parallel)
4. Build iOS IPA (parallel)
5. Create GitHub Release with all artifacts
6. Generate changelog
7. Send notifications

**Manual Trigger:**
```
GitHub Actions > Release > Run workflow > Enter version 1.0.0
```

## Build Artifacts

All builds are saved as GitHub artifacts:
- **Retention:** 30 days (Android), 60 days (AAB)
- **Download:** Actions tab > select workflow > select artifact
- **Storage:** Free (limited to 1 GB retention)

## Deployment Pipeline

### To Google Play Store

```bash
# 1. Create release tag
git tag -a v1.0.0 -m "Release 1.0.0"
git push origin v1.0.0

# 2. Workflow triggers, builds AAB
# 3. Download AAB from artifact
# 4. Upload to Google Play Console
```

### To Apple App Store

```bash
# Same as above
# Workflow builds IPA and uploads to TestFlight

# In App Store Connect:
# 1. Select TestFlight build
# 2. Add test notes
# 3. Submit to review
```

## Environment Variables

### In Workflows

All builds use:
```
NODE_ENV=production
VITE_SERVER_URL=wss://quidec-server.onrender.com
```

Override via secrets if needed.

## Security

✅ **Keystore Protection:**
- Never committed to git
- Stored as GitHub Secret (encrypted)
- Only used in CI/CD builds
- Expires in 10 years

✅ **Code Integrity:**
- All builds verified with signatures
- Type-safe TypeScript builds
- Minification & obfuscation enabled

✅ **Access Control:**
- Secrets available only in workflows
- Protected main branch
- Require PR reviews

## Local Equivalent Commands

Each workflow has a local equivalent:

| Workflow | Local Command |
|----------|---------------|
| verify.yml | `pnpm type-check && pnpm lint && pnpm build` |
| test.yml | `npm ci && pnpm type-check` |
| build-android-apk.yml | `pnpm build:android:apk` |
| build-android-aab.yml | `pnpm build:android:aab` |
| build-ios.yml | `pnpm open:ios` then build in Xcode |
| release.yml | Manual: Run all above + GitHub Release |

## Troubleshooting

### Workflow Fails: "Keystore not found"

**Solution:** Add KEYSTORE_BASE64 secret

```bash
cd web/.github
bash generate-keystore.sh
# Copy output to GitHub Secrets
```

### Build Hangs (Gradle)

**Solution:** Workflow has 45-min timeout. Check logs.

```
Actions tab > workflow > build step > view logs
```

### APK Won't Install

**Check:**
- Android version compatibility (API 24+)
- Signed vs unsigned APK
- USB debugging enabled

### iOS Build Missing Xcode

**Note:** iOS only builds on macOS runners (automatic)

## Performance

### Build Times

- Android APK: 15-20 min
- Android AAB: 15-20 min
- iOS: 25-35 min (macOS runner)
- Full release: 60-90 min total

### Parallel Builds

Workflows run in parallel:
- Test ✓
- Build Android APK ✓
- Build Android AAB ✓
- Build iOS ✓
- Release (waits for all)

### Caching

Enabled for:
- npm dependencies
- Gradle artifacts
- CocoaPods (iOS)

**First build:** ~25 min  
**Subsequent builds:** ~15 min (with cache)

## Monitoring

### Via GitHub Actions UI

1. Go to Actions tab
2. Select workflow
3. View:
   - Real-time logs
   - Build duration
   - Artifacts
   - Status badges

### Via Command Line

```bash
# Get latest workflow status
gh run list --workflow=build-android-apk.yml

# Download artifact
gh run download <run-id> --name android-apk-<sha>
```

## Advanced Configuration

### Custom Build Steps

Edit workflow YAML to add:
- Analytics integration
- Obfuscation configuration
- Performance profiling
- Custom webhooks

### Notifications

Configure Slack in `release.yml`:
- Add `SLACK_WEBHOOK_URL` secret
- Workflow sends build status

### Matrix Builds

`verify.yml` tests against:
- Node 18.x
- Node 20.x

Add more versions in matrix if needed.

## Best Practices

✅ **Always test locally first:**
```bash
pnpm build
```

✅ **Use semantic versioning:**
```bash
git tag -a v1.0.0 -m "Release 1.0.0"
```

✅ **Keep secrets safe:**
- Never show in logs
- Rotate regularly
- Use specific permissions

✅ **Monitor build times:**
- Optimize slow steps
- Clean cache if needed
- Profile dependencies

## File Structure

```
web/
├── .github/
│   ├── workflows/
│   │   ├── verify.yml              # Code quality verification
│   │   ├── test.yml                # Testing
│   │   ├── build-android-apk.yml   # Android debug/release APK
│   │   ├── build-android-aab.yml   # Android App Bundle
│   │   ├── build-ios.yml           # iOS build
│   │   └── release.yml             # Full release orchestration
│   ├── CI_CD_SETUP.md              # Detailed setup guide
│   └── generate-keystore.sh        # Keystore generator script
├── src/                            # Source code
├── android/                        # Android project
├── ios/                            # iOS project
└── package.json                    # Dependencies & scripts
```

## Next Steps

1. **Generate keystore:** `bash .github/generate-keystore.sh`
2. **Add secrets** to GitHub
3. **Test pipeline:** Push to develop
4. **Monitor builds:** Check Actions tab
5. **Create release:** Use v*.*.* tag or manual dispatch

## Support Resources

- **GitHub Actions:** https://docs.github.com/en/actions
- **Capacitor:** https://capacitorjs.com/docs
- **Gradle:** https://gradle.org/docs
- **Xcode:** https://developer.apple.com/documentation

## Workflow Status Badge

Add to README.md:

```markdown
![Build Status](https://github.com/preetbiswas12/quidec_capacitor/actions/workflows/build-android-apk.yml/badge.svg)
```

---

**Status:** ✅ Full build pipeline configured and ready

**Start:** Push code → Automated builds happen

**Questions?** See workflow YAML files or CI_CD_SETUP.md
