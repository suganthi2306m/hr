import { useAuth } from '../context/AuthContext';

function ProfilePage() {
  const { admin } = useAuth();

  return (
    <section className="flux-card p-6">
      <h3 className="text-xl font-bold text-dark">Admin Profile</h3>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-xs uppercase text-slate-500">Name</p>
          <p className="font-semibold text-dark">{admin?.name}</p>
        </div>
        <div>
          <p className="text-xs uppercase text-slate-500">Email</p>
          <p className="font-semibold text-dark">{admin?.email}</p>
        </div>
        <div>
          <p className="text-xs uppercase text-slate-500">Role</p>
          <p className="font-semibold text-dark">{admin?.role}</p>
        </div>
        <div>
          <p className="text-xs uppercase text-slate-500">Company Setup</p>
          <p className="font-semibold text-dark">{admin?.companySetupCompleted ? 'Completed' : 'Pending'}</p>
        </div>
      </div>
    </section>
  );
}

export default ProfilePage;
