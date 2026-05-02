import { createBrowserRouter, Outlet, Navigate } from 'react-router';
import { AppProvider } from './context/AppContext';
import MobileFrame from './components/MobileFrame';
import SplashScreen from './components/SplashScreen';
import Onboarding from './components/Onboarding';
import MainLayout from './components/MainLayout';
import WelcomeScreen from './components/WelcomeScreen';
import ChatWindow from './components/ChatWindow';
import VoiceCallScreen from './components/VoiceCallScreen';
import VideoCallScreen from './components/VideoCallScreen';

/**
 * Root layout — wraps every route with AppProvider + MobileFrame so that
 * React context is always inside the router tree (required for React Router v7
 * data-mode where createBrowserRouter manages its own render tree).
 */
function Root() {
  return (
    <AppProvider>
      <MobileFrame>
        <Outlet />
      </MobileFrame>
    </AppProvider>
  );
}

export const router = createBrowserRouter([
  {
    // Pathless root layout — provides context to ALL child routes
    element: <Root />,
    children: [
      { path: '/', element: <SplashScreen /> },
      { path: '/onboarding', element: <Onboarding /> },
      {
        path: '/app',
        element: <MainLayout />,
        children: [
          { index: true, element: <WelcomeScreen /> },
          { path: 'chat/:id', element: <ChatWindow /> },
        ],
      },
      { path: '/call/voice/:id', element: <VoiceCallScreen /> },
      { path: '/call/video/:id', element: <VideoCallScreen /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);
