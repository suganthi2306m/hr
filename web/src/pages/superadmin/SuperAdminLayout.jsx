import clsx from 'clsx';
import { useMemo, useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { LiveTrackWordmark } from '../../components/brand/LiveTrackWordmark';
import logoImg from '../../assets/logo.png';
import { useAuth } from '../../context/AuthContext';

const baseNav = [
  { to: '/super/companies', label: 'Companies', icon: 'building' },
  { to: '/super', end: true, label: 'Dashboard', icon: 'grid' },
  { to: '/super/licenses', label: 'Licenses', icon: 'key' },
  { to: '/super/payments', label: 'Payments', icon: 'card' },
  { to: '/super/notifications', label: 'Notifications', icon: 'bell', badge: 0 },
  { to: '/super/plans', label: 'Plans', icon: 'layers' },
  { to: '/super/integrations', label: 'Integrations', icon: 'plug' },
  { to: '/super/settings', label: 'Settings', icon: 'gear' },
];

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function ChevronIcon({ collapsed }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden>
      {collapsed ? <path d="m10 6 6 6-6 6" /> : <path d="m14 6-6 6 6 6" />}
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

function NavIcon({ name }) {
  const className = 'h-4 w-4 shrink-0';
  switch (name) {
    case 'building':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M4 21V8l8-4 8 4v13" />
          <path d="M9 21v-6h6v6" />
        </svg>
      );
    case 'grid':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      );
    case 'key':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <circle cx="8" cy="15" r="4" />
          <path d="M12 11l8-8M16 7l4 4" />
        </svg>
      );
    case 'card':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <path d="M2 10h20" />
        </svg>
      );
    case 'users':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <circle cx="8" cy="8" r="3" />
          <circle cx="17" cy="9" r="2.5" />
          <path d="M2 20c1.2-3.1 3.5-4.8 6-4.8 2.7 0 5.1 1.7 6.4 4.8" />
          <path d="M14.3 19.2c.9-1.9 2.2-2.8 3.7-2.8" />
        </svg>
      );
    case 'bell':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 7h18s-3 0-3-7" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      );
    case 'layers':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M12 2L2 7l10 5 10-5-10-5z" />
          <path d="M2 17l10 5 10-5M2 12l10 5 10-5" />
        </svg>
      );
    case 'plug':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M12 22v-5M9 8V2M15 8V2M5 8h14v5a7 7 0 0 1-14 0V8z" />
        </svg>
      );
    case 'gear':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.2a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.2a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 0 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3h0a1.6 1.6 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.2a1.6 1.6 0 0 0 1 1.5h0a1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 0 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8v0a1.6 1.6 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.2a1.6 1.6 0 0 0-1.4 1z" />
        </svg>
      );
    default:
      return null;
  }
}

const navItemClass = ({ isActive }) =>
  clsx(
    'group relative flex w-full items-center gap-2 rounded-full px-3 py-2.5 text-sm font-semibold transition-colors',
    isActive ? 'bg-white text-dark shadow-sm' : 'text-slate-400 hover:bg-white/5 hover:text-white',
  );

function pageTitleParts(pathname) {
  const seg = pathname.replace(/\/+$/, '').split('/').filter(Boolean);
  if (seg[0] === 'super' && seg[1] === 'super-admins' && seg[2] && /^[a-f0-9]{24}$/i.test(seg[2])) {
    return { first: 'Super admin', second: 'detail' };
  }
  const last = seg[seg.length - 1] || 'dashboard';
  const clean = last.replace(/[-_]+/g, ' ');
  const t = clean.charAt(0).toUpperCase() + clean.slice(1);
  const splitAt = Math.max(1, Math.ceil(t.length / 2));
  return { first: t.slice(0, splitAt), second: t.slice(splitAt) };
}

export default function SuperAdminLayout() {
  const { admin, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  const titleParts = useMemo(() => pageTitleParts(location.pathname), [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const initials = String(admin?.name || 'SA')
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const showNavText = !collapsed;
  const nav = useMemo(() => {
    const list = [...baseNav];
    if (admin?.role === 'mainsuperadmin') {
      list.splice(1, 0, { to: '/super/super-admins', label: 'Super Admins', icon: 'users' });
    }
    return list;
  }, [admin?.role]);

  return (
    <div className="relative min-h-screen bg-neutral-200 md:flex">
      <aside
        className={clsx(
          'sticky top-0 z-40 flex h-screen flex-col bg-flux-sidebar text-white transition-[width] duration-200',
          collapsed ? 'w-20' : 'w-64',
        )}
      >
        <div className="flex items-start justify-between gap-2 border-b border-white/10 px-3 py-5">
          <div className={clsx('flex min-w-0 flex-1 items-center gap-3', collapsed && 'justify-center')}>
            <img src={logoImg} alt="" width={40} height={40} className="h-9 w-9 shrink-0 rounded-xl object-contain" />
            {showNavText ? (
              <div className="min-w-0">
                <LiveTrackWordmark as="h1" className="truncate text-lg font-bold tracking-tight text-white" />
                <p className="text-xs text-slate-500">Platform admin</p>
              </div>
            ) : (
              <span className="sr-only">LiveTrack</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="hidden shrink-0 items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-xs text-slate-300 hover:bg-white/5 md:inline-flex"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <MenuIcon />
            <ChevronIcon collapsed={collapsed} />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              title={!showNavText ? item.label : undefined}
              className={({ isActive }) =>
                clsx(
                  navItemClass({ isActive }),
                  collapsed ? 'justify-center px-2' : 'justify-between',
                  'relative',
                )
              }
            >
              <span className={clsx('flex items-center gap-2', collapsed && 'justify-center')}>
                <NavIcon name={item.icon} />
                {showNavText && <span className="truncate">{item.label}</span>}
              </span>
              {showNavText && item.badge > 0 ? (
                <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-bold text-white">{item.badge}</span>
              ) : null}
              {collapsed && (
                <span className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 z-50 hidden -translate-y-1/2 whitespace-nowrap rounded-md bg-white px-2 py-1 text-xs font-semibold text-dark opacity-0 shadow-panel transition-opacity group-hover:opacity-100 md:block">
                  {item.label}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <button
          type="button"
          onClick={handleLogout}
          className={clsx(
            'm-3 rounded-xl border border-primary/50 bg-primary px-3 py-2.5 text-sm font-semibold text-dark transition hover:brightness-95',
            collapsed && 'px-2',
          )}
        >
          <span className={clsx('flex items-center justify-center gap-2', !collapsed && 'justify-start')}>
            <LogoutIcon />
            {showNavText && <span>Log out</span>}
          </span>
        </button>
      </aside>

      <main className="relative min-w-0 flex-1 overflow-x-hidden p-3 sm:p-4 md:min-h-screen md:rounded-[2rem] md:bg-flux-panel md:p-6 md:shadow-panel-lg lg:p-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h1 className="min-w-0 truncate text-xl font-black tracking-tight sm:text-2xl">
            <span className="text-primary">{titleParts.first}</span>
            {titleParts.second ? <span className="text-dark"> {titleParts.second}</span> : null}
          </h1>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-dark shadow-sm">
              {initials}
            </div>
            <div className="hidden min-w-0 text-right sm:block">
              <p className="truncate text-sm font-semibold text-dark">{admin?.name || 'Super Admin'}</p>
              <p className="truncate text-xs text-slate-500">{admin?.email}</p>
            </div>
          </div>
        </div>
        <Outlet />
      </main>
    </div>
  );
}
