# Quidec Firebase Production Deployment Script
# ---------------------------------------------
# This script deploys security rules and initializes collections.

Write-Host "🔐 Deploying Firebase Security Rules..." -ForegroundColor Cyan

# 1. Deploy Firestore Rules
Write-Host "--- Deploying Firestore Rules ---"
firebase deploy --only firestore:rules

# 2. Deploy Realtime Database Rules
Write-Host "--- Deploying Database Rules ---"
firebase deploy --only database:rules

# 3. Deploy Storage Rules
Write-Host "--- Deploying Storage Rules ---"
firebase deploy --only storage:rules

Write-Host "`n✅ Deployment complete!" -ForegroundColor Green
Write-Host "Note: To initialize collections, simply log in to the app. The AppContext will handle the rest." -ForegroundColor Yellow
