import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

function ProfileGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden="true">
      <circle cx="12" cy="9" r="3.5" />
      <path d="M5 20c1.6-3.8 4.5-6 7-6s5.4 2.2 7 6" />
    </svg>
  );
}

function ProfileMenu() {
  const { admin, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const roleLabel = admin?.role ? String(admin.role).replace(/_/g, ' ') : '—';

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={clsx(
          'flex h-11 w-11 items-center justify-center rounded-full border-2 border-primary bg-flux-sidebar text-primary shadow-flux transition hover:bg-flux-sidebarHover',
          open && 'ring-2 ring-primary/40 ring-offset-2 ring-offset-neutral-100',
        )}
        title="Profile"
        aria-expanded={open}
        aria-haspopup="true"
      >
        <span className="sr-only">Open profile menu</span>
        <ProfileGlyph />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 rounded-2xl border border-white/10 bg-flux-sidebar p-4 text-left text-white shadow-flux">
          <div className="flex items-start gap-3 border-b border-white/10 pb-3">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-primary text-dark">
              <ProfileGlyph />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{admin?.name || 'Admin'}</p>
              <p className="truncate text-xs text-slate-400">{admin?.email}</p>
              <p className="mt-1 text-xs font-medium capitalize text-slate-300">
                Role: <span className="text-primary">{roleLabel}</span>
              </p>
            </div>
          </div>
          <dl className="mt-3 space-y-2 text-xs text-slate-300">
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Account ID</dt>
              <dd className="max-w-[160px] truncate font-mono text-slate-200" title={admin?._id}>
                {admin?._id || '—'}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Company setup</dt>
              <dd className="font-medium text-white">{admin?.companySetupCompleted ? 'Done' : 'Pending'}</dd>
            </div>
          </dl>
          <div className="mt-4 flex flex-col gap-2 border-t border-white/10 pt-3">
            <button
              type="button"
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-left text-sm font-semibold text-white hover:bg-white/10"
              onClick={() => {
                setOpen(false);
                navigate('/dashboard/profile');
              }}
            >
              Full profile
            </button>
            <button
              type="button"
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-left text-sm font-semibold text-white hover:bg-white/10"
              onClick={() => {
                setOpen(false);
                navigate('/dashboard/settings');
              }}
            >
              Settings
            </button>
            <button
              type="button"
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-left text-sm font-semibold text-white hover:bg-white/10"
              onClick={() => {
                setOpen(false);
                logout();
                navigate('/login');
              }}
            >
              Logout
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ProfileMenu;
