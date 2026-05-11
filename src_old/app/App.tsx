import React, { useEffect } from 'react';
import { RouterProvider } from 'react-router';
import { router } from './routes';
import { auth } from '../utils/firebase';
import {
  authService,
  presenceService,
  notificationService,
} from '../utils/firebaseServices';

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
    // Initialize Firebase services
    const initializeFirebase = async () => {
      try {
        console.log('🚀 Initializing Firebase services...');

        // Listen to auth state
        const unsubscribeAuth = authService.onAuthStateChange(
          async (user) => {
            if (user) {
              console.log(`✅ User authenticated: ${user.email}`);

              // Set user online
              await presenceService.setUserOnline(user.uid, user.displayName || user.email!);

              // Request FCM permission and setup notifications
              try {
                await notificationService.requestFCMPermission(user.uid);
                console.log('📬 FCM notifications enabled');

                // Listen to foreground notifications
                const unsubscribeNotif = notificationService.listenToNotifications(
                  (notification) => {
                    console.log(
                      '📬 Notification received:',
                      notification
                    );
                    // Show local notification
                    notificationService.sendLocalNotification(
                      notification.title || 'New Message',
                      {
                        body: notification.body,
                        tag: 'message-notification',
                        requireInteraction: false,
                      }
                    );
                  }
                );

                // Listen to user notifications from Firestore
                const unsubscribeUserNotif = notificationService.listenToUserNotifications(
                  user.uid,
                  (notifications) => {
                    console.log(
                      `📬 User has ${notifications.filter((n: any) => !n.read).length} unread notifications`
                    );
                  }
                );

                // Cleanup on unmount
                return () => {
                  unsubscribeNotif?.();
                  unsubscribeUserNotif?.();
                };
              } catch (err) {
                console.warn('⚠️ FCM setup skipped (user denied or not available):', err);
              }
            } else {
              console.log('❌ User logged out');
              // User logged out - presence will be handled by logoutUser
            }
          }
        );

        console.log('✅ Firebase services initialized');

        // Handle page visibility for online/offline status
        const handleVisibilityChange = () => {
          const user = auth.currentUser;
          if (!user) return;

          if (document.hidden) {
            // Page hidden - set offline
            presenceService.setUserOffline(user.uid);
          } else {
            // Page visible - set online
            presenceService.setUserOnline(user.uid, user.displayName || user.email!);
          }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        // Handle page unload
        const handleBeforeUnload = () => {
          const user = auth.currentUser;
          if (user) {
            presenceService.setUserOffline(user.uid);
          }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);

        // Cleanup
        return () => {
          unsubscribeAuth();
          document.removeEventListener('visibilitychange', handleVisibilityChange);
          window.removeEventListener('beforeunload', handleBeforeUnload);
        };
      } catch (err) {
        console.error('❌ Firebase initialization error:', err);
      }
    };

    initializeFirebase();
  }, []);

  return (
    <ErrorBoundary>
      <RouterProvider router={router} />
    </ErrorBoundary>
  );
}
