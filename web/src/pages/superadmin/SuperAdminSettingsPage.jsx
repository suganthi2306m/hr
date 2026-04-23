import { useAuth } from '../../context/AuthContext';

export default function SuperAdminSettingsPage() {
  const { admin } = useAuth();
  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <p className="mt-1 text-sm text-slate-600">Platform super admin profile.</p>
      </div>
      <div className="flux-card border border-neutral-200/90 p-5 shadow-panel">
        <p className="form-label !mb-0 !text-slate-500">Name</p>
        <p className="mt-1 text-lg font-semibold text-dark">{admin?.name}</p>
        <p className="mt-4 form-label !mb-0 !text-slate-500">Email</p>
        <p className="mt-1 text-sm text-slate-700">{admin?.email}</p>
      </div>
      <p className="text-xs text-slate-500">
        Use the standard LiveTrack login screen &ldquo;Forgot password&rdquo; flow to rotate credentials for this account.
      </p>
    </div>
  );
}
