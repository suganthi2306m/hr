import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import apiClient from '../api/client';
import UiSelect from '../components/common/UiSelect';
import { PERMISSION_PRESETS, USER_ROLES } from '../constants/rbac';
import { BLOOD_GROUPS, emptyEmployeeProfile, mergeEmployeeProfile } from '../constants/employeeProfile';
import CustomFieldControl from '../components/customFields/CustomFieldControl';
import { missingRequiredCustomFieldLabels } from '../utils/customFieldValues';

const defaultIdGeneration = {
  employee: { enabled: false, prefix: 'EMP', startNumber: 1, nextNumber: 1, padLength: 4 },
};

function asNonNegativeInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.floor(n));
}

function normalizeIdGeneration(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const emp = src.employee && typeof src.employee === 'object' ? src.employee : {};
  const startNumber = asNonNegativeInt(emp.startNumber, 1);
  const nextNumber = asNonNegativeInt(emp.nextNumber, startNumber);
  return {
    employee: {
      enabled: Boolean(emp.enabled),
      prefix: String(emp.prefix != null ? emp.prefix : 'EMP'),
      startNumber,
      nextNumber: Math.max(startNumber, nextNumber),
      padLength: asNonNegativeInt(emp.padLength, 4),
    },
  };
}

function previewGeneratedCode(cfg) {
  if (!cfg || cfg.enabled !== true) return '';
  const n = Math.max(asNonNegativeInt(cfg.nextNumber, 1), asNonNegativeInt(cfg.startNumber, 1));
  return `${String(cfg.prefix || '').trim()}${String(n).padStart(asNonNegativeInt(cfg.padLength, 4), '0')}`;
}

function defaultPerms() {
  return PERMISSION_PRESETS.reduce((acc, p) => {
    acc[p.key] = true;
    return acc;
  }, {});
}

function Section({ title, children }) {
  return (
    <div className="rounded-2xl border border-neutral-200/90 bg-white p-5 shadow-sm">
      <h3 className="border-b border-neutral-100 pb-3 text-sm font-bold uppercase tracking-wide text-primary">{title}</h3>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </div>
  );
}

function Field({ label, required, className = '', children }) {
  return (
    <div className={`form-field min-w-0 ${className}`}>
      <label className="form-label-muted">
        {label}
        {required ? <span className="text-rose-600"> *</span> : null}
      </label>
      {children}
    </div>
  );
}

function CustomFieldEditor({ defs, custom, onChange }) {
  const visible = defs.filter((d) => d.isActive !== false);
  if (!visible.length) return null;
  return (
    <Section title="Custom fields (from settings)">
      {visible.map((d) => (
        <Field key={d.key} label={d.label} required={d.isRequired === true} className="sm:col-span-2 lg:col-span-1">
          <CustomFieldControl
            def={d}
            value={custom[d.key]}
            onChange={(next) => onChange({ ...custom, [d.key]: next })}
          />
        </Field>
      ))}
    </Section>
  );
}

