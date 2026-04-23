import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../../api/client';

export default function SuperAdminPartnersPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    maxCompanies: '',
    maxLicenses: '',
  });
  const [editForm, setEditForm] = useState({
    name: '',
    maxCompanies: '',
    maxLicenses: '',
    password: '',
  });
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await apiClient.get('/super/partners/superadmins');
      setItems(data.items || []);
    } catch (e) {
      setError(e.response?.data?.message || 'Could not load super admins.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const createItem = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await apiClient.post('/super/partners/superadmins', {
        name: form.name,
        email: form.email,
        password: form.password,
        maxCompanies: form.maxCompanies === '' ? null : Number(form.maxCompanies),
        maxLicenses: form.maxLicenses === '' ? null : Number(form.maxLicenses),
      });
      setForm({ name: '', email: '', password: '', maxCompanies: '', maxLicenses: '' });
      setCreateOpen(false);
      await load();
    } catch (e2) {
      setError(e2.response?.data?.message || 'Could not create super admin.');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (id, current) => {
    setSaving(true);
    try {
      await apiClient.patch(`/super/partners/superadmins/${id}`, { isActive: !current });
      await load();
    } catch (e) {
      setError(e.response?.data?.message || 'Update failed.');
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (row) => {
    setEditingId(row._id);
    setEditForm({
      name: row.name || '',
      maxCompanies: row.maxCompanies == null ? '' : String(row.maxCompanies),
      maxLicenses: row.maxLicenses == null ? '' : String(row.maxLicenses),
      password: '',
    });
    setEditOpen(true);
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    if (!editingId) return;
    setSaving(true);
    setError('');
    try {
      const payload = {
        name: editForm.name,
        maxCompanies: editForm.maxCompanies === '' ? null : Number(editForm.maxCompanies),
        maxLicenses: editForm.maxLicenses === '' ? null : Number(editForm.maxLicenses),
      };
      if (String(editForm.password || '').trim().length >= 6) {
        payload.password = String(editForm.password).trim();
      }
      await apiClient.patch(`/super/partners/superadmins/${editingId}`, payload);
      setEditOpen(false);
      setEditingId('');
      setEditForm({ name: '', maxCompanies: '', maxLicenses: '', password: '' });
      await load();
    } catch (e2) {
      setError(e2.response?.data?.message || 'Could not update super admin.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="mt-1 text-sm text-slate-600">Create partner super admins, set company/license quotas, and activate/deactivate access.</p>
        </div>
        <button type="button" className="btn-primary" onClick={() => setCreateOpen(true)}>
          + Add super admin
        </button>
      </div>

      {error ? <p className="alert-error text-sm">{error}</p> : null}

      <p className="text-xs text-slate-500">Click a row or &quot;View&quot; to open the full partner profile (companies, licenses, users, branches).</p>

      <div className="flux-card overflow-hidden shadow-panel">
        <table className="w-full min-w-[900px] text-left text-sm text-dark">
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50/80">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Companies</th>
              <th className="px-4 py-3">Licenses</th>
              <th className="px-4 py-3">Max companies</th>
              <th className="px-4 py-3">Max licenses</th>
              <th className="px-4 py-3 text-right">View / actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                  Loading...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                  No super admins yet.
                </td>
              </tr>
            ) : (
              items.map((row) => (
                <tr
                  key={row._id}
                  className="cursor-pointer hover:bg-amber-50/40"
                  onClick={() => {
                    if (saving) return;
                    navigate(`/super/super-admins/${row._id}`);
                  }}
                >
                  <td className="px-4 py-3 font-semibold">{row.name}</td>
                  <td className="px-4 py-3">{row.email}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${row.isActive ? 'bg-emerald-100 text-emerald-900' : 'bg-red-100 text-red-800'}`}>
                      {row.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">{row.companiesCreated || 0}</td>
                  <td className="px-4 py-3">{row.licensesCreated || 0}</td>
                  <td className="px-4 py-3">{row.maxCompanies == null ? 'Unlimited' : row.maxCompanies}</td>
                  <td className="px-4 py-3">{row.maxLicenses == null ? 'Unlimited' : row.maxLicenses}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="text-sm font-semibold text-primary hover:underline"
                        disabled={saving}
                        onClick={() => navigate(`/super/super-admins/${row._id}`)}
                      >
                        View
                      </button>
                      <button
                        type="button"
                        className="text-sm font-semibold text-slate-700 hover:underline"
                        disabled={saving}
                        onClick={() => openEdit(row)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="text-sm font-semibold text-primary hover:underline"
                        disabled={saving}
                        onClick={() => toggleActive(row._id, row.isActive)}
                      >
                        {row.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {createOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form className="w-full max-w-lg space-y-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-panel-lg" onSubmit={createItem}>
            <h3 className="text-lg font-bold text-dark">Create super admin</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <input className="form-input" placeholder="Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
              <input className="form-input" type="email" placeholder="Email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required />
              <input className="form-input" type="password" placeholder="Password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} required minLength={6} />
              <input className="form-input" type="number" min="0" placeholder="Max companies (blank unlimited)" value={form.maxCompanies} onChange={(e) => setForm((f) => ({ ...f, maxCompanies: e.target.value }))} />
              <input className="form-input sm:col-span-2" type="number" min="0" placeholder="Max licenses (blank unlimited)" value={form.maxLicenses} onChange={(e) => setForm((f) => ({ ...f, maxLicenses: e.target.value }))} />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setCreateOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Saving...' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {editOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form className="w-full max-w-lg space-y-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-panel-lg" onSubmit={saveEdit}>
            <h3 className="text-lg font-bold text-dark">Edit super admin</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <input className="form-input sm:col-span-2" placeholder="Name" value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} required />
              <input className="form-input" type="number" min="0" placeholder="Max companies (blank unlimited)" value={editForm.maxCompanies} onChange={(e) => setEditForm((f) => ({ ...f, maxCompanies: e.target.value }))} />
              <input className="form-input" type="number" min="0" placeholder="Max licenses (blank unlimited)" value={editForm.maxLicenses} onChange={(e) => setEditForm((f) => ({ ...f, maxLicenses: e.target.value }))} />
              <input
                className="form-input sm:col-span-2"
                type="password"
                placeholder="New password (optional, min 6)"
                value={editForm.password}
                onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))}
                minLength={6}
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setEditOpen(false);
                  setEditingId('');
                  setEditForm({ name: '', maxCompanies: '', maxLicenses: '', password: '' });
                }}
              >
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Saving...' : 'Save changes'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
