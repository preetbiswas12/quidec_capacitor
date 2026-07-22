import { lazy, Suspense } from 'react';
import { createHashRouter, Outlet, Navigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import { AppProvider, useApp } from './context/AppContext';
import MobileFrame from './components/MobileFrame';
import SplashScreen from './components/SplashScreen';
import Onboarding from './components/Onboarding';
import EmailVerification from './components/EmailVerification';
import ErrorBoundary from './components/ErrorBoundary';

const MainLayout = lazy(() => import('./components/MainLayout'));
const ChatWindow = lazy(() => import('./components/ChatWindow'));
const GroupInfo = lazy(() => import('./components/GroupInfo'));
const VideoCallScreen = lazy(() => import('./components/VideoCallScreen'));
const VoiceCallScreen = lazy(() => import('./components/VoiceCallScreen'));
const PrivacyPolicy = lazy(() => import('./components/PrivacyPolicy'));
const TermsOfService = lazy(() => import('./components/TermsOfService'));

// ─── Protected Route ─────────────────────────────────────────────────────────

function ProtectedRoute() {
  const { isOnboarded, isAuthenticating, showSplash, needsVerification } = useApp();

  return (
    <AnimatePresence mode="sync">
      {showSplash || isAuthenticating ? (
        <motion.div
          key="splash-protected"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.1 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-0 z-[9999]"
        >
          <SplashScreen />
        </motion.div>
      ) : needsVerification ? (
        <motion.div
          key="verify-protected"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="h-full w-full"
        >
          <Navigate to="/verify-email" replace />
        </motion.div>
      ) : !isOnboarded ? (
        <motion.div
          key="onboarding-redirect"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="h-full w-full"
        >
          <Navigate to="/onboarding" replace />
        </motion.div>
      ) : (
        <motion.div
          key="protected-content"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="h-full w-full"
        >
          <Outlet />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Auth Route ──────────────────────────────────────────────────────────────

function AuthRoute() {
  const { isOnboarded, isAuthenticating, showSplash, needsVerification } = useApp();

  return (
    <AnimatePresence mode="sync">
      {showSplash || isAuthenticating ? (
        <motion.div
          key="splash"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.1 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-0 z-[9999]"
        >
          <SplashScreen />
        </motion.div>
      ) : needsVerification ? (
        <motion.div
          key="verify"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          className="h-full w-full"
        >
          <Navigate to="/verify-email" replace />
        </motion.div>
      ) : isOnboarded ? (
        <motion.div
          key="app-redirect"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="h-full w-full"
        >
          <Navigate to="/app" replace />
        </motion.div>
      ) : (
        <motion.div
          key="onboarding"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="h-full w-full"
        >
          <Outlet />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Root Layout ─────────────────────────────────────────────────────────────

function Root() {
  return (
    <AppProvider>
      <MobileFrame>
        <Outlet />
      </MobileFrame>
    </AppProvider>
  );
}

// ─── Lazy Route Wrapper ──────────────────────────────────────────────────────

function LazyRoute({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <Suspense
        fallback={
          <div className="h-full w-full bg-[#111B21] flex items-center justify-center">
            <SplashScreen />
          </div>
        }
      >
        {children}
      </Suspense>
    </ErrorBoundary>
  );
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const router = createHashRouter([
  {
    element: <Root />,
    children: [
      {
        element: <AuthRoute />,
        children: [
          { path: '/onboarding', element: <Onboarding /> },
          { index: true, element: <Navigate to="/onboarding" replace /> },
        ],
      },
      {
        path: '/verify-email',
        element: <EmailVerification />,
      },
      {
        path: '/privacy',
        element: <LazyRoute><PrivacyPolicy /></LazyRoute>,
      },
      {
        path: '/terms',
        element: <LazyRoute><TermsOfService /></LazyRoute>,
      },
      {
        element: <ProtectedRoute />,
        children: [
          {
            path: '/app',
            element: <LazyRoute><MainLayout /></LazyRoute>,
            children: [
              { index: true, element: <div className="h-full w-full bg-[#111B21]" /> },
              { path: 'chat/:id', element: <LazyRoute><ChatWindow /></LazyRoute> },
              { path: 'group/:id', element: <LazyRoute><GroupInfo /></LazyRoute> },
            ],
          },
          {
            path: '/call/video/:id',
            element: <LazyRoute><VideoCallScreen /></LazyRoute>,
          },
          {
            path: '/call/voice/:id',
            element: <LazyRoute><VoiceCallScreen /></LazyRoute>,
          },
        ],
      },
      { path: '*', element: <Navigate to="/onboarding" replace /> },
    ],
  },
]);
