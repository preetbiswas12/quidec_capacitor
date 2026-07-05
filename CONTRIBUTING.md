# Contributing to Quidec (Veill)

Thank you for considering contributing to Quidec/Veill — an encrypted real-time messaging application built with React, Capacitor, and Firebase with end-to-end encryption. Every contribution helps make secure communication more accessible.

This project is licensed under the [MIT License](LICENSE).

---

## Development Setup

### Prerequisites

- **Node.js** 22+
- **pnpm** 8+
- **Git**
- For native builds: Android Studio (Android) or Xcode (iOS)

### Getting Started

```bash
git clone https://github.com/your-org/quidec_capacitor.git
cd quidec_capacitor
pnpm install
cp .env.example .env
pnpm dev
```

### Environment Variables

Copy `.env.example` to `.env` and fill in your values. All `.env.*` files except `.env.example` are gitignored.

Key variables:
- `VITE_SERVER_URL` — WebSocket server URL
- `VITE_FIREBASE_*` — Firebase configuration (from Google Firebase Console)
- `VITE_TURN_*` — TURN server credentials for WebRTC

### Firebase Setup

1. Create a project in the [Firebase Console](https://console.firebase.google.com/)
2. Enable Authentication, Firestore, and Cloud Messaging
3. Copy your web app config into the `VITE_FIREBASE_*` environment variables
4. For Android: add `google-services.json` to `android/app/`
5. For iOS: add `GoogleService-Info.plist` to `ios/App/App/`

---

## Project Structure

```
src/
├── app/              # App shell, context providers, routes
│   ├── App.tsx
│   ├── context/
│   ├── components/
│   └── routes.tsx
├── components/       # Shared UI components (ChatScreen, Sidebar, etc.)
│   └── ui/           # Low-level UI primitives
├── hooks/            # Custom React hooks
├── utils/            # Services, encryption, validators, storage
│   ├── __tests__/    # Unit tests
│   ├── hooks/        # Utility hooks
│   └── services/     # Backend service integrations
├── types/            # TypeScript type definitions
├── styles/           # Global styles
├── imports/          # Shared import barrel files
└── main.tsx          # Entry point

e2e/                  # Playwright end-to-end tests
public/               # Static assets, manifest, service worker
android/              # Capacitor Android native project
ios/                  # Capacitor iOS native project
```

---

## Available Scripts

| Command              | Description                              |
| -------------------- | ---------------------------------------- |
| `pnpm dev`           | Start Vite dev server                    |
| `pnpm build`         | Production build                         |
| `pnpm preview`       | Preview production build locally         |
| `pnpm test`          | Run unit tests (vitest)                  |
| `pnpm test:watch`    | Run unit tests in watch mode             |
| `pnpm test:e2e`      | Run E2E tests (Playwright)               |
| `pnpm lint`          | Lint `src/` with ESLint                  |
| `pnpm type-check`    | Run TypeScript type checking             |
| `pnpm format`        | Format code with Prettier                |
| `pnpm sync:android`  | Build and sync to Android                |
| `pnpm sync:ios`      | Build and sync to iOS                    |
| `pnpm clean`         | Remove `dist/` and `node_modules/`, reinstall |

---

## Code Standards

- **TypeScript** — Strict mode is enabled. No `any` types in new code.
- **ESLint + Prettier** — Run `pnpm lint` and `pnpm format` before committing.
- **Component naming** — PascalCase for React components (`ChatScreen.tsx`).
- **File naming** — PascalCase for components, camelCase for utilities and hooks.
- **Test files** — Named `*.test.ts` or `*.test.tsx`, co-located in `__tests__/` or alongside the source file.

---

## Testing

### Unit Tests

```bash
pnpm test          # single run
pnpm test:watch    # watch mode
```

Uses [Vitest](https://vitest.dev/) with `@testing-library/react` and `jsdom`.

### E2E Tests

```bash
pnpm test:e2e
```

Uses [Playwright](https://playwright.dev/). Tests are in `e2e/`.

### Guidelines

- Write tests for all new features and bug fixes.
- Aim for coverage on critical paths: **encryption**, **messaging**, **authentication**, and **data storage**.

---

## Branch Strategy

| Branch       | Purpose                        |
| ------------ | ------------------------------ |
| `main`       | Production-ready code          |
| `develop`    | Integration branch for features|
| `feat/xxx`   | New features                   |
| `fix/xxx`     | Bug fixes                      |
| `chore/xxx`  | Maintenance, refactoring, docs |

---

## Pull Request Process

1. Create your branch from `develop`.
2. Make your changes, following the code standards above.
3. Ensure all CI checks pass: `pnpm lint`, `pnpm type-check`, `pnpm test`, `pnpm test:e2e`.
4. Fill in the PR template with a clear description of changes.
5. Request at least **1 approval** before merging.
6. **Squash and merge** into `develop`.

---

## Security

- **Never** commit `.env` files or any file containing API keys, Firebase config, or secrets.
- Use `.env.example` as the template for required environment variables.
- **Do not** modify encryption or cryptographic code without prior review from a maintainer. E2E encryption is the core security property of this application.
- To report a security vulnerability, please use [GitHub Security Advisories](../../security/advisories/new) or contact the maintainers directly. **Do not** open a public issue for security vulnerabilities.

---

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](https://www.contributor-covenant.org/version/2/1/code_of_conduct/). By participating, you agree to uphold its standards of respectful and inclusive behavior.
