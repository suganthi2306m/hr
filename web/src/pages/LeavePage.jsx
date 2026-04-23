import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import clsx from 'clsx';
import apiClient from '../api/client';
import UiSelect from '../components/common/UiSelect';
import TablePagination from '../components/common/TablePagination';
import SlideOverPanel from '../components/common/SlideOverPanel';

function normalizeLeaveStatus(value) {
  return String(value || 'pending')
    .trim()
    .toLowerCase();
}

function statusBadgeClass(status) {
  const s = normalizeLeaveStatus(status);
  if (s === 'approved') return 'bg-emerald-100 text-emerald-800';
  if (s === 'rejected') return 'bg-rose-100 text-rose-800';
  return 'bg-amber-100 text-amber-800';
}

function dayDiffInclusive(from, to) {
  const a = dayjs(from);
  const b = dayjs(to);
  if (!a.isValid() || !b.isValid()) return 0;
  return Math.max(1, b.startOf('day').diff(a.startOf('day'), 'day') + 1);
}

function LeavePage() {
  const [users, setUsers] = useState([]);
  const [items, setItems] = useState([]);
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingLeaveId, setSavingLeaveId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [employeeFilter, setEmployeeFilter] = useState('all');
  const [leaveTypeFilter, setLeaveTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [anchorMonth, setAnchorMonth] = useState(() => dayjs().format('YYYY-MM-DD'));
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [formEmployeeId, setFormEmployeeId] = useState('');
  const [formLeaveType, setFormLeaveType] = useState('CASUAL');
  const [formFromDate, setFormFromDate] = useState('');
  const [formToDate, setFormToDate] = useState('');
  const [formReason, setFormReason] = useState('');
  const [formAttachment, setFormAttachment] = useState(null);

  const monthRange = useMemo(() => {
    const base = dayjs(anchorMonth);
    return {
      from: base.startOf('month'),
      to: base.endOf('month'),
      label: base.format('MMM YYYY'),
    };
  }, [anchorMonth]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const [{ data: usersData }, { data: leavesData }, { data: companyData }] = await Promise.all([
          apiClient.get('/users'),
          apiClient.get('/ops/leaves'),
          apiClient.get('/company'),
        ]);
        if (cancelled) return;
        setUsers(Array.isArray(usersData?.items) ? usersData.items : []);
        setItems(Array.isArray(leavesData?.items) ? leavesData.items : []);
        setCompany(companyData?.company || null);
      } catch (e) {
        if (!cancelled) {
          setUsers([]);
          setItems([]);
          setCompany(null);
          setError(e?.response?.data?.message || 'Unable to load leave data.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const usersById = useMemo(() => {
    const map = new Map();
    users.forEach((u) => map.set(String(u._id), u));
    return map;
  }, [users]);

  const leaveTypeOptions = useMemo(() => {
    const orgTypes = Array.isArray(company?.orgSetup?.leaveTypes)
      ? company.orgSetup.leaveTypes.filter((r) => r && r.isActive !== false && String(r.name || '').trim())
      : [];
    if (orgTypes.length) {
      return orgTypes.map((r) => {
        const val = String(r.name || '').trim().toUpperCase();
        return { value: val, label: r.name };
      });
    }
    return [
      { value: 'CASUAL', label: 'Casual Leave' },
      { value: 'SICK', label: 'Sick Leave' },
      { value: 'PAID', label: 'Paid Leave' },
      { value: 'UNPAID', label: 'Leave Without Pay' },
    ];
  }, [company]);

  useEffect(() => {
    if (!leaveTypeOptions.length) return;
    if (!leaveTypeOptions.some((x) => x.value === formLeaveType)) {
      setFormLeaveType(leaveTypeOptions[0].value);
    }
  }, [leaveTypeOptions, formLeaveType]);

  const employeeSelectOptions = useMemo(
    () => [
      { value: 'all', label: 'All Employees' },
      ...users
        .slice()
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
        .map((u) => ({ value: String(u._id), label: u.name || u.email || 'Employee' })),
    ],
    [users],
  );

  const tableRows = useMemo(() => {
    return items
      .map((item) => {
        const employee = usersById.get(String(item.userId));
        if (!employee) return null;
        const created = dayjs(item.createdAt);
        const start = dayjs(item.startDate);
        const end = dayjs(item.endDate);
        const leaveType = String(item.leaveType || item.type || '').trim();
        const statusNorm = normalizeLeaveStatus(item.status);
        return {
          ...item,
          employee,
          statusNorm,
          leaveTypeLabel:
            leaveTypeOptions.find((x) => x.value === leaveType.toUpperCase())?.label ||
            leaveType ||
            'Leave',
          createdDay: created,
          startDay: start,
          endDay: end,
          noOfDays: dayDiffInclusive(item.startDate, item.endDate),
        };
      })
      .filter(Boolean)
      .filter((row) => {
        if (employeeFilter !== 'all' && String(row.userId) !== employeeFilter) return false;
        if (statusFilter !== 'all' && row.statusNorm !== statusFilter) return false;
        if (leaveTypeFilter !== 'all') {
          const rowType = String(row.leaveType || row.type || '').toUpperCase();
          if (rowType !== leaveTypeFilter) return false;
        }
        if (!row.createdDay.isValid()) return false;
        return !row.createdDay.isBefore(monthRange.from, 'day') && !row.createdDay.isAfter(monthRange.to, 'day');
      })
      .sort((a, b) => dayjs(b.createdAt).valueOf() - dayjs(a.createdAt).valueOf());
  }, [items, usersById, employeeFilter, statusFilter, leaveTypeFilter, monthRange.from, monthRange.to, leaveTypeOptions]);

  const pagedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return tableRows.slice(start, start + pageSize);
  }, [tableRows, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [employeeFilter, statusFilter, leaveTypeFilter, anchorMonth, pageSize]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(tableRows.length / pageSize));
    if (page > totalPages) setPage(totalPages);
  }, [tableRows.length, page, pageSize]);

  const resetForm = () => {
    setFormEmployeeId('');
    setFormLeaveType(leaveTypeOptions[0]?.value || 'CASUAL');
    setFormFromDate('');
    setFormToDate('');
    setFormReason('');
    setFormAttachment(null);
  };

  const openLeaveDrawer = () => {
    resetForm();
    setDrawerOpen(true);
  };

  const closeLeaveDrawer = () => {
    setDrawerOpen(false);
    resetForm();
  };

  const createLeave = async (e) => {
    e?.preventDefault?.();
    if (!formEmployeeId) {
      setError('Employee name is required.');
      return;
    }
    if (!formFromDate || !formToDate) {
      setError('From and To dates are required.');
      return;
    }
    if (dayjs(formToDate).isBefore(dayjs(formFromDate), 'day')) {
      setError('To date must be same as or after From date.');
      return;
    }
    if (!String(formReason || '').trim()) {
      setError('Reason for taking leave is required.');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');
    try {
      const payload = {
        userId: formEmployeeId,
        startDate: formFromDate,
        endDate: formToDate,
        leaveType: formLeaveType,
        reason: String(formReason || '').trim(),
      };
      const { data } = await apiClient.post('/ops/leaves', payload);
      if (data?.item) {
        setItems((old) => [data.item, ...old]);
      }
      setMessage('Leave request created.');
      closeLeaveDrawer();
    } catch (e) {
      setError(e?.response?.data?.message || 'Unable to create leave request.');
    } finally {
      setSaving(false);
    }
  };

  const updateLeaveStatus = async (row, status) => {
    if (!row?._id) return;
    if (status === 'rejected' && !window.confirm('Reject this leave request?')) return;
    setSaving(true);
    setSavingLeaveId(String(row._id));
    setError('');
    setMessage('');
    try {
      const { data } = await apiClient.patch(`/ops/leaves/${row._id}/status`, { status });
      const updated = data?.item;
      if (updated) {
        setItems((old) => old.map((x) => (String(x._id) === String(updated._id) ? updated : x)));
      }
      setMessage(status === 'approved' ? 'Leave request approved.' : 'Leave request rejected.');
    } catch (e) {
      setError(
        e?.response?.data?.message ||
          (status === 'approved' ? 'Unable to approve leave request.' : 'Unable to reject leave request.'),
      );
    } finally {
      setSaving(false);
      setSavingLeaveId('');
    }
  };

  return (
    <section className="space-y-6 text-slate-800">
      <h1 className="text-2xl font-black tracking-tight text-dark">Leave Approvals</h1>

      {(message || error) && (
        <div className="space-y-2">
          {message ? <p className="alert-success">{message}</p> : null}
          {error ? <p className="alert-error">{error}</p> : null}
        </div>
      )}

      <div className="flux-card space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-end gap-2">
            <div className="form-field min-w-[200px] flex-1 md:flex-none">
              <label className="sr-only" htmlFor="leave-employee-filter">
                Employee filter
              </label>
              <UiSelect
                id="leave-employee-filter"
                value={employeeFilter}
                onChange={setEmployeeFilter}
                options={employeeSelectOptions}
                searchable
                className="py-2 text-sm"
                menuClassName="text-sm"
              />
            </div>
            <div className="form-field min-w-[150px] flex-1 md:flex-none">
              <label className="sr-only" htmlFor="leave-type-filter">
                Leave type filter
              </label>
              <UiSelect
                id="leave-type-filter"
                value={leaveTypeFilter}
                onChange={setLeaveTypeFilter}
                options={[{ value: 'all', label: 'Leave Type' }, ...leaveTypeOptions]}
                className="py-2 text-sm"
                menuClassName="text-sm"
              />
            </div>
            <div className="form-field min-w-[150px] flex-1 md:flex-none">
              <label className="sr-only" htmlFor="leave-status-filter">
                Status filter
              </label>
              <UiSelect
                id="leave-status-filter"
                value={statusFilter}
                onChange={setStatusFilter}
                options={[
                  { value: 'all', label: 'Status' },
                  { value: 'pending', label: 'Pending' },
                  { value: 'approved', label: 'Approved' },
                  { value: 'rejected', label: 'Rejected' },
                ]}
                className="py-2 text-sm"
                menuClassName="text-sm"
              />
            </div>
          </div>

          <button type="button" className="btn-primary" onClick={openLeaveDrawer}>
            + Leave Request
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 bg-white"
              onClick={() => setAnchorMonth((old) => dayjs(old).subtract(1, 'month').format('YYYY-MM-DD'))}
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m14 6-6 6 6 6" />
              </svg>
            </button>
            <p className="min-w-[108px] text-center text-sm font-semibold text-dark">{monthRange.label}</p>
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 bg-white"
              onClick={() => setAnchorMonth((old) => dayjs(old).add(1, 'month').format('YYYY-MM-DD'))}
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m10 6 6 6-6 6" />
              </svg>
            </button>
          </div>

          <TablePagination
            page={page}
            pageSize={pageSize}
            totalCount={tableRows.length}
            onPageChange={(nextPage) => setPage(Math.max(1, nextPage))}
            onPageSizeChange={(nextSize) => {
              setPageSize(nextSize);
              setPage(1);
            }}
            pageSizeOptions={[10, 25, 50]}
          />
        </div>

        <div className="overflow-x-auto rounded-xl border border-neutral-200">
          <table className="min-w-[1180px] w-full text-sm">
            <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-2 py-2 text-left">SR No.</th>
                <th className="px-2 py-2 text-left">Employee</th>
                <th className="px-2 py-2 text-left">Leave Type</th>
                <th className="px-2 py-2 text-left">From</th>
                <th className="px-2 py-2 text-left">To</th>
                <th className="px-2 py-2 text-left">No Of Days</th>
                <th className="px-2 py-2 text-left">Reason</th>
                <th className="px-2 py-2 text-left">Attachment</th>
                <th className="px-2 py-2 text-left">Created by</th>
                <th className="px-2 py-2 text-left">Updated by</th>
                <th className="px-2 py-2 text-left">Status</th>
                <th className="sticky right-0 z-[1] min-w-[180px] bg-slate-100 px-2 py-2 text-left shadow-[-6px_0_10px_-6px_rgba(0,0,0,0.12)]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={12} className="px-2 py-6 text-center text-xs text-slate-500">
                    Loading leave requests...
                  </td>
                </tr>
              ) : pagedRows.length ? (
                pagedRows.map((row, idx) => (
                  <tr key={row._id} className="border-t border-neutral-100">
                    <td className="px-2 py-2 text-slate-700">{(page - 1) * pageSize + idx + 1}</td>
                    <td className="px-2 py-2 font-medium text-dark">{row.employee.name || 'Employee'}</td>
                    <td className="px-2 py-2 text-slate-800">{row.leaveTypeLabel}</td>
                    <td className="px-2 py-2 text-slate-800">{row.startDay.isValid() ? row.startDay.format('DD MMM YYYY') : '—'}</td>
                    <td className="px-2 py-2 text-slate-800">{row.endDay.isValid() ? row.endDay.format('DD MMM YYYY') : '—'}</td>
                    <td className="px-2 py-2 text-slate-800">
                      {row.noOfDays} day{row.noOfDays > 1 ? 's' : ''}
                    </td>
                    <td className="max-w-[14rem] px-2 py-2 text-slate-700">{row.reason || '—'}</td>
                    <td className="px-2 py-2 text-slate-500">---</td>
                    <td className="px-2 py-2">
                      <p className="font-medium text-dark">{row.employee.name || '—'}</p>
                      <p className="text-xs text-slate-500">
                        {row.createdAt ? dayjs(row.createdAt).format('DD MMM YYYY') : ''}
                      </p>
                    </td>
                    <td className="px-2 py-2 text-slate-600">--</td>
                    <td className="px-2 py-2">
                      <span
                        className={clsx(
                          'rounded-full px-2 py-0.5 text-xs font-semibold capitalize',
                          statusBadgeClass(row.statusNorm),
                        )}
                      >
                        {row.statusNorm}
                      </span>
                    </td>
                    <td className="sticky right-0 z-[1] min-w-[180px] border-l border-neutral-100 bg-white px-2 py-2 shadow-[-6px_0_10px_-6px_rgba(0,0,0,0.12)]">
                      {row.statusNorm === 'pending' ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {(() => {
                            const rowBusy = saving && (savingLeaveId === '' || savingLeaveId === String(row._id));
                            return (
                              <>
                                <button
                                  type="button"
                                  className="rounded-full bg-primary px-3 py-1 text-sm font-semibold text-dark shadow-sm transition hover:brightness-95 disabled:opacity-50"
                                  disabled={rowBusy}
                                  onClick={() => updateLeaveStatus(row, 'approved')}
                                >
                                  {savingLeaveId === String(row._id) ? '…' : 'Approve'}
                                </button>
                                <button
                                  type="button"
                                  className="rounded-full border border-rose-300 bg-white px-3 py-1 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                                  disabled={rowBusy}
                                  onClick={() => updateLeaveStatus(row, 'rejected')}
                                >
                                  {savingLeaveId === String(row._id) ? '…' : 'Reject'}
                                </button>
                              </>
                            );
                          })()}
                        </div>
                      ) : (
                        <span className="text-sm text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={12} className="px-2 py-6 text-center text-sm text-slate-500">
                    No leave requests for selected filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <SlideOverPanel
        open={drawerOpen}
        onClose={closeLeaveDrawer}
        title="Leave Request"
        description="Choose employee, dates, and leave type. Number of days is calculated from the range."
        widthClass="sm:max-w-xl"
      >
        <form className="grid gap-4 text-sm" onSubmit={createLeave}>
          <div className="rounded-xl border border-neutral-200 bg-flux-panel p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Leave type</p>
            <div className="mt-2">
              <UiSelect
                value={formLeaveType}
                onChange={setFormLeaveType}
                options={leaveTypeOptions}
                className="py-2 text-sm"
                menuClassName="text-sm"
              />
            </div>
            <p className="mt-1.5 text-sm text-slate-500">
              Uses leave types from Organization setup when configured; otherwise standard categories apply.
            </p>
          </div>

          <div className="form-field">
            <label htmlFor="leave-form-employee" className="form-label-muted">
              Employee name <span className="text-red-600">*</span>
            </label>
            <UiSelect
              id="leave-form-employee"
              value={formEmployeeId}
              onChange={setFormEmployeeId}
              options={users
                .slice()
                .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
                .map((u) => ({ value: String(u._id), label: u.name || u.email || 'Employee' }))}
              placeholder="Select employee"
              searchable
              className="py-2 text-sm"
              menuClassName="text-sm"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="form-field">
              <label htmlFor="leave-form-from" className="form-label-muted">
                From <span className="text-red-600">*</span>
              </label>
              <input
                id="leave-form-from"
                type="date"
                className="form-input text-sm"
                value={formFromDate}
                onChange={(e) => setFormFromDate(e.target.value)}
              />
            </div>
            <div className="form-field">
              <label htmlFor="leave-form-to" className="form-label-muted">
                To <span className="text-red-600">*</span>
              </label>
              <input
                id="leave-form-to"
                type="date"
                className="form-input text-sm"
                value={formToDate}
                onChange={(e) => setFormToDate(e.target.value)}
              />
            </div>
          </div>

          <div className="form-field">
            <label htmlFor="leave-form-days" className="form-label-muted">
              Number of days
            </label>
            <input
              id="leave-form-days"
              className="form-input bg-slate-50 text-sm"
              value={formFromDate && formToDate ? String(dayDiffInclusive(formFromDate, formToDate)) : '0'}
              readOnly
            />
            <p className="mt-1 text-sm text-slate-500">Updates automatically when you change the date range.</p>
          </div>

          <div className="form-field">
            <label htmlFor="leave-form-reason" className="form-label-muted">
              Reason for taking leave <span className="text-red-600">*</span>
            </label>
            <textarea
              id="leave-form-reason"
              rows={4}
              className="form-textarea min-h-[88px] text-sm"
              value={formReason}
              onChange={(e) => setFormReason(e.target.value)}
              placeholder="Briefly describe why this leave is needed"
            />
          </div>

          <div className="rounded-xl border border-neutral-200/90 bg-gradient-to-br from-flux-panel via-white to-primary/10 p-3 shadow-sm">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Supporting document</p>
                <p className="mt-1 text-sm text-slate-600">
                  Optional file upload (e.g. medical certificate). Stored locally in this session only.
                </p>
              </div>
              <label className="inline-flex cursor-pointer shrink-0 flex-col items-center justify-center rounded-xl border-2 border-dashed border-primary/40 bg-white/80 px-3 py-4 text-center transition hover:border-primary hover:bg-primary/5">
                <input
                  type="file"
                  className="sr-only"
                  onChange={(e) => setFormAttachment(e.target.files && e.target.files.length ? e.target.files[0] : null)}
                />
                <span className="text-xl font-light text-primary">+</span>
                <span className="mt-0.5 text-sm font-semibold text-dark">Upload document</span>
              </label>
            </div>
            {formAttachment ? (
              <p className="mt-2 text-sm font-medium text-slate-700">
                Selected: <span className="text-dark">{formAttachment.name}</span>
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap justify-end gap-2 border-t border-neutral-100 pt-3">
            <button type="button" className="btn-secondary" disabled={saving} onClick={closeLeaveDrawer}>
              Cancel
            </button>
            <button type="submit" className="btn-primary min-w-[6rem]" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </SlideOverPanel>
    </section>
  );
}

export default LeavePage;
