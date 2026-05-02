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
    <div className="h-full w-full bg-[#111B21] overflow-hidden">
      {/* Left Panel — visible when no chat is open */}
      <div className={`h-full flex flex-col w-full ${isChatOpen ? 'hidden' : 'flex'}`}>
        <LeftPanel />
      </div>

      {/* Right Panel — full screen chat view */}
      <div className={`h-full w-full overflow-hidden ${isChatOpen ? 'flex flex-col' : 'hidden'}`}>
        <Outlet />
      </div>
    </div>
  );
}