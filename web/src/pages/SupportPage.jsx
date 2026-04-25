import { useCallback, useEffect, useState } from 'react';
import apiClient, { getApiErrorMessage } from '../api/client';
import PartnerSupportDetails from '../components/partner/PartnerSupportDetails';

export default function SupportPage() {
  const [partner, setPartner] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setPartner(null);
    try {
      const { data } = await apiClient.get('/company/provisioning-partner');
      setPartner(data?.partner || null);
    } catch (e) {
      setPartner(null);
      setError(getApiErrorMessage(e, 'Could not load partner contact.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <p className="text-sm leading-relaxed text-slate-600">
        Your organization is managed by a LiveTrack platform partner. Use the details below for catalogs, subscriptions,
        and technical support.
      </p>
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-6">
        <PartnerSupportDetails partner={partner} loading={loading} error={error} />
      </div>
    </div>
  );
}
