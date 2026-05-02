import { createBrowserRouter, Outlet, Navigate } from 'react-router';
import { AppProvider, useApp } from './context/AppContext';
import MobileFrame from './components/MobileFrame';
import SplashScreen from './components/SplashScreen';
import Onboarding from './components/Onboarding';
import MainLayout from './components/MainLayout';
import LoginScreen from './components/LoginScreen';
import ChatWindow from './components/ChatWindow';
import VoiceCallScreen from './components/VoiceCallScreen';
import VideoCallScreen from './components/VideoCallScreen';

// ─── Protected Route ─────────────────────────────────────────────────────────

function ProtectedRoute() {
  const { isOnboarded, isAuthenticating } = useApp();

  if (isAuthenticating) {
    return <div className="flex items-center justify-center h-screen bg-[#111B21]">Loading...</div>;
  }

  if (!isOnboarded) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

// ─── Auth Route ──────────────────────────────────────────────────────────────

function AuthRoute() {
  const { isOnboarded, isAuthenticating } = useApp();

  if (isAuthenticating) {
    return <div className="flex items-center justify-center h-screen bg-[#111B21]">Loading...</div>;
  }

  if (isOnboarded) {
    return <Navigate to="/app" replace />;
  }

  return <Outlet />;
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

// ─── Router ───────────────────────────────────────────────────────────────────

export const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      {
        element: <AuthRoute />,
        children: [
          { path: '/login', element: <LoginScreen /> },
          { path: '/onboarding', element: <Onboarding /> },
          { index: true, element: <Navigate to="/login" replace /> },
        ],
      },
      {
        element: <ProtectedRoute />,
        children: [
          {
            path: '/app',
            element: <MainLayout />,
            children: [
              { index: true, element: <div className="h-full w-full bg-[#111B21]" /> },
              { path: 'chat/:id', element: <ChatWindow /> },
            ],
          },
          { path: '/call/voice/:id', element: <VoiceCallScreen /> },
          { path: '/call/video/:id', element: <VideoCallScreen /> },
        ],
      },
      { path: '*', element: <Navigate to="/login" replace /> },
    ],
  },
]);