export default function EmployeeOnboardingPage() {
  const navigate = useNavigate();
  const { id: editUserId } = useParams();
  const isCreate = !editUserId;

  const [loading, setLoading] = useState(!isCreate);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('field_agent');
  const [branchId, setBranchId] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [employeeCode, setEmployeeCode] = useState('');
  const [permissions, setPermissions] = useState(() => defaultPerms());

  const [profile, setProfile] = useState(() => emptyEmployeeProfile());
  const [companyBranches, setCompanyBranches] = useState([]);
  const [orgDepartments, setOrgDepartments] = useState([]);
  const [orgDesignations, setOrgDesignations] = useState([]);
  const [orgEmploymentTypes, setOrgEmploymentTypes] = useState([]);
  const [staffOptions, setStaffOptions] = useState([]);
  const [customFieldDefs, setCustomFieldDefs] = useState([]);
  const [idGeneration, setIdGeneration] = useState(defaultIdGeneration);

  const managerOptions = useMemo(
    () => [
      { value: '', label: 'No reporting manager' },
      ...staffOptions
        .filter((u) => (isCreate ? true : String(u._id) !== String(editUserId)))
        .map((u) => ({ value: String(u._id), label: u.name || u.email })),
    ],
    [staffOptions, isCreate, editUserId],
  );

  const deptOptions = useMemo(
    () => [{ value: '', label: 'Select department' }, ...orgDepartments.map((d) => ({ value: d.name, label: d.name }))],
    [orgDepartments],
  );
  const desigOptions = useMemo(
    () => [{ value: '', label: 'Select designation' }, ...orgDesignations.map((d) => ({ value: d.name, label: d.name }))],
    [orgDesignations],
  );
  const empTypeOptions = useMemo(
    () => [{ value: '', label: 'Select employment type' }, ...orgEmploymentTypes.map((d) => ({ value: d.name, label: d.name }))],
    [orgEmploymentTypes],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [{ data: companyData }, { data: usersData }] = await Promise.all([
          apiClient.get('/company'),
          apiClient.get('/users'),
        ]);
        if (cancelled) return;
        const c = companyData.company || {};
        setCompanyBranches(Array.isArray(c.branches) ? c.branches : []);
        const os = c.orgSetup && typeof c.orgSetup === 'object' ? c.orgSetup : {};
        setOrgDepartments((Array.isArray(os.departments) ? os.departments : []).filter((x) => x && x.isActive !== false));
        setOrgDesignations((Array.isArray(os.designations) ? os.designations : []).filter((x) => x && x.isActive !== false));
        setOrgEmploymentTypes((Array.isArray(os.employmentTypes) ? os.employmentTypes : []).filter((x) => x && x.isActive !== false));
        setCustomFieldDefs(Array.isArray(c.employeeCustomFieldDefs) ? c.employeeCustomFieldDefs : []);
        setIdGeneration(normalizeIdGeneration(os.idGeneration));
        const items = Array.isArray(usersData.items) ? usersData.items : [];
        setStaffOptions(items);
      } catch {
        if (!cancelled) {
          setCompanyBranches([]);
          setStaffOptions([]);
          setIdGeneration(defaultIdGeneration);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (isCreate) {
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const { data } = await apiClient.get('/users');
        if (cancelled) return;
        const items = Array.isArray(data.items) ? data.items : [];
        const u = items.find((x) => String(x._id) === String(editUserId));
        if (!u) {
          setError('Employee not found.');
          setLoading(false);
          return;
        }
        setEmail(u.email || '');
        setPhone(u.phone || '');
        setRole(u.role === 'field_user' ? 'field_agent' : u.role === 'supervisor' ? 'manager' : u.role || 'field_agent');
        setBranchId(u.branchId ? String(u.branchId) : '');
        setIsActive(Boolean(u.isActive));
        setEmployeeCode(u.employeeCode || '');
        const permBase = defaultPerms();
        setPermissions({ ...permBase, ...(u.permissions && typeof u.permissions === 'object' ? u.permissions : {}) });
        const merged = mergeEmployeeProfile(u.employeeProfile);
        const brMatch = companyBranches.find((b) => String(b._id) === String(u.branchId || ''));
        if (brMatch) merged.branchName = String(brMatch.name || merged.branchName || '').trim() || merged.branchName;
        setProfile(merged);
      } catch (e) {
        if (!cancelled) setError(e.response?.data?.message || 'Unable to load employee.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editUserId, isCreate, companyBranches]);

  const setProfileField = (key, value) => setProfile((p) => ({ ...p, [key]: value }));

  const addWorkRow = () =>
    setProfile((p) => ({
      ...p,
      workExperience: [...p.workExperience, { company: '', role: '', from: '', to: '', summary: '' }],
    }));
  const updateWorkRow = (i, key, value) =>
    setProfile((p) => ({
      ...p,
      workExperience: p.workExperience.map((row, j) => (j === i ? { ...row, [key]: value } : row)),
    }));
  const removeWorkRow = (i) =>
    setProfile((p) => ({
      ...p,
      workExperience: p.workExperience.filter((_, j) => j !== i),
    }));

  const addEduRow = () =>
    setProfile((p) => ({
      ...p,
      education: [...p.education, { instituteName: '', specialization: '', degree: '', dateOfCompletion: '' }],
    }));
  const updateEduRow = (i, key, value) =>
    setProfile((p) => ({
      ...p,
      education: p.education.map((row, j) => (j === i ? { ...row, [key]: value } : row)),
    }));
  const removeEduRow = (i) =>
    setProfile((p) => ({
      ...p,
      education: p.education.filter((_, j) => j !== i),
    }));

  const branchIdForApi = useMemo(() => String(branchId || '').trim(), [branchId]);

  /** Show preview / read-only field when company auto-generates and this record has no code yet (create or legacy edit). */
  const employeeCodeAutoMode = Boolean(
    idGeneration.employee.enabled && (isCreate || !String(employeeCode || '').trim()),
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const fn = String(profile.firstName || '').trim();
      const ln = String(profile.lastName || '').trim();
      const displayName = [fn, ln].filter(Boolean).join(' ').trim() || String(email).split('@')[0] || 'Employee';
      const pwd = String(password || '').trim();
      if (isCreate && !pwd) {
        setError('Password is required for a new account.');
        setSaving(false);
        return;
      }
      if (!String(email || '').trim()) {
        setError('Work email is required.');
        setSaving(false);
        return;
      }
      if (companyBranches.length > 0 && !String(branchId || '').trim()) {
        setError('Branch is required when your company has branches.');
        setSaving(false);
        return;
      }
      if (!employeeCodeAutoMode && !String(employeeCode || '').trim()) {
        setError('Employee code is required.');
        setSaving(false);
        return;
      }
      if (!String(profile.department || '').trim()) {
        setError('Department is required.');
        setSaving(false);
        return;
      }
      if (!String(profile.employmentType || '').trim()) {
        setError('Employment type is required.');
        setSaving(false);
        return;
      }
      if (!String(profile.dateOfJoining || '').trim()) {
        setError('Date of joining is required.');
        setSaving(false);
        return;
      }
      if (!String(profile.personalMobile || '').trim()) {
        setError('Personal mobile is required.');
        setSaving(false);
        return;
      }
      if (!String(profile.emergencyContact || '').trim()) {
        setError('Emergency contact is required.');
        setSaving(false);
        return;
      }
      if (!String(profile.permanentAddress || '').trim()) {
        setError('Permanent address is required.');
        setSaving(false);
        return;
      }

      const missingCustom = missingRequiredCustomFieldLabels(customFieldDefs, profile.custom);
      if (missingCustom.length) {
        setError(`Please fill required custom field(s): ${missingCustom.join(', ')}.`);
        setSaving(false);
        return;
      }

      const employeeProfile = {
        ...profile,
        workExperience: profile.workExperience,
        education: profile.education,
        custom: { ...profile.custom },
      };

      const payload = {
        name: displayName,
        email: String(email).trim().toLowerCase(),
        phone: String(phone || profile.personalMobile || '').trim(),
        role,
        branchId: branchIdForApi,
        isActive,
        permissions,
        employeeCode: employeeCodeAutoMode ? '' : String(employeeCode || '').trim(),
        employeeProfile,
      };
      if (pwd) payload.password = pwd;

      if (isCreate) {
        await apiClient.post('/users', payload);
        setMessage('Employee created.');
        navigate('/dashboard/users');
      } else {
        await apiClient.put(`/users/${editUserId}`, payload);
        setMessage('Employee record saved.');
        navigate(`/dashboard/users/${editUserId}`);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to save employee.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-slate-500">Loading…</p>;
  }

  return (
    <form className="mx-auto max-w-6xl space-y-6 pb-24" onSubmit={handleSubmit}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <button
            type="button"
            className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 bg-white text-slate-600 transition hover:bg-neutral-50"
            onClick={() => navigate(isCreate ? '/dashboard/users' : `/dashboard/users/${editUserId}`)}
            title="Back"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <div>
            <h2 className="text-xl font-black text-dark">{isCreate ? 'Employee onboarding' : 'Edit employee record'}</h2>
            <p className="mt-1 text-sm text-slate-500">Full-page form for visibility. Required fields are marked.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary" onClick={() => navigate(isCreate ? '/dashboard/users' : `/dashboard/users/${editUserId}`)}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Saving…' : isCreate ? 'Create employee' : 'Save'}
          </button>
        </div>
      </div>

      {error && <p className="alert-error">{error}</p>}
      {message && <p className="alert-success">{message}</p>}

      <Section title="Account & access">
        <Field label="Work email" required>
          <input type="email" className="form-input" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={!isCreate} />
        </Field>
        <Field label={isCreate ? 'Password' : 'New password (optional)'} required={isCreate}>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              className="form-input pr-11"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required={isCreate}
            />
            <button
              type="button"
              className="absolute right-2 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
              onClick={() => setShowPassword((s) => !s)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </button>
          </div>
        </Field>
        <Field label="Account phone (app)">
          <input className="form-input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Shown on roster / ops" />
        </Field>
        <Field label="System role" required>
          <UiSelect value={role} onChange={setRole} options={USER_ROLES.map((r) => ({ value: r.value, label: r.label }))} />
        </Field>
        <Field label="Branch" required={companyBranches.length > 0} className="sm:col-span-2">
          <UiSelect
            id="employee-onboarding-branch"
            value={branchId}
            onChange={(v) => {
              setBranchId(v);
              const b = companyBranches.find((x) => String(x._id) === String(v));
              setProfile((p) => ({ ...p, branchName: b ? String(b.name || '').trim() : '' }));
            }}
            options={[
              { value: '', label: 'No branch' },
              ...companyBranches.map((b) => ({
                value: String(b._id),
                label: b.code ? `${b.name} (${b.code})` : b.name,
              })),
            ]}
          />
          <p className="mt-1 text-xs text-slate-500">Used for attendance geofence and employee HR branch (single assignment).</p>
        </Field>
        <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
          <input type="checkbox" className="form-checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Active account
        </label>
      </Section>

      <Section title="Basic detail">
        <Field label="Employee code" required={!employeeCodeAutoMode}>
          <input
            className={`form-input${employeeCodeAutoMode ? ' cursor-default bg-flux-panel text-slate-700' : ''}`}
            value={
              employeeCodeAutoMode
                ? String(employeeCode || '').trim() || previewGeneratedCode(idGeneration.employee) || ''
                : employeeCode
            }
            onChange={(e) => {
              if (employeeCodeAutoMode) return;
              setEmployeeCode(e.target.value);
            }}
            readOnly={employeeCodeAutoMode}
            required={!employeeCodeAutoMode}
            placeholder={employeeCodeAutoMode ? 'Assigned on save from ID settings' : ''}
            title={
              employeeCodeAutoMode
                ? 'Employee code is auto-generated from Settings → Employee ID & Branch ID'
                : undefined
            }
          />
          {employeeCodeAutoMode ? (
            <p className="mt-1 text-xs text-slate-500">
              Auto-generated from company settings (next: {previewGeneratedCode(idGeneration.employee) || '—'}).
            </p>
          ) : null}
        </Field>
        <Field label="First name" required>
          <input className="form-input" value={profile.firstName} onChange={(e) => setProfileField('firstName', e.target.value)} required />
        </Field>
        <Field label="Last name" required>
          <input className="form-input" value={profile.lastName} onChange={(e) => setProfileField('lastName', e.target.value)} required />
        </Field>
        <Field label="Father / husband">
          <input className="form-input" value={profile.fatherHusband} onChange={(e) => setProfileField('fatherHusband', e.target.value)} />
        </Field>
        <Field label="Nationality">
          <input className="form-input" value={profile.nationality} onChange={(e) => setProfileField('nationality', e.target.value)} />
        </Field>
        <Field label="Blood group">
          <UiSelect
            value={profile.bloodGroup}
            onChange={(v) => setProfileField('bloodGroup', v)}
            options={BLOOD_GROUPS.map((bg) => ({ value: bg, label: bg || 'Select blood group' }))}
          />
        </Field>
      </Section>

      <Section title="Work information">
        <Field label="Role (job title)" required>
          <input className="form-input" value={profile.jobRoleTitle} onChange={(e) => setProfileField('jobRoleTitle', e.target.value)} required />
        </Field>
        <Field label="Department" required>
          <UiSelect value={profile.department} onChange={(v) => setProfileField('department', v)} options={deptOptions} />
        </Field>
        <Field label="Designation" required>
          <UiSelect value={profile.designation} onChange={(v) => setProfileField('designation', v)} options={desigOptions} />
        </Field>
        <Field label="Employment type" required>
          <UiSelect value={profile.employmentType} onChange={(v) => setProfileField('employmentType', v)} options={empTypeOptions} />
        </Field>
        <Field label="Source of hire">
          <input className="form-input" value={profile.sourceOfHire} onChange={(e) => setProfileField('sourceOfHire', e.target.value)} />
        </Field>
        <Field label="Date of joining" required>
          <input type="date" className="form-input" value={profile.dateOfJoining} onChange={(e) => setProfileField('dateOfJoining', e.target.value)} />
        </Field>
        <Field label="Current experience">
          <input className="form-input" value={profile.currentExperienceLabel} onChange={(e) => setProfileField('currentExperienceLabel', e.target.value)} />
        </Field>
        <Field label="Total experience (years)">
          <input className="form-input" value={profile.totalExperienceYears} onChange={(e) => setProfileField('totalExperienceYears', e.target.value)} />
        </Field>
        <Field label="Total experience (months)">
          <input className="form-input" value={profile.totalExperienceMonths} onChange={(e) => setProfileField('totalExperienceMonths', e.target.value)} />
        </Field>
        <Field label="Probation (days)">
          <input className="form-input" value={profile.probationDays} onChange={(e) => setProfileField('probationDays', e.target.value)} />
        </Field>
      </Section>

      <Section title="Hierarchy">
        <Field label="Reporting manager">
          <UiSelect
            value={profile.reportingManagerId}
            onChange={(v) => setProfileField('reportingManagerId', v)}
            options={managerOptions}
          />
        </Field>
        <Field label="Secondary reporting manager">
          <UiSelect
            value={profile.secondaryReportingManagerId}
            onChange={(v) => setProfileField('secondaryReportingManagerId', v)}
            options={managerOptions}
          />
        </Field>
      </Section>

      <Section title="Personal details">
        <Field label="Date of birth" required>
          <input type="date" className="form-input" value={profile.dateOfBirth} onChange={(e) => setProfileField('dateOfBirth', e.target.value)} />
        </Field>
        <Field label="Age">
          <input className="form-input" value={profile.age} onChange={(e) => setProfileField('age', e.target.value)} />
        </Field>
        <Field label="Gender" required>
          <UiSelect
            value={profile.gender}
            onChange={(v) => setProfileField('gender', v)}
            options={[
              { value: '', label: 'Select' },
              { value: 'Male', label: 'Male' },
              { value: 'Female', label: 'Female' },
              { value: 'Other', label: 'Other' },
            ]}
          />
        </Field>
        <Field label="Marital status">
          <UiSelect
            value={profile.maritalStatus}
            onChange={(v) => setProfileField('maritalStatus', v)}
            options={[
              { value: '', label: 'Select' },
              { value: 'Single', label: 'Single' },
              { value: 'Married', label: 'Married' },
              { value: 'Other', label: 'Other' },
            ]}
          />
        </Field>
        <Field label="About me" className="sm:col-span-2 lg:col-span-3">
          <textarea className="form-input min-h-[100px]" value={profile.aboutMe} onChange={(e) => setProfileField('aboutMe', e.target.value)} />
        </Field>
      </Section>

      <Section title="Identity information">
        <Field label="UAN">
          <input className="form-input" value={profile.uan} onChange={(e) => setProfileField('uan', e.target.value)} />
        </Field>
        <Field label="PAN">
          <input className="form-input" value={profile.pan} onChange={(e) => setProfileField('pan', e.target.value)} />
        </Field>
        <Field label="Aadhaar">
          <input className="form-input" value={profile.aadhaar} onChange={(e) => setProfileField('aadhaar', e.target.value)} />
        </Field>
        <Field label="IP number">
          <input className="form-input" value={profile.ipNumber} onChange={(e) => setProfileField('ipNumber', e.target.value)} />
        </Field>
      </Section>

      <Section title="Bank detail">
        <Field label="Payment mode">
          <UiSelect
            value={profile.paymentMode}
            onChange={(v) => setProfileField('paymentMode', v)}
            options={[
              { value: 'Cash', label: 'Cash' },
              { value: 'Bank', label: 'Bank transfer' },
              { value: 'Cheque', label: 'Cheque' },
            ]}
          />
        </Field>
        <Field label="Account number">
          <input className="form-input" value={profile.accountNumber} onChange={(e) => setProfileField('accountNumber', e.target.value)} />
        </Field>
        <Field label="IFSC code">
          <input className="form-input" value={profile.ifscCode} onChange={(e) => setProfileField('ifscCode', e.target.value)} />
        </Field>
        <Field label="Bank name">
          <input className="form-input" value={profile.bankName} onChange={(e) => setProfileField('bankName', e.target.value)} />
        </Field>
        <Field label="Branch name">
          <input className="form-input" value={profile.bankBranchName} onChange={(e) => setProfileField('bankBranchName', e.target.value)} />
        </Field>
        <Field label="Beneficiary code">
          <input className="form-input" value={profile.beneficiaryCode} onChange={(e) => setProfileField('beneficiaryCode', e.target.value)} />
        </Field>
        <Field label="CRN number">
          <input className="form-input" value={profile.crnNumber} onChange={(e) => setProfileField('crnNumber', e.target.value)} />
        </Field>
      </Section>

      <Section title="Contact details">
        <Field label="Work phone">
          <input className="form-input" value={profile.workPhone} onChange={(e) => setProfileField('workPhone', e.target.value)} />
        </Field>
        <Field label="Personal mobile" required>
          <input className="form-input" value={profile.personalMobile} onChange={(e) => setProfileField('personalMobile', e.target.value)} />
        </Field>
        <Field label="Emergency contact" required>
          <input className="form-input" value={profile.emergencyContact} onChange={(e) => setProfileField('emergencyContact', e.target.value)} />
        </Field>
        <Field label="Personal email">
          <input type="email" className="form-input" value={profile.personalEmail} onChange={(e) => setProfileField('personalEmail', e.target.value)} />
        </Field>
        <Field label="Permanent address" required className="sm:col-span-2">
          <textarea className="form-input min-h-[80px]" value={profile.permanentAddress} onChange={(e) => setProfileField('permanentAddress', e.target.value)} />
        </Field>
        <Field label="Local residential address" className="sm:col-span-2 lg:col-span-1">
          <textarea className="form-input min-h-[80px]" value={profile.localAddress} onChange={(e) => setProfileField('localAddress', e.target.value)} />
        </Field>
      </Section>

      <CustomFieldEditor defs={customFieldDefs} custom={profile.custom} onChange={(next) => setProfile((p) => ({ ...p, custom: next }))} />

      <div className="rounded-2xl border border-neutral-200/90 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
          <h3 className="text-sm font-bold uppercase tracking-wide text-primary">Work experience</h3>
          <button type="button" className="btn-secondary text-xs" onClick={addWorkRow}>
            + Add
          </button>
        </div>
        <div className="mt-4 space-y-4">
          {!profile.workExperience.length && <p className="text-sm text-slate-500">No rows yet.</p>}
          {profile.workExperience.map((row, i) => (
            <div key={`we-${i}`} className="grid gap-3 rounded-xl border border-neutral-100 p-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Company">
                <input className="form-input" value={row.company} onChange={(e) => updateWorkRow(i, 'company', e.target.value)} />
              </Field>
              <Field label="Role / title">
                <input className="form-input" value={row.role} onChange={(e) => updateWorkRow(i, 'role', e.target.value)} />
              </Field>
              <Field label="From">
                <input type="month" className="form-input" value={row.from} onChange={(e) => updateWorkRow(i, 'from', e.target.value)} />
              </Field>
              <Field label="To">
                <input type="month" className="form-input" value={row.to} onChange={(e) => updateWorkRow(i, 'to', e.target.value)} />
              </Field>
              <Field label="Summary" className="sm:col-span-2 lg:col-span-4">
                <textarea className="form-input min-h-[64px]" value={row.summary} onChange={(e) => updateWorkRow(i, 'summary', e.target.value)} />
              </Field>
              <div className="sm:col-span-2 lg:col-span-4 flex justify-end">
                <button type="button" className="text-xs font-semibold text-rose-600 hover:underline" onClick={() => removeWorkRow(i)}>
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-200/90 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
          <h3 className="text-sm font-bold uppercase tracking-wide text-primary">Education details</h3>
          <button type="button" className="btn-secondary text-xs" onClick={addEduRow}>
            + Add row
          </button>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-slate-500">
                <th className="py-2 pr-2">#</th>
                <th className="py-2 pr-2">Institute</th>
                <th className="py-2 pr-2">Specialization</th>
                <th className="py-2 pr-2">Degree</th>
                <th className="py-2 pr-2">Completion</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {profile.education.map((row, i) => (
                <tr key={`ed-${i}`} className="border-b border-neutral-100">
                  <td className="py-2 pr-2">{i + 1}</td>
                  <td className="py-2 pr-2">
                    <input className="form-input" value={row.instituteName} onChange={(e) => updateEduRow(i, 'instituteName', e.target.value)} />
                  </td>
                  <td className="py-2 pr-2">
                    <input className="form-input" value={row.specialization} onChange={(e) => updateEduRow(i, 'specialization', e.target.value)} />
                  </td>
                  <td className="py-2 pr-2">
                    <input className="form-input" value={row.degree} onChange={(e) => updateEduRow(i, 'degree', e.target.value)} />
                  </td>
                  <td className="py-2 pr-2">
                    <input type="date" className="form-input" value={row.dateOfCompletion} onChange={(e) => updateEduRow(i, 'dateOfCompletion', e.target.value)} />
                  </td>
                  <td className="py-2">
                    <button type="button" className="text-xs font-semibold text-rose-600" onClick={() => removeEduRow(i)}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!profile.education.length && <p className="mt-3 text-sm text-slate-500">No education rows yet.</p>}
        </div>
      </div>

      <div className="flex flex-wrap justify-end gap-2 border-t border-neutral-200 pt-4">
        <button type="button" className="btn-secondary" onClick={() => navigate(isCreate ? '/dashboard/users' : `/dashboard/users/${editUserId}`)}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'Saving…' : isCreate ? 'Create employee' : 'Save'}
        </button>
      </div>
    </form>
  );
}
