import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, Outlet, useLocation } from 'react-router-dom';
import { io } from 'socket.io-client';
import Sidebar from '../components/layout/Sidebar';
import ProfileMenu from '../components/layout/ProfileMenu';
import { useAuth } from '../context/AuthContext';
import { GoogleMapsProvider } from '../context/GoogleMapsContext';
import apiClient from '../api/client';

function prettifySegment(segment) {
  return String(segment || '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function TwoToneTitle({ text }) {
  const clean = String(text || '').trim();
  if (!clean) return null;
  const splitAt = Math.max(1, Math.ceil(clean.length / 2));
  const first = clean.slice(0, splitAt);
  const second = clean.slice(splitAt);
  return (
    <h1 className="truncate text-xl font-black tracking-tight sm:text-2xl">
      <span className="text-primary">{first}</span>
      {second ? <span className="text-dark"> {second}</span> : null}
    </h1>
  );
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function NotificationBell({ socketRefresh = 0 }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const socketDebounceRef = useRef(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const { data } = await apiClient.get('/ops/notifications');
      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch {
      setItems([]);
    }
  }, []);

  /** Load on mount and whenever the panel is opened (fresh list). */
  useEffect(() => {
    void fetchNotifications();
  }, [open, fetchNotifications]);

  /** Socket bumps can fire in bursts — debounce so we do not hammer the API. */
  useEffect(() => {
    if (socketRefresh <= 0) return undefined;
    if (socketDebounceRef.current) clearTimeout(socketDebounceRef.current);
    socketDebounceRef.current = setTimeout(() => {
      socketDebounceRef.current = null;
      void fetchNotifications();
    }, 450);
    return () => {
      if (socketDebounceRef.current) clearTimeout(socketDebounceRef.current);
    };
  }, [socketRefresh, fetchNotifications]);

  const unread = items.filter((i) => !i.readAt).length;

  const markRead = async (id) => {
    try {
      await apiClient.patch(`/ops/notifications/${id}/read`);
      setItems((old) => old.map((n) => (n._id === id ? { ...n, readAt: new Date().toISOString() } : n)));
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative inline-flex h-11 w-11 items-center justify-center rounded-full border border-neutral-200 bg-white text-dark shadow-sm transition hover:bg-neutral-50"
        aria-label="Notifications"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden>
          <path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 7h18s-3 0-3-7" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-white" />
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-neutral-200 bg-white py-2 shadow-panel-lg">
          <p className="border-b border-neutral-100 px-4 py-2 text-xs font-bold uppercase text-slate-500">In-app</p>
          <ul className="max-h-72 overflow-y-auto">
            {items.map((n) => (
              <li key={n._id} className="border-b border-neutral-50 px-4 py-3 text-sm">
                <p className="font-semibold text-dark">{n.title}</p>
                <p className="text-xs text-slate-600">{n.body}</p>
                {!n.readAt && (
                  <button type="button" className="mt-2 text-xs font-semibold text-primary" onClick={() => markRead(n._id)}>
                    Mark read
                  </button>
                )}
              </li>
            ))}
            {!items.length && <li className="px-4 py-6 text-sm text-slate-500">No notifications yet.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

function DashboardLayout() {
  const { logout, admin, token } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  /** Optional left slot in the top bar (e.g. Customers / Locations on the customers page). */
  const [dashboardTrail, setDashboardTrail] = useState(null);
  const [globalSearch, setGlobalSearch] = useState('');
  /** Bumps when Socket.IO delivers a new ops notification so the bell list / unread dot refresh. */
  const [socketRefresh, setSocketRefresh] = useState(0);
  const [liveToast, setLiveToast] = useState(null);

  useEffect(() => {
    if (!token) return undefined;
    const base = String(apiClient.defaults.baseURL || '').replace(/\/api\/?$/i, '');
    if (!base) return undefined;
    const socket = io(base, {
      path: '/socket.io',
      auth: { token },
      transports: ['websocket', 'polling'],
      withCredentials: true,
    });
    socket.on('ops_notification', (payload) => {
      const title = payload?.title || 'Notification';
      const body = payload?.body || '';
      setLiveToast({ title, body });
      setSocketRefresh((n) => n + 1);
      window.setTimeout(() => setLiveToast(null), 6500);
    });
    return () => {
      socket.disconnect();
    };
  }, [token]);

  const normalizedPath = location.pathname.replace(/\/+$/, '') || '/';
  const isDashboardHome = normalizedPath === '/dashboard';
  const pathSegments = normalizedPath
    .replace(/^\/dashboard\/?/, '')
    .split('/')
    .filter(Boolean);
  const isUserDetailsPage =
    pathSegments[0] === 'users' &&
    pathSegments.length === 2 &&
    pathSegments[1] !== 'new' &&
    pathSegments[1] !== 'import';
  const isEmployeeOnboarding =
    pathSegments[0] === 'users' &&
    (pathSegments[1] === 'new' || (pathSegments.length === 3 && pathSegments[2] === 'employee'));
  const isLiveTrackPage =
    pathSegments.length >= 2 && pathSegments[0] === 'track' && pathSegments[1] === 'livetrack';
  const isOrganizationSetupPage =
    pathSegments[0] === 'settings' && pathSegments[1] === 'organization';
  const isAttendanceViewPage =
    pathSegments[0] === 'operations' && pathSegments[1] === 'attendance' && pathSegments[2] === 'view';
  const isAttendanceApprovalPage =
    pathSegments[0] === 'operations' && pathSegments[1] === 'attendance' && pathSegments[2] === 'approval';
  const isAttendanceOvertimePage =
    pathSegments[0] === 'operations' && pathSegments[1] === 'attendance' && pathSegments[2] === 'overtime';
  const isOurProductsDash = pathSegments[0] === 'our-products';
  const isSupportDash = pathSegments[0] === 'support';
  const isFieldTasksList =
    pathSegments.length === 2 && pathSegments[0] === 'track' && pathSegments[1] === 'fieldtasks';
  const isFieldTaskDetailsPage =
    pathSegments.length === 3 &&
    pathSegments[0] === 'track' &&
    pathSegments[1] === 'fieldtasks' &&
    pathSegments[2] !== 'import';
  const pageTitle = isEmployeeOnboarding
    ? pathSegments[1] === 'new'
      ? 'Add employee'
      : 'Employee record'
    : isUserDetailsPage
      ? 'Employee details'
    : isLiveTrackPage
      ? 'Live track'
      : isAttendanceViewPage
        ? 'Employee attendance'
        : isAttendanceApprovalPage
          ? 'Approvals'
          : isAttendanceOvertimePage
            ? 'Overtime'
            : isOurProductsDash
              ? 'Our products'
              : isSupportDash
                ? 'Support'
                : isFieldTasksList
                  ? 'Field tasks'
                  : isFieldTaskDetailsPage
                    ? 'Task details'
                    : pathSegments.length
                      ? prettifySegment(pathSegments[pathSegments.length - 1])
                      : 'Dashboard';

  useEffect(() => {
    if (['superadmin', 'mainsuperadmin'].includes(admin?.role)) {
      navigate('/super', { replace: true });
    }
  }, [admin, navigate]);

  useEffect(() => {
    if (['superadmin', 'mainsuperadmin'].includes(admin?.role)) return;
    if (admin && !admin.companySetupCompleted) {
      navigate('/company-setup');
    }
  }, [admin, navigate]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="relative min-h-screen bg-neutral-200 md:flex">
      {liveToast && (
        <div
          className="fixed left-1/2 top-4 z-[100] w-[min(100%-2rem,28rem)] -translate-x-1/2 rounded-2xl border border-primary/20 bg-white px-4 py-3 shadow-panel-lg"
          role="status"
        >
          <p className="text-sm font-bold text-dark">{liveToast.title}</p>
          <p className="mt-0.5 text-xs text-slate-600">{liveToast.body}</p>
        </div>
      )}
      {isMobileSidebarOpen && (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-black/30 md:hidden"
          onClick={() => setIsMobileSidebarOpen(false)}
          aria-label="Close sidebar overlay"
        />
      )}
      <Sidebar
        onLogout={handleLogout}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed((old) => !old)}
        isMobileOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
      />
      <main
        className={
          isFieldTaskDetailsPage
            ? 'relative min-w-0 flex-1 overflow-x-hidden md:min-h-screen md:rounded-none md:bg-flux-panel md:p-0 md:shadow-none'
            : 'relative min-w-0 flex-1 overflow-x-hidden p-3 sm:p-4 md:min-h-screen md:rounded-[2rem] md:bg-flux-panel md:p-6 md:shadow-panel-lg lg:p-8'
        }
      >
        <div
          className={`mb-4 flex min-h-[2.75rem] items-center justify-between gap-2 sm:gap-3 ${
            isFieldTaskDetailsPage ? 'border-b border-slate-200/80 px-4 pb-4 pt-4 sm:px-5 md:px-6 md:pt-5' : ''
          }`}
        >
          <div className="flex min-w-0 flex-1 flex-col justify-center">
            {isOrganizationSetupPage ? (
              <h1 className="min-w-0 truncate text-xl font-black tracking-tight sm:text-2xl">
                <span className="text-primary">Organization</span>
                <span className="text-dark"> setup</span>
              </h1>
            ) : isLiveTrackPage ? (
              <h1 className="truncate text-xl font-black tracking-tight sm:text-2xl">
                <span className="text-primary">Live</span>
                <span className="text-dark"> track</span>
              </h1>
            ) : isOurProductsDash || isSupportDash ? (
              <h1 className="min-w-0 truncate text-xl font-black tracking-tight sm:text-2xl">
                <span className="text-primary">{isSupportDash ? 'Support' : 'Our products'}</span>
              </h1>
            ) : isFieldTaskDetailsPage ? (
              <h1 className="truncate text-xl font-black tracking-tight sm:text-2xl">
                <span className="text-primary">Task</span>
                <span className="text-dark"> details</span>
              </h1>
            ) : (
              <TwoToneTitle text={pageTitle} />
            )}
            {dashboardTrail ? <div className="mt-2 min-w-0">{dashboardTrail}</div> : null}
          </div>
          <div className="order-2 flex shrink-0 items-center gap-2 sm:order-none">
            <NotificationBell socketRefresh={socketRefresh} />
            <ProfileMenu />
          </div>
        </div>
        {isDashboardHome ? (
          <header className="mb-6 rounded-2xl border border-neutral-200/90 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-bold tracking-tight text-dark">Welcome, {admin?.name || 'Admin'}</h2>
                <p className="mt-1 text-sm text-slate-500">Monitor users, tasks and live field movement in one place.</p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => navigate('/dashboard/our-products')}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-dark shadow-sm transition hover:brightness-95"
                >
                  Our Products
                </button>
                <button
                  type="button"
                  onClick={() => setIsMobileSidebarOpen(true)}
                  className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-2 text-sm font-semibold text-dark shadow-sm hover:bg-neutral-50 md:hidden"
                >
                  <MenuIcon />
                  Menu
                </button>
              </div>
            </div>
          </header>
        ) : (
          <div className="mb-4 flex justify-end md:hidden">
            <button
              type="button"
              onClick={() => setIsMobileSidebarOpen(true)}
              className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-2 text-sm font-semibold text-dark shadow-sm hover:bg-neutral-50"
            >
              <MenuIcon />
              Menu
            </button>
          </div>
        )}
        <GoogleMapsProvider>
          <Outlet context={{ setDashboardTrail, globalSearch, setGlobalSearch }} />
        </GoogleMapsProvider>
      </main>
    </div>
  );
}

export default DashboardLayout;
