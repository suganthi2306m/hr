import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { LiveTrackWordmark } from '../brand/LiveTrackWordmark';
import logoImg from '../../assets/logo.png';

const mainLinks = [
  { to: '/dashboard', label: 'Dashboard', icon: 'dashboard', end: true },
  { to: '/dashboard/users', label: 'Employee', icon: 'users' },
];

const CUSTOMER_BASE = '/dashboard/track/customers';
const customerSubLinks = [
  { to: `${CUSTOMER_BASE}`, label: 'Directory', end: true },
  { to: `${CUSTOMER_BASE}/follow-up`, label: 'Follow-up' },
];

const trackLinks = [
  { to: CUSTOMER_BASE, label: 'Customers', icon: 'customers' },
  { to: '/dashboard/track/visits', label: 'Visits', icon: 'visits' },
  { to: '/dashboard/track/leads', label: 'Leads', icon: 'tasks' },
  { to: '/dashboard/track/livetrack', label: 'LiveTrack', icon: 'location', brand: true },
];

const LEAD_BASE = '/dashboard/track/leads';
const leadSubLinks = [
  { to: `${LEAD_BASE}`, label: 'Overview' },
  { to: `${LEAD_BASE}/follow-up`, label: 'Follow-up' },
];

const ATT_BASE = '/dashboard/operations/attendance';
const attendanceSubLinks = [
  { to: `${ATT_BASE}/view`, label: 'View' },
  { to: `${ATT_BASE}/approval`, label: 'Approval' },
];

const opsLinks = [
  { to: '/dashboard/operations/leave', label: 'Leave', icon: 'leave' },
  { to: '/dashboard/operations/holidays', label: 'Holiday', icon: 'holiday' },
];

const configurationLinks = [
  { to: '/dashboard/billing', label: 'Subscription & billing', icon: 'billing' },
  { to: '/dashboard/settings/organization-info', label: 'Organization info', icon: 'org' },
  { to: '/dashboard/settings/organization', label: 'Organization setup', icon: 'org' },
];

const supportLink = { to: '/dashboard/support', label: 'Support', icon: 'support' };

const settingsLink = { to: '/dashboard/settings', label: 'Settings', icon: 'settings' };

function MenuIcon({ className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function ChevronIcon({ collapsed }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
      {collapsed ? <path d="m10 6 6 6-6 6" /> : <path d="m14 6-6 6 6 6" />}
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

function NavIcon({ name }) {
  const className = 'h-4 w-4 flex-shrink-0';
  switch (name) {
    case 'dashboard':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
          <path d="M4 10.5 12 3l8 7.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z" />
        </svg>
      );
    case 'users':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
          <circle cx="9" cy="8" r="3" />
          <circle cx="17" cy="10" r="2.5" />
          <path d="M3 19c1.6-3.5 4.2-5 6-5 2.2 0 4.8 1.5 6.4 5" />
          <path d="M14.5 18c1.1-2.2 2.7-3.2 4.5-3.2" />
        </svg>
      );
    case 'customers':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
          <path d="M4 7h16v10H4z" />
          <path d="M8 7V5h8v2" />
          <path d="M4 12h16" />
        </svg>
      );
    case 'tasks':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
          <path d="M9 6h11M9 12h11M9 18h11" />
          <path d="m4 6 1.5 1.5L7.5 5.5M4 12l1.5 1.5L7.5 11.5M4 18l1.5 1.5L7.5 17.5" />
        </svg>
      );
    case 'visits':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
          <path d="M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1h-4v-6H8v6H4a1 1 0 0 1-1-1z" />
          <path d="M16 8h5M18.5 5.5V10.5" strokeLinecap="round" />
        </svg>
      );
    case 'attendance':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
          <rect x="3" y="4.5" width="18" height="16" rx="2" />
          <path d="M8 3v3M16 3v3M3 9.5h18" />
          <path d="m8 14 2.2 2.2L16 10.5" />
        </svg>
      );
    case 'leave':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
          <path d="M5 19c5.5 0 12.2-2.2 14-9.5C12.5 9.5 8 12.5 5 19Z" />
          <path d="M5 19c-.3-3.6.7-6.7 3.4-9.4" />
        </svg>
      );
    case 'holiday':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M8 3v4M16 3v4M3 11h18" />
          <path d="M12 15v2" strokeLinecap="round" />
        </svg>
      );
    case 'products':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
          <path d="M16.5 9.4 7.55 4.24" />
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <path d="M3.27 6.96 12 12.01l8.73-5.05" />
          <path d="M12 22.08V12" />
        </svg>
      );
    case 'support':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
          <path d="M18 18.5a2.5 2.5 0 0 0 2.5-2.5V9a7 7 0 1 0-14 0v7a2.5 2.5 0 0 0 2.5 2.5h9Z" />
          <path d="M9 18v2a3 3 0 0 0 6 0v-2" strokeLinecap="round" />
        </svg>
      );
    case 'billing':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <path d="M2 10h20" />
        </svg>
      );
    case 'org':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
          <path d="M4 7h16v10H4z" />
          <path d="M8 7V5h8v2" />
          <path d="M9 12h6" />
        </svg>
      );
    case 'settings':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.2a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.2a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 0 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3h0a1.6 1.6 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.2a1.6 1.6 0 0 0 1 1.5h0a1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 0 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8v0a1.6 1.6 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.2a1.6 1.6 0 0 0-1.4 1z" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
          <path d="M12 21s7-4.5 7-11a7 7 0 1 0-14 0c0 6.5 7 11 7 11z" />
          <circle cx="12" cy="10" r="2.5" />
        </svg>
      );
  }
}

