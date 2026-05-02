import React, { useEffect } from 'react';
import { RouterProvider } from 'react-router';
import { router } from './routes';
import { initializePushNotifications } from '../utils/firebase';

// ─── Error boundary ───────────────────────────────────────────────────────────
interface EBState { hasError: boolean; message: string }
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, EBState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }
  static getDerivedStateFromError(error: Error): EBState {
    return { hasError: true, message: error.message };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="h-full w-full bg-[#111B21] flex flex-col items-center justify-center gap-4 px-8 text-center">
          <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center">
            <span className="text-red-400 text-2xl">!</span>
          </div>
          <p className="text-[#E9EDEF] font-medium">Something went wrong</p>
          <p className="text-[#8696A0] text-sm">{this.state.message}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 px-6 py-2 bg-[#00A884] text-white rounded-full text-sm"
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  useEffect(() => {
    // Initialize Firebase push notifications
    const initNotifications = async () => {
      try {
        console.log('🔔 Initializing push notifications...');
        
        // Initialize with message handler
        await initializePushNotifications((payload) => {
          console.log('📬 Message received:', payload);
          // Handle notification in foreground
          const notification = payload.notification || {};
          console.log(`Title: ${notification.title}, Body: ${notification.body}`);
        });

        console.log('✅ Push notifications ready');
      } catch (err) {
        console.error('❌ Push notification initialization failed:', err);
        // App still works without notifications
      }
    };

    // Only initialize in production/staging
    if (import.meta.env.PROD) {
      initNotifications();
    }
  }, []);

  return (
    <ErrorBoundary>
      <RouterProvider router={router} />
    </ErrorBoundary>
  );
}
