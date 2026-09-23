import { useEffect, useState } from 'react';
import { NavLink, Outlet, ScrollRestoration, useLocation } from 'react-router';
import { BookOpen, ClipboardList, Home, LineChart, NotebookPen, WifiOff } from 'lucide-react';

const NAV = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/practice', label: 'Practice', icon: BookOpen },
  { to: '/mocks', label: 'Mocks', icon: ClipboardList },
  { to: '/progress', label: 'Progress', icon: LineChart },
  { to: '/mistakes', label: 'Mistakes', icon: NotebookPen },
];

function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export function Layout() {
  const { pathname } = useLocation();
  const online = useOnline();
  const inTest = /^\/(test|start)\b/.test(pathname) || pathname.startsWith('/t/');
  const showNav = !inTest && !/^\/(result|solutions)\b/.test(pathname);
  return (
    <div className="app-column">
      {!online ? (
        <div className="flex items-center justify-center gap-1.5 bg-ink px-3 py-1 text-[13px] text-paper" role="status">
          <WifiOff size={14} aria-hidden /> Offline — everything you have opened still works
        </div>
      ) : null}
      <div className={showNav ? 'pb-[72px]' : ''}>
        <Outlet />
      </div>
      {showNav ? (
        <nav aria-label="Main" className="safe-bottom fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[480px] border-t border-line bg-surface">
          <ul className="grid grid-cols-5">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={end}
                  className={({ isActive }) => `flex min-h-[60px] flex-col items-center justify-center gap-0.5 text-[12px] ${isActive ? 'font-semibold text-pen' : 'text-ink-2'}`}
                >
                  <Icon size={21} aria-hidden />
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
      <ScrollRestoration />
    </div>
  );
}
