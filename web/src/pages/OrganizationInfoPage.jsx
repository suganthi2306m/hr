import { useCallback, useEffect, useState } from 'react';
import apiClient from '../api/client';
import CompanyBranchesPanel from '../components/settings/CompanyBranchesPanel';
import CompanySubscriptionProfileCard from '../components/settings/CompanySubscriptionProfileCard';
import LocationLoadingIndicator from '../components/common/LocationLoadingIndicator';
import { pickLatestCapturedPayment } from '../utils/subscriptionRenewalFromPayment';

const EMPTY_COMPANY_FORM = { name: '', address: '', phone: '', email: '' };

function OrganizationInfoPage() {
  const [companyForm, setCompanyForm] = useState(EMPTY_COMPANY_FORM);
  const [company, setCompany] = useState(null);
  const [staffCount, setStaffCount] = useState(0);
  const [latestRenewalPayment, setLatestRenewalPayment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [companyRes, usersRes, paymentsRes] = await Promise.allSettled([
        apiClient.get('/company'),
        apiClient.get('/users'),
        apiClient.get('/company/subscription/payments'),
      ]);

      if (companyRes.status !== 'fulfilled') {
        throw companyRes.reason;
      }
      const c = companyRes.value.data.company || {};
      setCompany(c);
      setCompanyForm({
        name: c.name || '',
        address: c.address || '',
        phone: c.phone || '',
        email: c.email || '',
      });

      if (usersRes.status === 'fulfilled') {
        setStaffCount(Array.isArray(usersRes.value.data?.items) ? usersRes.value.data.items.length : 0);
      } else {
        setStaffCount(0);
      }

      if (paymentsRes.status === 'fulfilled') {
        const items = Array.isArray(paymentsRes.value.data?.items) ? paymentsRes.value.data.items : [];
        setLatestRenewalPayment(pickLatestCapturedPayment(items));
      } else {
        setLatestRenewalPayment(null);
      }
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Unable to load company details.');
      setCompany(null);
      setStaffCount(0);
      setLatestRenewalPayment(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveCompany = async () => {
    setSaving(true);
    setMessage('');
    setError('');
    try {
      await apiClient.put('/company', {
        name: companyForm.name,
        address: companyForm.address,
        phone: companyForm.phone,
        email: companyForm.email,
      });
      setMessage('Organization info saved.');
      await load();
    } catch (e) {
      setError(e.response?.data?.message || 'Unable to save company details.');
    } finally {
      setSaving(false);
    }
  };

  const branchCount = Array.isArray(company?.branches) ? company.branches.length : 0;

  return (
    <section className="min-w-0 max-w-full space-y-6">
      {loading ? (
        <div className="flex min-h-[18rem] items-center justify-center">
          <LocationLoadingIndicator label="Loading organization info..." />
        </div>
      ) : (
        <>
          {error ? <p className="alert-error">{error}</p> : null}
          {message ? <p className="alert-success">{message}</p> : null}
          {company ? (
            <>
              <CompanySubscriptionProfileCard
                variant="light"
                companyName={company.name}
                subscription={company.subscription}
                staffCount={staffCount}
                branchCount={branchCount}
                latestRenewalPayment={latestRenewalPayment}
                renewalFromPaymentsOnly
              />

              <div className="flux-card min-w-0 overflow-hidden p-4 shadow-panel-lg sm:p-6">
                <CompanyBranchesPanel
                  companyForm={companyForm}
                  setCompanyForm={setCompanyForm}
                  onSaveCompany={saveCompany}
                  saving={saving}
                />
              </div>
            </>
          ) : null}
        </>
      )}
    </section>
  );
}

export default OrganizationInfoPage;
