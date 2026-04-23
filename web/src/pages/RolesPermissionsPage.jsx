import { Link } from 'react-router-dom';

function RolesPermissionsPage() {
  return (
    <section className="min-w-0 max-w-full space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-dark">Roles and permissions</h1>
        <p className="mt-1 text-sm text-slate-500">
          LiveTrack uses workspace roles on each user (admin, manager, field agent). Fine-grained permission matrices
          for every screen are not configured here yet; use Users to assign roles and review access patterns.
        </p>
      </div>

      <div className="flux-card p-6 shadow-panel-lg">
        <h2 className="text-base font-bold text-dark">Where to manage access</h2>
        <ul className="mt-3 list-inside list-disc space-y-2 text-sm text-slate-600">
          <li>
            <Link to="/dashboard/users" className="font-semibold text-primary hover:underline">
              Employees
            </Link>{' '}
            — create and edit accounts; set role to admin, manager, or field agent.
          </li>
          <li>
            <Link to="/dashboard/settings/organization" className="font-semibold text-primary hover:underline">
              Organization setup
            </Link>{' '}
            — branches, geofences, and catalog data used across operations.
          </li>
        </ul>
      </div>
    </section>
  );
}

export default RolesPermissionsPage;
