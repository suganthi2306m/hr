import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../api/client';
import { useAuth } from '../context/AuthContext';

const initialState = {
  name: '',
  address: '',
  phone: '',
  email: '',
};

function CompanySetupPage() {
  const [form, setForm] = useState(initialState);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const { admin, refetchProfile } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    async function loadCompany() {
      try {
        const { data } = await apiClient.get('/company');
        if (data.company) {
          setForm({
            name: data.company.name || '',
            address: data.company.address || '',
            phone: data.company.phone || '',
            email: data.company.email || '',
          });
        }
      } catch {
        // Keep form empty for first setup.
      }
    }
    loadCompany();
  }, []);

  useEffect(() => {
    if (admin?.companySetupCompleted) {
      navigate('/dashboard');
    }
  }, [admin, navigate]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await apiClient.post('/company', form);
      await refetchProfile();
      navigate('/dashboard');
    } catch (apiError) {
      setError(apiError.response?.data?.message || 'Unable to save company details.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-200 px-4 py-10">
      <div className="form-card w-full max-w-xl">
        <h2 className="text-2xl font-bold tracking-tight text-dark">Complete company profile</h2>
        <p className="mt-1 text-sm text-slate-500">You only see this once—add details your team will recognize.</p>
        <form className="form-stack mt-8" onSubmit={handleSubmit}>
          {[
            { key: 'name', label: 'Company name', autoComplete: 'organization' },
            { key: 'address', label: 'Address', autoComplete: 'street-address' },
            { key: 'phone', label: 'Phone', autoComplete: 'tel' },
            { key: 'email', label: 'Email', type: 'email', autoComplete: 'email' },
          ].map((field) => (
            <div key={field.key} className="form-field">
              <label htmlFor={`setup-${field.key}`} className="form-label-muted">
                {field.label}
              </label>
              <input
                id={`setup-${field.key}`}
                type={field.type || 'text'}
                name={field.key}
                autoComplete={field.autoComplete}
                value={form[field.key]}
                onChange={(e) => setForm((old) => ({ ...old, [field.key]: e.target.value }))}
                className="form-input"
                required
              />
            </div>
          ))}
          {error && <p className="alert-error">{error}</p>}
          <button type="submit" disabled={saving} className="btn-primary w-full py-3 disabled:cursor-not-allowed">
            {saving ? 'Saving...' : 'Save and continue'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default CompanySetupPage;
