import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import apiClient from '../api/client';
import LocationLoadingIndicator from '../components/common/LocationLoadingIndicator';
import SelectionCountBadge from '../components/common/SelectionCountBadge';
import SlideOverPanel from '../components/common/SlideOverPanel';
import UiSelect from '../components/common/UiSelect';
import { PERMISSION_PRESETS, USER_ROLES, roleLabel } from '../constants/rbac';
import { downloadUsersExportXlsx } from '../utils/usersExcelImport';

const defaultPerms = () =>
  PERMISSION_PRESETS.reduce((acc, p) => {
    acc[p.key] = true;
    return acc;
  }, {});

function getInitialForm() {
  return {
    name: '',
    email: '',
    password: '',
    phone: '',
    role: 'field_agent',
    branchId: '',
    shiftId: '',
    isActive: true,
    permissions: defaultPerms(),
    kycStatus: '',
    kycNotes: '',
  };
}

function UsersPage() {
  const navigate = useNavigate();
  const { globalSearch, setGlobalSearch } = useOutletContext() || {};
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(() => getInitialForm());
  const [editingId, setEditingId] = useState('');
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [companyBranches, setCompanyBranches] = useState([]);
  const [companyShifts, setCompanyShifts] = useState([]);
  const [planUserLimit, setPlanUserLimit] = useState(null);

  const branchSelectOptions = useMemo(
    () => [{ value: '', label: 'No branch' }, ...companyBranches.map((b) => ({ value: String(b._id), label: b.name }))],
    [companyBranches],
  );

  const shiftSelectOptions = useMemo(
    () => [{ value: '', label: 'No shift' }, ...companyShifts.map((s) => ({ value: String(s._id), label: s.name }))],
    [companyShifts],
  );

  const loadUsers = async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get('/users');
      setUsers(data.items || []);
    } catch (apiError) {
      setError(apiError.response?.data?.message || 'Unable to load employees.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await apiClient.get('/company');
        if (cancelled) return;
        setCompanyBranches(Array.isArray(data.company?.branches) ? data.company.branches : []);
        setCompanyShifts(Array.isArray(data.company?.orgSetup?.shifts) ? data.company.orgSetup.shifts : []);
        const cap = Number(data.company?.subscription?.maxUsers);
        setPlanUserLimit(Number.isFinite(cap) && cap > 0 ? cap : null);
      } catch {
        if (!cancelled) {
          setCompanyBranches([]);
          setCompanyShifts([]);
          setPlanUserLimit(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredUsers = useMemo(() => {
    const search = typeof globalSearch === 'string' ? globalSearch : '';
    const term = search.trim().toLowerCase();
    return users.filter((user) => {
      if (statusFilter === 'active' && !user.isActive) return false;
      if (statusFilter === 'inactive' && user.isActive) return false;
      if (!term) return true;
      return [user.name, user.email, user.phone, user.role, user.companyId?.name].some((value) =>
        String(value || '')
          .toLowerCase()
          .includes(term),
      );
    });
  }, [globalSearch, users, statusFilter]);
  const selectedFilteredUsers = useMemo(
    () => filteredUsers.filter((u) => selectedIds.includes(String(u._id))),
    [filteredUsers, selectedIds],
  );
  const allSelected = filteredUsers.length > 0 && filteredUsers.every((u) => selectedIds.includes(String(u._id)));

  useEffect(() => {
    if (typeof setGlobalSearch !== 'function') return undefined;
    return () => setGlobalSearch('');
  }, [setGlobalSearch]);

  const resetForm = () => {
    setForm(getInitialForm());
    setEditingId('');
    setIsPanelOpen(false);
    setShowPassword(false);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');

    try {
      if (!editingId) {
        setError('Use “Add employee” for the full onboarding form.');
        setSaving(false);
        return;
      }

      if (companyBranches.length > 0 && !String(form.branchId || '').trim()) {
        setError('Branch is required. Choose the attendance branch for this employee.');
        setSaving(false);
        return;
      }

      const passwordValue = String(form.password || '').trim();

      const payload = {
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim(),
        role: form.role,
        branchId: form.branchId || '',
        shiftId: form.shiftId || '',
        isActive: form.isActive,
        permissions: form.permissions || {},
        kycStatus: form.kycStatus || '',
        kycNotes: form.kycNotes || '',
      };
      if (passwordValue) {
        payload.password = passwordValue;
      }

      await apiClient.put(`/users/${editingId}`, payload);
      setMessage('Employee updated successfully.');
      resetForm();
      await loadUsers();
    } catch (apiError) {
      setError(apiError.response?.data?.message || 'Unable to save employee.');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (user) => {
    setEditingId(user._id);
    const base = defaultPerms();
    const merged = { ...base, ...(user.permissions && typeof user.permissions === 'object' ? user.permissions : {}) };
    setForm({
      name: user.name || '',
      email: user.email || '',
      password: '',
      phone: user.phone || '',
      role: user.role === 'field_user' ? 'field_agent' : user.role === 'supervisor' ? 'manager' : user.role || 'field_agent',
      branchId: user.branchId ? String(user.branchId) : '',
      shiftId: user.shiftId ? String(user.shiftId) : '',
      isActive: Boolean(user.isActive),
      permissions: merged,
      kycStatus: user.kycStatus || '',
      kycNotes: user.kycNotes || '',
    });
    setError('');
    setMessage('');
    setIsPanelOpen(true);
    setShowPassword(false);
  };

  const toggleActive = async (user) => {
    setError('');
    setMessage('');
    try {
      await apiClient.put(`/users/${user._id}`, { isActive: !user.isActive });
      setMessage(`Employee ${user.isActive ? 'deactivated' : 'activated'} successfully.`);
      await loadUsers();
    } catch (apiError) {
      setError(apiError.response?.data?.message || 'Unable to update employee status.');
    }
  };

  const onToggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds((old) => old.filter((id) => !filteredUsers.some((u) => String(u._id) === id)));
      return;
    }
    setSelectedIds((old) => {
      const next = new Set(old);
      filteredUsers.forEach((u) => next.add(String(u._id)));
      return [...next];
    });
  };

  const onToggleRow = (id) => {
    setSelectedIds((old) => (old.includes(id) ? old.filter((x) => x !== id) : [...old, id]));
  };

  const bulkSetActiveState = async (isActive) => {
    const selectedUsers = users.filter((u) => selectedIds.includes(String(u._id)));
    if (!selectedUsers.length) {
      window.alert('Select employees first.');
      return;
    }
    setError('');
    setMessage('');
    let done = 0;
    for (const u of selectedUsers) {
      try {
        await apiClient.put(`/users/${u._id}`, {
          name: u.name,
          email: u.email,
          phone: u.phone || '',
          role: u.role || 'field_agent',
          branchId: u.branchId != null ? String(u.branchId) : '',
          shiftId: u.shiftId != null ? String(u.shiftId) : '',
          isActive,
          permissions: u.permissions || {},
          kycStatus: u.kycStatus || '',
          kycNotes: u.kycNotes || '',
        });
        done += 1;
      } catch {
        /* keep processing */
      }
    }
    setSelectedIds([]);
    await loadUsers();
    setMessage(`${done} employee(s) updated.`);
  };

  const bulkDelete = async () => {
    const selectedUsers = users.filter((u) => selectedIds.includes(String(u._id)));
    if (!selectedUsers.length) {
      window.alert('Select employees first.');
      return;
    }
    if (!window.confirm(`Delete ${selectedUsers.length} selected employee(s)?`)) return;
    setError('');
    setMessage('');
    let done = 0;
    for (const u of selectedUsers) {
      try {
        await apiClient.delete(`/users/${u._id}`);
        done += 1;
      } catch {
        /* keep processing */
      }
    }
    setSelectedIds([]);
    await loadUsers();
    setMessage(`${done} employee(s) deleted.`);
  };

  const removeUser = async (user) => {
    const confirmed = window.confirm(`Delete employee "${user.name}"?`);
    if (!confirmed) {
      return;
    }
    setError('');
    setMessage('');
    try {
      await apiClient.delete(`/users/${user._id}`);
      setMessage('Employee deleted successfully.');
      if (editingId === user._id) {
        resetForm();
      }
      await loadUsers();
    } catch (apiError) {
      setError(apiError.response?.data?.message || 'Unable to delete employee.');
    }
  };

  const handleAddEmployeeClick = () => {
    if (planUserLimit != null && users.length >= planUserLimit) {
      window.alert('You have reached the limit. Kindly upgrade plan.');
      return;
    }
    navigate('/dashboard/users/new');
  };

  return (
    <section className="min-w-0 max-w-full space-y-4">
      <div className="flux-card min-w-0 overflow-hidden p-4 shadow-panel-lg">
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h4 className="min-w-0 text-base font-semibold text-dark">All employees</h4>
          <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-row sm:justify-end">
            <button type="button" onClick={() => navigate('/dashboard/users/import')} className="btn-primary">
              Import
            </button>
            <button
              type="button"
              disabled={!selectedFilteredUsers.length && !filteredUsers.length}
              onClick={() => void downloadUsersExportXlsx(selectedFilteredUsers.length ? selectedFilteredUsers : filteredUsers)}
              className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
              title={selectedFilteredUsers.length ? 'Export selected employees' : 'Export all filtered employees'}
            >
              Export
            </button>
            <button type="button" onClick={handleAddEmployeeClick} className="btn-primary gap-2">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Add employee
            </button>
          </div>
        </div>

        {error && <p className="alert-error mb-3">{error}</p>}
        {message && <p className="alert-success mb-3">{message}</p>}
        <div className="mb-3 flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-[10px] font-semibold uppercase leading-tight tracking-wide text-primary sm:text-[11px]">Status</span>
          <div className="inline-flex min-w-0 shrink rounded-full border border-primary/50 bg-flux-panel p-0.5">
            {[
              { id: 'all', label: 'All' },
              { id: 'active', label: 'Active' },
              { id: 'inactive', label: 'Inactive' },
            ].map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setStatusFilter(opt.id)}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
                  statusFilter === opt.id ? 'bg-white text-dark shadow-sm' : 'text-slate-600 hover:text-dark'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <span className="min-w-0 text-sm text-slate-500 sm:whitespace-nowrap">
            {filteredUsers.length} of {users.length} shown
          </span>
        </div>
        {!!selectedIds.length && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-neutral-200 bg-flux-panel px-3 py-2">
            <SelectionCountBadge selectedCount={selectedIds.length} totalCount={filteredUsers.length} />
            <button type="button" className="btn-secondary text-xs" onClick={() => void bulkSetActiveState(true)}>
              Set Active
            </button>
            <button type="button" className="btn-secondary text-xs" onClick={() => void bulkSetActiveState(false)}>
              Set Inactive
            </button>
            <button
              type="button"
              className="inline-flex items-center rounded-lg border border-primary bg-primary/10 px-3 py-2 text-xs font-semibold text-dark hover:bg-primary/20"
              onClick={() => void bulkDelete()}
            >
              Delete selected
            </button>
          </div>
        )}

        {loading ? (
          <LocationLoadingIndicator label="Loading employees..." className="py-3" />
        ) : (
          <>
            <div className="space-y-3 md:hidden">
              {filteredUsers.map((user) => (
                <div
                  key={user._id}
                  className="cursor-pointer rounded-xl border border-neutral-200 bg-white p-3 shadow-sm transition hover:border-primary/30 hover:bg-flux-panel/40"
                  onClick={() => navigate(`/dashboard/users/${user._id}`)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-1 items-start gap-2" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="mt-1 shrink-0"
                        checked={selectedIds.includes(String(user._id))}
                        onChange={() => onToggleRow(String(user._id))}
                        aria-label={`Select ${user.name}`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-dark">{user.name}</p>
                        <p className="mt-0.5 break-all text-xs text-slate-600">{user.email}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleActive(user);
                      }}
                      className={`inline-flex h-5 w-9 shrink-0 items-center rounded-full border p-0.5 transition ${
                        user.isActive ? 'border-primary bg-primary' : 'border-primary/50 bg-primary/15'
                      }`}
                      title={user.isActive ? 'Set inactive' : 'Set active'}
                      aria-label={user.isActive ? 'Set employee inactive' : 'Set employee active'}
                    >
                      <span
                        className={`h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
                          user.isActive ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                  <dl className="mt-2 space-y-1 text-xs text-slate-600">
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-400">Phone</dt>
                      <dd className="text-right font-medium text-dark">{user.phone || '—'}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-400">Role</dt>
                      <dd className="capitalize text-right font-medium text-dark">
                        {roleLabel(user.role)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-400">Company</dt>
                      <dd className="max-w-[65%] truncate text-right font-medium text-dark">
                        {user.companyId?.name || '—'}
                      </dd>
                    </div>
                  </dl>
                  <div className="mt-3 flex items-center justify-end gap-2 border-t border-neutral-100 pt-3" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => startEdit(user)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-neutral-300 text-dark hover:bg-neutral-100"
                      title="Quick edit employee"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => removeUser(user)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-primary bg-primary/10 text-dark hover:bg-primary/20"
                      title="Delete employee"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                        <path d="M3 6h18" />
                        <path d="M8 6V4h8v2" />
                        <path d="M19 6l-1 14H6L5 6" />
                        <path d="M10 11v6M14 11v6" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
              {!filteredUsers.length && (
                <p className="rounded-xl border border-dashed border-neutral-200 py-8 text-center text-sm text-slate-500">
                  No employees found.
                </p>
              )}
            </div>

            <div className="hidden min-w-0 md:block">
              <div className="overflow-x-auto overscroll-x-contain rounded-lg border border-neutral-100 [-webkit-overflow-scrolling:touch]">
                <table className="min-w-[44rem] w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500">
                      <th className="w-10 px-2 py-2">
                        <input type="checkbox" checked={allSelected} onChange={onToggleSelectAll} aria-label="Select all employees" />
                      </th>
                      <th className="px-2 py-2">Name</th>
                      <th className="min-w-[10rem] px-2 py-2">Email</th>
                      <th className="whitespace-nowrap px-2 py-2">Phone</th>
                      <th className="px-2 py-2">Role</th>
                      <th className="min-w-[6rem] max-w-[10rem] px-2 py-2">Company</th>
                      <th className="whitespace-nowrap px-2 py-2">Status</th>
                      <th className="whitespace-nowrap px-2 py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((user) => (
                      <tr
                        key={user._id}
                        className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                        onClick={() => navigate(`/dashboard/users/${user._id}`)}
                      >
                        <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(String(user._id))}
                            onChange={() => onToggleRow(String(user._id))}
                            aria-label={`Select ${user.name}`}
                          />
                        </td>
                        <td className="px-2 py-2 font-medium text-dark">{user.name}</td>
                        <td className="max-w-[14rem] break-all px-2 py-2 text-slate-800">{user.email}</td>
                        <td className="whitespace-nowrap px-2 py-2 text-slate-800">{user.phone || '-'}</td>
                        <td className="px-2 py-2 text-slate-800">{roleLabel(user.role)}</td>
                        <td className="max-w-[10rem] truncate px-2 py-2 text-slate-800" title={user.companyId?.name}>
                          {user.companyId?.name || '-'}
                        </td>
                        <td className="px-2 py-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleActive(user);
                            }}
                            className={`inline-flex h-5 w-9 items-center rounded-full border p-0.5 transition ${
                              user.isActive ? 'border-primary bg-primary' : 'border-primary/50 bg-primary/15'
                            }`}
                            title={user.isActive ? 'Set inactive' : 'Set active'}
                            aria-label={user.isActive ? 'Set employee inactive' : 'Set employee active'}
                          >
                            <span
                              className={`h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
                                user.isActive ? 'translate-x-4' : 'translate-x-0'
                              }`}
                            />
                          </button>
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                startEdit(user);
                              }}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-neutral-300 text-dark hover:bg-neutral-100"
                              title="Quick edit employee"
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                                <path d="M12 20h9" />
                                <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeUser(user);
                              }}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-primary bg-primary/10 text-dark hover:bg-primary/20"
                              title="Delete employee"
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                                <path d="M3 6h18" />
                                <path d="M8 6V4h8v2" />
                                <path d="M19 6l-1 14H6L5 6" />
                                <path d="M10 11v6M14 11v6" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!filteredUsers.length && (
                      <tr>
                        <td className="py-4 text-slate-500" colSpan={8}>
                          No employees found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      <SlideOverPanel
        open={isPanelOpen}
        onClose={resetForm}
        title="Quick edit employee"
        description="Change sign-in email, role, branch, and password. Use the full form for HR onboarding fields."
      >
        <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
          <div className="form-field md:col-span-1">
            <label htmlFor="user-form-name" className="form-label-muted">
              Full name
            </label>
            <input
              id="user-form-name"
              value={form.name}
              onChange={(e) => setForm((old) => ({ ...old, name: e.target.value }))}
              placeholder="e.g. Priya Sharma"
              className="form-input"
              autoComplete="name"
              required
            />
          </div>
          <div className="form-field md:col-span-1">
            <label htmlFor="user-form-email" className="form-label-muted">
              Email
            </label>
            <input
              id="user-form-email"
              type="email"
              value={form.email}
              onChange={(e) => setForm((old) => ({ ...old, email: e.target.value }))}
              placeholder="name@company.com"
              className="form-input"
              autoComplete="email"
              required
            />
          </div>
          <div className="form-field md:col-span-2">
            <label htmlFor="user-form-password" className="form-label-muted">
              {editingId ? 'New password (optional)' : 'Password'}
            </label>
            <div className="relative">
              <input
                id="user-form-password"
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={(e) => setForm((old) => ({ ...old, password: e.target.value }))}
                placeholder={editingId ? 'Leave blank to keep current' : 'Minimum 6 characters'}
                className="form-input pr-11"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((old) => !old)}
                className="absolute right-2 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
              {showPassword ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                  <path d="m3 3 18 18" />
                  <path d="M10.7 10.7a3 3 0 0 0 4.2 4.2" />
                  <path d="M9.9 4.2A10.8 10.8 0 0 1 12 4c5 0 9.3 3.1 11 8-1 2.7-2.9 4.8-5.4 6.2" />
                  <path d="M6.6 6.6C4.3 8 2.6 9.8 1.6 12c1.7 4.9 6 8 10.4 8 1.5 0 2.9-.3 4.2-.8" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
              </button>
            </div>
          </div>
          <div className="form-field">
            <label htmlFor="user-form-phone" className="form-label-muted">
              Phone
            </label>
            <input
              id="user-form-phone"
              value={form.phone}
              onChange={(e) => setForm((old) => ({ ...old, phone: e.target.value }))}
              placeholder="+91 …"
              className="form-input"
              autoComplete="tel"
            />
          </div>
          <div className="form-field">
            <label htmlFor="user-form-role" className="form-label-muted">
              Role
            </label>
            <UiSelect
              id="user-form-role"
              className="capitalize"
              menuClassName="capitalize"
              value={form.role}
              onChange={(next) => setForm((old) => ({ ...old, role: next }))}
              options={USER_ROLES.map((r) => ({ value: r.value, label: r.label }))}
            />
          </div>
          <div className="form-field md:col-span-2">
            <label htmlFor="user-form-branch" className="form-label-muted">
              Branch{companyBranches.length > 0 ? <span className="text-rose-600"> *</span> : null}
            </label>
            <UiSelect
              id="user-form-branch"
              value={form.branchId}
              onChange={(next) => setForm((old) => ({ ...old, branchId: next }))}
              options={branchSelectOptions}
            />
            <p className="mt-1 text-xs text-slate-500">
              {companyBranches.length > 0
                ? 'Required when your company has branches. Used for attendance geofence and HR branch name.'
                : 'Add branches under Settings → Company → Branches to enable assignment.'}
            </p>
          </div>
          <div className="form-field md:col-span-2">
            <label htmlFor="user-form-shift" className="form-label-muted">
              Work shift
            </label>
            <UiSelect
              id="user-form-shift"
              value={form.shiftId}
              onChange={(next) => setForm((old) => ({ ...old, shiftId: next }))}
              options={shiftSelectOptions}
            />
            <p className="mt-1 text-xs text-slate-500">Used for attendance expectations on the employee calendar.</p>
          </div>
          <label className="md:col-span-2 flex cursor-pointer items-center gap-3 rounded-xl border border-neutral-200/80 bg-flux-panel px-4 py-3 text-sm font-medium text-slate-700 transition hover:border-neutral-300">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm((old) => ({ ...old, isActive: e.target.checked }))}
              className="form-checkbox"
            />
            Account is active
          </label>
          <p className="md:col-span-2 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">
            Leave password empty to keep the current password.
          </p>
          {editingId && (
            <div className="md:col-span-2">
              <button
                type="button"
                className="text-sm font-semibold text-primary hover:underline"
                onClick={() => navigate(`/dashboard/users/${editingId}/employee`)}
              >
                Full employee record (HR fields) →
              </button>
            </div>
          )}
          <div className="md:col-span-2 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
            {editingId && (
              <button type="button" onClick={resetForm} className="btn-secondary">
                Cancel
              </button>
            )}
            <button type="submit" disabled={saving} className="btn-primary disabled:cursor-not-allowed">
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </SlideOverPanel>
    </section>
  );
}

export default UsersPage;
