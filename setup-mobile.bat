@echo off
REM Quidec Mobile App Build Setup Script for Windows
REM Automatically configures the mobile app for development and production builds

echo.
echo ==========================================
echo Quidec Mobile App Build Setup - Windows
echo ==========================================
echo.

setlocal enabledelayedexpansion

REM Check prerequisites
echo Checking prerequisites...

REM Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    color 0C
    echo X Node.js not found
    color 07
    exit /b 1
)
for /f "tokens=*" %%i in ('node -v') do set NODE_VERSION=%%i
echo [OK] Node.js %NODE_VERSION%

REM Check pnpm
where pnpm >nul 2>nul
if %errorlevel% neq 0 (
    color 0C
    echo X pnpm not found
    color 07
    exit /b 1
)
for /f "tokens=*" %%i in ('pnpm -v') do set PNPM_VERSION=%%i
echo [OK] pnpm %PNPM_VERSION%

REM Check Java
where java >nul 2>nul
if %errorlevel% equ 0 (
    echo [OK] Java found
) else (
    color 0E
    echo [WARNING] Java not found - required for Android builds
    color 07
)

REM Check ANDROID_HOME
if defined ANDROID_HOME (
    echo [OK] ANDROID_HOME: %ANDROID_HOME%
) else (
    color 0E
    echo [WARNING] ANDROID_HOME not set - required for Android builds
    color 07
)

echo.
echo Installing dependencies...
cd web
call pnpm install
cd ..
if %errorlevel% neq 0 (
    color 0C
    echo X Failed to install dependencies
    color 07
    exit /b 1
)
color 0A
echo [OK] Dependencies installed
color 07
echo.

REM Create environment files
echo Setting up environment files...

if not exist "web\.env" (
    echo Creating .env for production...
    (
        echo VITE_SERVER_URL=wss://quidec-server.onrender.com
        echo VITE_API_URL=https://quidec-server.onrender.com
        echo VITE_PACKAGE_NAME=com.quidec.chat
        echo VITE_APP_NAME=Quidec
        echo VITE_APP_VERSION=1.0.0
        echo VITE_DEBUG=false
        echo VITE_ALLOW_CLEARTEXT=false
    ) > "web\.env"
    color 0A
    echo [OK] Created .env
    color 07
)

if not exist "web\.env.development" (
    echo Creating .env.development for local development...
    (
        echo VITE_SERVER_URL=ws://localhost:3000
        echo VITE_API_URL=http://localhost:3000
        echo VITE_PACKAGE_NAME=com.quidec.chat
        echo VITE_APP_NAME=Quidec
        echo VITE_APP_VERSION=1.0.0
        echo VITE_DEBUG=true
        echo VITE_ALLOW_CLEARTEXT=true
    ) > "web\.env.development"
    color 0A
    echo [OK] Created .env.development
    color 07
)

echo.
echo Building web app...
cd web
call pnpm build:web
cd ..
if %errorlevel% neq 0 (
    color 0C
    echo X Failed to build web app
    color 07
    exit /b 1
)
color 0A
echo [OK] Web app built
color 07
echo.

REM Print next steps
echo.
echo ==========================================
color 0A
echo Setup Complete!
color 07
echo ==========================================
echo.
echo Next steps:
echo.
echo 1. For development (with hot reload^):
echo    Terminal 1: cd web ^&^& pnpm dev
echo    Terminal 2: pnpm sync:android
echo.
echo 2. For Android debug APK:
echo    pnpm build:android:apk
echo.
echo 3. For Android release AAB (Play Store^):
echo    pnpm build:android:aab
echo.
echo 4. For iOS:
echo    pnpm open:ios (then build in Xcode^)
echo.
echo 5. View detailed build instructions:
echo    type web\MOBILE_BUILD_GUIDE.md
echo.
echo Documentation: web\MOBILE_BUILD_GUIDE.md
echo Environment: web\.env (production^) / web\.env.development (dev^)
echo.

endlocal