const navItemClass = ({ isActive }) =>
  clsx(
    'group relative block rounded-full px-3 py-2.5 text-sm font-semibold transition-colors',
    isActive ? 'bg-white text-dark shadow-sm' : 'text-slate-400 hover:bg-white/5 hover:text-white',
  );

function Sidebar({ onLogout, isCollapsed, onToggleCollapse, isMobileOpen, onCloseMobile }) {
  const location = useLocation();
  const visitsPrefix = '/dashboard/track/visits';
  const [attendanceOpen, setAttendanceOpen] = useState(() => location.pathname.startsWith(ATT_BASE));
  const [leadsOpen, setLeadsOpen] = useState(() => location.pathname.startsWith(LEAD_BASE));
  const [customersOpen, setCustomersOpen] = useState(() => location.pathname.startsWith(CUSTOMER_BASE));

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- open accordion when route is nested */
    if (location.pathname.startsWith(ATT_BASE)) setAttendanceOpen(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [location.pathname]);
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (location.pathname.startsWith(LEAD_BASE)) setLeadsOpen(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [location.pathname]);
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (location.pathname.startsWith(CUSTOMER_BASE)) setCustomersOpen(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [location.pathname]);

  /** Desktop collapsed hides labels; mobile drawer must always show labels (no hover tooltips on touch). */
  const showNavText = isMobileOpen || !isCollapsed;
  const iconOnlyNav = isCollapsed && !isMobileOpen;

  return (
    <aside
      className={clsx(
        'fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-flux-sidebar text-white transition-transform duration-200 md:static md:translate-x-0',
        isCollapsed ? 'md:w-20' : 'md:w-64',
        isMobileOpen ? 'translate-x-0' : '-translate-x-full',
      )}
    >
      <div className="flex items-start justify-between border-b border-white/10 px-4 py-5">
        <div className={clsx('flex items-center gap-3 overflow-hidden', iconOnlyNav && 'md:mx-auto md:justify-center')}>
          <img
            src={logoImg}
            alt="LiveTrack"
            width={40}
            height={40}
            className={clsx('shrink-0 rounded-xl object-contain', iconOnlyNav ? 'h-10 w-10' : 'h-9 w-9')}
          />
          {showNavText ? (
            <div className="min-w-0">
              <LiveTrackWordmark as="h1" className="truncate text-xl font-bold tracking-tight text-white" />
              <p className="text-xs text-slate-500">Operations</p>
            </div>
          ) : (
            <span className="sr-only">LiveTrack</span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onToggleCollapse}
            className="hidden items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-xs text-slate-300 hover:bg-white/5 md:inline-flex"
            title={isCollapsed ? 'Open sidebar' : 'Collapse sidebar'}
          >
            <MenuIcon />
            <ChevronIcon collapsed={isCollapsed} />
          </button>
          <button
            type="button"
            onClick={onCloseMobile}
            className="inline-flex items-center justify-center rounded-lg border border-white/10 px-2 py-1 text-xs text-slate-300 hover:bg-white/5 md:hidden"
            title="Close sidebar"
          >
            <CloseIcon />
          </button>
        </div>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto overflow-x-visible px-3 py-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="space-y-2">
          {mainLinks.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onCloseMobile}
              title={item.label}
              className={navItemClass}
            >
              <span className={clsx('flex items-center gap-2', iconOnlyNav && 'justify-center')}>
                <NavIcon name={item.icon} />
                {showNavText && (item.brand ? <LiveTrackWordmark /> : <span>{item.label}</span>)}
              </span>
              {iconOnlyNav && (
                <span className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 z-50 -translate-y-1/2 whitespace-nowrap rounded-md bg-white px-2 py-1 text-xs font-semibold text-dark opacity-0 shadow-panel transition-opacity group-hover:opacity-100">
                  {item.brand ? <LiveTrackWordmark /> : item.label}
                </span>
              )}
            </NavLink>
          ))}
        </div>

        <div>
          <p className={clsx('px-2 pb-2 text-xs uppercase tracking-wider text-slate-500', iconOnlyNav && 'text-center')}>
            {iconOnlyNav ? '·' : 'Track'}
          </p>
          <div className="space-y-2">
            {trackLinks.map((item) =>
              item.to === CUSTOMER_BASE && !iconOnlyNav ? (
                <div key={item.to} className="space-y-1">
                  <button
                    type="button"
                    onClick={() => setCustomersOpen((o) => !o)}
                    className={clsx(
                      'group relative flex w-full items-center justify-between rounded-full px-3 py-2.5 text-left text-sm font-semibold transition-colors',
                      location.pathname.startsWith(CUSTOMER_BASE)
                        ? 'bg-white/10 text-white'
                        : 'text-slate-400 hover:bg-white/5 hover:text-white',
                    )}
                    aria-expanded={customersOpen}
                  >
                    <span className="flex items-center gap-2">
                      <NavIcon name={item.icon} />
                      <span>{item.label}</span>
                    </span>
                    <ChevronIcon collapsed={!customersOpen} />
                  </button>
                  {customersOpen && (
                    <div className="ml-2 space-y-0.5 border-l border-white/15 py-0.5 pl-3">
                      {customerSubLinks.map((sub) => (
                        <NavLink
                          key={sub.to}
                          to={sub.to}
                          end={Boolean(sub.end)}
                          onClick={onCloseMobile}
                          title={sub.label}
                          className={({ isActive }) =>
                            clsx(
                              'block rounded-lg px-3 py-2 text-sm font-semibold transition-colors',
                              isActive ? 'bg-white text-dark shadow-sm' : 'text-slate-400 hover:bg-white/5 hover:text-white',
                            )
                          }
                        >
                          {sub.label}
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              ) : item.to === LEAD_BASE && !iconOnlyNav ? (
                <div key={item.to} className="space-y-1">
                  <button
                    type="button"
                    onClick={() => setLeadsOpen((o) => !o)}
                    className={clsx(
                      'group relative flex w-full items-center justify-between rounded-full px-3 py-2.5 text-left text-sm font-semibold transition-colors',
                      location.pathname.startsWith(LEAD_BASE)
                        ? 'bg-white/10 text-white'
                        : 'text-slate-400 hover:bg-white/5 hover:text-white',
                    )}
                    aria-expanded={leadsOpen}
                  >
                    <span className="flex items-center gap-2">
                      <NavIcon name={item.icon} />
                      <span>{item.label}</span>
                    </span>
                    <ChevronIcon collapsed={!leadsOpen} />
                  </button>
                  {leadsOpen && (
                    <div className="ml-2 space-y-0.5 border-l border-white/15 py-0.5 pl-3">
                      {leadSubLinks.map((sub) => (
                        <NavLink
                          key={sub.to}
                          to={sub.to}
                          end={sub.to === LEAD_BASE}
                          onClick={onCloseMobile}
                          title={sub.label}
                          className={({ isActive }) =>
                            clsx(
                              'block rounded-lg px-3 py-2 text-sm font-semibold transition-colors',
                              isActive ? 'bg-white text-dark shadow-sm' : 'text-slate-400 hover:bg-white/5 hover:text-white',
                            )
                          }
                        >
                          {sub.label}
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onCloseMobile}
                title={item.label}
                className={({ isActive }) =>
                  navItemClass({
                    isActive:
                      isActive ||
                      (item.to === visitsPrefix && location.pathname.startsWith(`${visitsPrefix}/`)) ||
                      (item.to === CUSTOMER_BASE &&
                        iconOnlyNav &&
                        location.pathname.startsWith(CUSTOMER_BASE)) ||
                      (item.to === LEAD_BASE && iconOnlyNav && location.pathname.startsWith(LEAD_BASE)),
                  })
                }
              >
                <span className={clsx('flex items-center gap-2', iconOnlyNav && 'justify-center')}>
                  <NavIcon name={item.icon} />
                  {showNavText && (item.brand ? <LiveTrackWordmark /> : <span>{item.label}</span>)}
                </span>
                {iconOnlyNav && (
                  <span className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 z-50 -translate-y-1/2 whitespace-nowrap rounded-md bg-white px-2 py-1 text-xs font-semibold text-dark opacity-0 shadow-panel transition-opacity group-hover:opacity-100">
                    {item.brand ? <LiveTrackWordmark /> : item.label}
                  </span>
                )}
              </NavLink>
              )
            )}
          </div>
        </div>

        <div>
          <p className={clsx('px-2 pb-2 text-xs uppercase tracking-wider text-slate-500', iconOnlyNav && 'text-center')}>
            {iconOnlyNav ? '·' : 'Operations'}
          </p>
          <div className="space-y-2">
            {iconOnlyNav ? (
              <NavLink
                to={`${ATT_BASE}/view`}
                onClick={onCloseMobile}
                title="Attendance"
                className={({ isActive }) =>
                  navItemClass({
                    isActive: isActive || location.pathname.startsWith(ATT_BASE),
                  })
                }
              >
                <span className="flex items-center justify-center gap-2">
                  <NavIcon name="attendance" />
                </span>
                <span className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 z-50 -translate-y-1/2 whitespace-nowrap rounded-md bg-white px-2 py-1 text-xs font-semibold text-dark opacity-0 shadow-panel transition-opacity group-hover:opacity-100">
                  Attendance
                </span>
              </NavLink>
            ) : (
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => setAttendanceOpen((o) => !o)}
                  className={clsx(
                    'group relative flex w-full items-center justify-between rounded-full px-3 py-2.5 text-left text-sm font-semibold transition-colors',
                    location.pathname.startsWith(ATT_BASE)
                      ? 'bg-white/10 text-white'
                      : 'text-slate-400 hover:bg-white/5 hover:text-white',
                  )}
                  aria-expanded={attendanceOpen}
                >
                  <span className="flex items-center gap-2">
                    <NavIcon name="attendance" />
                    <span>Attendance</span>
                  </span>
                  <ChevronIcon collapsed={!attendanceOpen} />
                </button>
                {attendanceOpen && (
                  <div className="ml-2 space-y-0.5 border-l border-white/15 py-0.5 pl-3">
                    {attendanceSubLinks.map((item) => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        onClick={onCloseMobile}
                        title={item.label}
                        className={({ isActive }) =>
                          clsx(
                            'block rounded-lg px-3 py-2 text-sm font-semibold transition-colors',
                            isActive ? 'bg-white text-dark shadow-sm' : 'text-slate-400 hover:bg-white/5 hover:text-white',
                          )
                        }
                      >
                        {item.label}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            )}
            {opsLinks.map((item) => (
              <NavLink key={item.to} to={item.to} onClick={onCloseMobile} title={item.label} className={navItemClass}>
                <span className={clsx('flex items-center gap-2', iconOnlyNav && 'justify-center')}>
                  <NavIcon name={item.icon} />
                  {showNavText && <span>{item.label}</span>}
                </span>
                {iconOnlyNav && (
                  <span className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 z-50 -translate-y-1/2 whitespace-nowrap rounded-md bg-white px-2 py-1 text-xs font-semibold text-dark opacity-0 shadow-panel transition-opacity group-hover:opacity-100">
                    {item.label}
                  </span>
                )}
              </NavLink>
            ))}
          </div>
        </div>

        <div>
          <p className={clsx('px-2 pb-2 text-xs uppercase tracking-wider text-slate-500', iconOnlyNav && 'text-center')}>
            {iconOnlyNav ? '·' : 'Configuration'}
          </p>
          <div className="space-y-2">
            {configurationLinks.map((item) => (
              <NavLink key={item.to} to={item.to} onClick={onCloseMobile} title={item.label} className={navItemClass}>
                <span className={clsx('flex items-center gap-2', iconOnlyNav && 'justify-center')}>
                  <NavIcon name={item.icon} />
                  {showNavText && <span>{item.label}</span>}
                </span>
                {iconOnlyNav && (
                  <span className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 z-50 -translate-y-1/2 whitespace-nowrap rounded-md bg-white px-2 py-1 text-xs font-semibold text-dark opacity-0 shadow-panel transition-opacity group-hover:opacity-100">
                    {item.label}
                  </span>
                )}
              </NavLink>
            ))}
          </div>
        </div>

        <div className="space-y-2 border-t border-white/10 pt-4">
          <NavLink
            to={supportLink.to}
            onClick={onCloseMobile}
            title={supportLink.label}
            className={navItemClass}
          >
            <span className={clsx('flex items-center gap-2', iconOnlyNav && 'justify-center')}>
              <NavIcon name={supportLink.icon} />
              {showNavText && <span>{supportLink.label}</span>}
            </span>
            {iconOnlyNav && (
              <span className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 z-50 -translate-y-1/2 whitespace-nowrap rounded-md bg-white px-2 py-1 text-xs font-semibold text-dark opacity-0 shadow-panel transition-opacity group-hover:opacity-100">
                {supportLink.label}
              </span>
            )}
          </NavLink>
          <NavLink
            to={settingsLink.to}
            end
            onClick={onCloseMobile}
            title={settingsLink.label}
            className={navItemClass}
          >
            <span className={clsx('flex items-center gap-2', iconOnlyNav && 'justify-center')}>
              <NavIcon name={settingsLink.icon} />
              {showNavText && <span>{settingsLink.label}</span>}
            </span>
            {iconOnlyNav && (
              <span className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 z-50 -translate-y-1/2 whitespace-nowrap rounded-md bg-white px-2 py-1 text-xs font-semibold text-dark opacity-0 shadow-panel transition-opacity group-hover:opacity-100">
                {settingsLink.label}
              </span>
            )}
          </NavLink>
        </div>
      </nav>

      <button
        type="button"
        onClick={() => {
          onCloseMobile();
          onLogout();
        }}
        className={clsx(
          'm-4 rounded-xl border border-primary/50 bg-primary px-3 py-2.5 text-sm font-semibold text-dark transition hover:brightness-95',
          iconOnlyNav && 'md:px-2',
        )}
      >
        <span className={clsx('flex items-center gap-2', iconOnlyNav && 'justify-center')}>
          <LogoutIcon />
          {showNavText && <span>Logout</span>}
        </span>
      </button>
    </aside>
  );
}

export default Sidebar;
