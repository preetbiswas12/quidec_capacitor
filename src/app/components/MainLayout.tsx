import { useLocation, Outlet, Navigate } from 'react-router';
import { useApp } from '../context/AppContext';
import LeftPanel from './LeftPanel';

export default function MainLayout() {
  const location = useLocation();
  const { isOnboarded } = useApp();

  if (!isOnboarded) {
    return <Navigate to="/onboarding" replace />;
  }

  // On mobile: show left panel when no chat open, show chat when opened
  const isChatOpen = location.pathname !== '/app' && location.pathname !== '/app/';

  return (
    <main className="h-full w-full bg-wa-main overflow-hidden transition-colors duration-200">
      {/* Left Panel — visible when no chat is open */}
      <div className={`h-full flex flex-col w-full ${isChatOpen ? 'hidden' : 'flex'}`}>
        <LeftPanel />
      </div>

      {/* Right Panel — full screen chat view */}
      <div className={`h-full w-full overflow-hidden ${isChatOpen ? 'flex flex-col' : 'hidden'}`}>
        <Outlet />
      </div>
    </main>
  );
}