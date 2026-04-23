import clsx from 'clsx';
import { useCallback, useEffect, useState } from 'react';
import apiClient from '../../api/client';

/** Paysharp sandbox API host ([sandbox environment](https://sandbox.paysharp.co.in)). */
const PAYSHARP_SANDBOX_DEFAULT_BASE = 'https://sandbox.paysharp.co.in';

function paysharpBaseLooksLikeBareEmail(s) {
  const t = String(s || '').trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t) && !t.includes('://');
}

function paysharpBaseIsValidHttpUrl(s) {
  const t = String(s || '').trim();
  if (!t || !/^https?:\/\//i.test(t)) return false;
  try {
    const u = new URL(t);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** When sandbox is on, blank / email / invalid → default sandbox URL. Live: strip email-like or invalid values to empty. */
function normalizePaysharpApiBaseForForm(apiBaseUrl, useSandbox) {
  const raw = String(apiBaseUrl || '').trim();
  if (useSandbox) {
    if (!raw || paysharpBaseLooksLikeBareEmail(raw) || !paysharpBaseIsValidHttpUrl(raw)) {
      return PAYSHARP_SANDBOX_DEFAULT_BASE;
    }
    return raw.replace(/\/+$/, '');
  }
  if (paysharpBaseLooksLikeBareEmail(raw) || (raw && !paysharpBaseIsValidHttpUrl(raw))) return '';
  return raw.replace(/\/+$/, '');
}

const tabs = [
  { id: 'email', label: 'Email', icon: 'mail' },
  { id: 'paysharp', label: 'Paysharp', icon: 'wallet' },
  { id: 'paypal', label: 'PayPal', icon: 'card' },
  { id: 'razorpay', label: 'Razorpay', icon: 'rz' },
];

function IconMail({ className = 'h-5 w-5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}

function IconWallet({ className = 'h-5 w-5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden>
      <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5" />
      <path d="M16 12h.01" />
    </svg>
  );
}

function IconCard({ className = 'h-5 w-5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
    </svg>
  );
}

function IconEye({ className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconEyeOff({ className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden>
      <path d="M10.7 10.7a3 3 0 0 0 4.6 4.6l-4.6-4.6Z" />
      <path d="M6.34 6.34 4 4" />
      <path d="m2 12 2.09 2.09M20 12l-2.09 2.09M20 20 4 4" />
      <path d="M12 5c-4.67 0-8.27 3.11-9 7 0 .16.03.31.05.47M17.94 17.94A10.07 10.07 0 0 0 21 12c-.7-3.9-4.3-7-9-7-1.06 0-2.07.19-3 .5" />
    </svg>
  );
}

function IconRz({ className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden>
      <path d="M7 7h10v10H7z" />
      <path d="M4 4h6M14 20h6" />
    </svg>
  );
}

function TabIcon({ name }) {
  switch (name) {
    case 'mail':
      return <IconMail className="h-4 w-4" />;
    case 'wallet':
      return <IconWallet className="h-4 w-4" />;
    case 'card':
      return <IconCard className="h-4 w-4" />;
    case 'rz':
      return <IconRz className="h-4 w-4" />;
    default:
      return null;
  }
}

function Toggle({ checked, onChange, id, label }) {
  return (
    <div className="flex items-center gap-3">
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={clsx(
          'relative h-7 w-12 shrink-0 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
          checked ? 'bg-primary' : 'bg-neutral-300',
        )}
      >
        <span
          className={clsx(
            'absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-6' : 'translate-x-1',
          )}
        />
      </button>
      {label ? (
        <span
          className="cursor-pointer select-none text-sm font-medium text-dark"
          onClick={() => onChange(!checked)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onChange(!checked);
            }
          }}
          role="button"
          tabIndex={0}
        >
          {label}
        </span>
      ) : null}
    </div>
  );
}

export default function SuperAdminIntegrationsPage() {
  const [tab, setTab] = useState('email');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [showSmtpPassword, setShowSmtpPassword] = useState(false);
  const [showPaySharpKey, setShowPaySharpKey] = useState(false);
  const [showPaySharpWh, setShowPaySharpWh] = useState(false);
  const [showPaypalSecret, setShowPaypalSecret] = useState(false);
  const [showRzKey, setShowRzKey] = useState(false);
  const [showRzWh, setShowRzWh] = useState(false);

  const [email, setEmail] = useState({
    smtpHost: '',
    smtpPort: 587,
    useTls: true,
    smtpUser: '',
    smtpPassword: '',
    fromEmail: '',
    fromName: '',
    smtpPasswordSet: false,
  });
  const [paysharp, setPaysharp] = useState({
    enabled: false,
    merchantId: '',
    apiKey: '',
    webhookSecret: '',
    apiKeySet: false,
    apiTokenFromEnv: false,
    webhookSecretSet: false,
    apiBaseUrl: '',
    useSandbox: false,
  });
  const [paypal, setPaypal] = useState({
    enabled: false,
    clientId: '',
    clientSecret: '',
    mode: 'sandbox',
    clientSecretSet: false,
  });
  const [razorpay, setRazorpay] = useState({
    enabled: false,
    keyId: '',
    keySecret: '',
    webhookSecret: '',
    keySecretSet: false,
    webhookSecretSet: false,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await apiClient.get('/super/integrations');
      const it = data.item || {};
      if (it.email) {
        setEmail({
          smtpHost: it.email.smtpHost || '',
          smtpPort: it.email.smtpPort ?? 587,
          useTls: it.email.useTls !== false,
          smtpUser: it.email.smtpUser || '',
          smtpPassword: '',
          fromEmail: it.email.fromEmail || '',
          fromName: it.email.fromName || '',
          smtpPasswordSet: Boolean(it.email.smtpPasswordSet),
        });
      }
      if (it.paysharp) {
        const useSandbox = it.paysharp.useSandbox === true;
        setPaysharp({
          enabled: Boolean(it.paysharp.enabled),
          merchantId: it.paysharp.merchantId || '',
          apiKey: '',
          webhookSecret: '',
          apiKeySet: Boolean(it.paysharp.apiKeySet),
          apiTokenFromEnv: Boolean(it.paysharp.apiTokenFromEnv),
          webhookSecretSet: Boolean(it.paysharp.webhookSecretSet),
          apiBaseUrl: normalizePaysharpApiBaseForForm(it.paysharp.apiBaseUrl || '', useSandbox),
          useSandbox,
        });
      }
      if (it.paypal) {
        setPaypal({
          enabled: Boolean(it.paypal.enabled),
          clientId: it.paypal.clientId || '',
          clientSecret: '',
          mode: it.paypal.mode === 'live' ? 'live' : 'sandbox',
          clientSecretSet: Boolean(it.paypal.clientSecretSet),
        });
      }
      if (it.razorpay) {
        setRazorpay({
          enabled: Boolean(it.razorpay.enabled),
          keyId: it.razorpay.keyId || '',
          keySecret: '',
          webhookSecret: '',
          keySecretSet: Boolean(it.razorpay.keySecretSet),
          webhookSecretSet: Boolean(it.razorpay.webhookSecretSet),
        });
      }
    } catch (e) {
      setError(e.response?.data?.message || 'Could not load integrations.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const flashOk = () => {
    setOk('Saved.');
    window.setTimeout(() => setOk(''), 2500);
  };

  const saveEmail = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await apiClient.patch('/super/integrations', {
        email: {
          smtpHost: email.smtpHost,
          smtpPort: Number(email.smtpPort) || 587,
          useTls: email.useTls,
          smtpUser: email.smtpUser,
          fromEmail: email.fromEmail,
          fromName: email.fromName,
          ...(String(email.smtpPassword || '').trim() ? { smtpPassword: email.smtpPassword.trim() } : {}),
        },
      });
      await load();
      setEmail((prev) => ({ ...prev, smtpPassword: '' }));
      flashOk();
    } catch (err) {
      setError(err.response?.data?.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const savePaysharp = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const apiBaseUrl = normalizePaysharpApiBaseForForm(paysharp.apiBaseUrl, paysharp.useSandbox);
      const body = {
        paysharp: {
          enabled: paysharp.enabled,
          merchantId: paysharp.merchantId,
          apiBaseUrl,
          useSandbox: paysharp.useSandbox,
          ...(String(paysharp.apiKey || '').trim() ? { apiKey: paysharp.apiKey.trim() } : {}),
          ...(String(paysharp.webhookSecret || '').trim() ? { webhookSecret: paysharp.webhookSecret.trim() } : {}),
        },
      };
      await apiClient.patch('/super/integrations', body);
      await load();
      setPaysharp((p) => ({ ...p, apiKey: '', webhookSecret: '' }));
      flashOk();
    } catch (err) {
      setError(err.response?.data?.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const savePaypal = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await apiClient.patch('/super/integrations', {
        paypal: {
          enabled: paypal.enabled,
          clientId: paypal.clientId,
          mode: paypal.mode,
          ...(String(paypal.clientSecret || '').trim() ? { clientSecret: paypal.clientSecret.trim() } : {}),
        },
      });
      await load();
      setPaypal((p) => ({ ...p, clientSecret: '' }));
      flashOk();
    } catch (err) {
      setError(err.response?.data?.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const saveRazorpay = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await apiClient.patch('/super/integrations', {
        razorpay: {
          enabled: razorpay.enabled,
          keyId: razorpay.keyId,
          ...(String(razorpay.keySecret || '').trim() ? { keySecret: razorpay.keySecret.trim() } : {}),
          ...(String(razorpay.webhookSecret || '').trim() ? { webhookSecret: razorpay.webhookSecret.trim() } : {}),
        },
      });
      await load();
      setRazorpay((r) => ({ ...r, keySecret: '', webhookSecret: '' }));
      flashOk();
    } catch (err) {
      setError(err.response?.data?.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="mt-1 text-sm text-slate-600">Configure email delivery and payment gateway credentials for the platform.</p>
      </div>

      {error ? <p className="alert-error text-sm">{error}</p> : null}
      {ok ? <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900">{ok}</p> : null}

      <div className="inline-flex flex-wrap gap-1 rounded-full border border-neutral-200 bg-white p-0.5 shadow-sm">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={clsx(
              'inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition',
              tab === t.id ? 'bg-primary text-dark shadow-sm' : 'text-slate-600 hover:bg-neutral-50',
            )}
          >
            <TabIcon name={t.icon} />
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-slate-600">Loading…</p>
      ) : tab === 'email' ? (
        <div className="flux-card border border-neutral-200/90 p-5 shadow-panel sm:p-6">
          <div className="mb-6 flex gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <IconMail />
            </div>
            <div>
              <h3 className="text-lg font-bold text-dark">Email integration</h3>
              <p className="text-sm text-slate-600">SMTP settings for transactional email (notifications, invites, etc.).</p>
            </div>
          </div>
          <form className="form-stack !space-y-4" onSubmit={saveEmail}>
            <div className="form-field">
              <label className="form-label" htmlFor="int-smtp-host">
                SMTP host <span className="text-red-600">*</span>
              </label>
              <input
                id="int-smtp-host"
                className="form-input"
                placeholder="e.g. smtp.gmail.com"
                value={email.smtpHost}
                onChange={(ev) => setEmail({ ...email, smtpHost: ev.target.value })}
                required
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2 sm:items-end">
              <div className="form-field">
                <label className="form-label" htmlFor="int-smtp-port">
                  Port <span className="text-red-600">*</span>
                </label>
                <input
                  id="int-smtp-port"
                  type="number"
                  min={1}
                  className="form-input"
                  value={email.smtpPort}
                  onChange={(ev) => setEmail({ ...email, smtpPort: ev.target.value })}
                  required
                />
              </div>
              <div className="form-field pb-1">
                <span className="form-label">Security</span>
                <Toggle id="int-use-tls" checked={email.useTls} onChange={(v) => setEmail({ ...email, useTls: v })} label="Use TLS" />
              </div>
            </div>
            <div className="form-field">
              <label className="form-label" htmlFor="int-smtp-user">
                Username <span className="text-red-600">*</span>
              </label>
              <input
                id="int-smtp-user"
                className="form-input"
                placeholder="your-email@example.com"
                value={email.smtpUser}
                onChange={(ev) => setEmail({ ...email, smtpUser: ev.target.value })}
                required
              />
            </div>
            <div className="form-field">
              <label className="form-label" htmlFor="int-smtp-pass">
                Password {!email.smtpPasswordSet ? <span className="text-red-600">*</span> : null}
              </label>
              <div className="relative">
                <input
                  id="int-smtp-pass"
                  type={showSmtpPassword ? 'text' : 'password'}
                  className="form-input pr-11"
                  placeholder={email.smtpPasswordSet ? 'Leave blank to keep current password' : 'SMTP password'}
                  value={email.smtpPassword}
                  onChange={(ev) => setEmail({ ...email, smtpPassword: ev.target.value })}
                  autoComplete="new-password"
                  required={!email.smtpPasswordSet}
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-500 hover:bg-neutral-100 hover:text-dark"
                  onClick={() => setShowSmtpPassword((s) => !s)}
                  aria-label={showSmtpPassword ? 'Hide password' : 'Show password'}
                >
                  {showSmtpPassword ? <IconEyeOff /> : <IconEye />}
                </button>
              </div>
            </div>
            <div className="form-field">
              <label className="form-label" htmlFor="int-from-email">
                From email <span className="text-red-600">*</span>
              </label>
              <input
                id="int-from-email"
                type="email"
                className="form-input"
                value={email.fromEmail}
                onChange={(ev) => setEmail({ ...email, fromEmail: ev.target.value })}
                required
              />
            </div>
            <div className="form-field">
              <label className="form-label" htmlFor="int-from-name">
                From name
              </label>
              <input
                id="int-from-name"
                className="form-input"
                placeholder="LiveTrack"
                value={email.fromName}
                onChange={(ev) => setEmail({ ...email, fromName: ev.target.value })}
              />
            </div>
            <div className="pt-2">
              <button type="submit" disabled={saving} className="btn-primary disabled:opacity-50">
                {saving ? 'Saving…' : 'Save email settings'}
              </button>
            </div>
          </form>
        </div>
      ) : tab === 'paysharp' ? (
        <div className="flux-card border border-neutral-200/90 p-5 shadow-panel sm:p-6">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div className="flex gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <IconWallet />
              </div>
              <div>
                <h3 className="text-lg font-bold text-dark">Paysharp</h3>
                <p className="text-sm text-slate-600">
                  Uses Paysharp Link Payment (sandbox: <code className="text-xs">POST …/api/v1/upi/linkpayment</code>; live API host:{' '}
                  <code className="text-xs">…/v1/upi/linkpayment</code>). With sandbox on, the default origin is{' '}
                  <code className="text-xs">https://sandbox.paysharp.co.in</code>. For live, set the API origin from your dashboard (or{' '}
                  <code className="text-xs">PAYSHARP_API_BASE_URL</code>).
                </p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-3 sm:flex-row sm:items-center">
              <Toggle checked={paysharp.enabled} onChange={(v) => setPaysharp({ ...paysharp, enabled: v })} label="Enabled" />
              <Toggle
                checked={paysharp.useSandbox}
                onChange={(v) =>
                  setPaysharp((prev) => ({
                    ...prev,
                    useSandbox: v,
                    apiBaseUrl: v ? normalizePaysharpApiBaseForForm(prev.apiBaseUrl, true) : prev.apiBaseUrl,
                  }))
                }
                label="Use sandbox (testing)"
              />
            </div>
          </div>
          <form className="form-stack !space-y-4" onSubmit={savePaysharp}>
            {paysharp.apiTokenFromEnv ? (
              <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
                API Bearer token is set on the server via <code className="text-xs">PAYSHARP_API_TOKEN</code> or{' '}
                <code className="text-xs">PAYSHARP_BEARER_TOKEN</code> (not shown here). That value is used for checkout; the field below is
                optional if you only use env.
              </p>
            ) : null}
            <div className="form-field">
              <label className="form-label" htmlFor="int-ps-merchant">
                Merchant ID
              </label>
              <input
                id="int-ps-merchant"
                className="form-input"
                value={paysharp.merchantId}
                onChange={(ev) => setPaysharp({ ...paysharp, merchantId: ev.target.value })}
              />
            </div>
            <div className="form-field">
              <label className="form-label" htmlFor="int-ps-base">
                API base URL{paysharp.useSandbox ? ' (sandbox)' : ' (live)'}
              </label>
              <input
                id="int-ps-base"
                className="form-input"
                placeholder={paysharp.useSandbox ? PAYSHARP_SANDBOX_DEFAULT_BASE : 'https://… (from Paysharp dashboard)'}
                value={paysharp.apiBaseUrl}
                onChange={(ev) => setPaysharp({ ...paysharp, apiBaseUrl: ev.target.value })}
                autoComplete="off"
              />
              <p className="mt-1 text-xs text-slate-500">
                {paysharp.useSandbox ? (
                  <>
                    With sandbox enabled, this defaults to{' '}
                    <code className="text-xs">{PAYSHARP_SANDBOX_DEFAULT_BASE}</code> if left blank or if a mistaken email was stored. Origin
                    only — we POST <code className="text-xs">/api/v1/upi/linkpayment</code> on this host.
                  </>
                ) : (
                  <>
                    API origin (e.g. <code className="text-xs">https://api.paysharp.in</code>). We POST{' '}
                    <code className="text-xs">/v1/upi/linkpayment</code>. Must start with <code className="text-xs">https://</code> — not an
                    email.
                  </>
                )}
              </p>
            </div>
            <div className="form-field">
              <label className="form-label" htmlFor="int-ps-key">
                API token (Bearer)
              </label>
              <p className="mb-1 text-xs text-slate-500">
                From Paysharp dashboard (Settings → Configuration). Sent as <code className="text-[11px]">Authorization: Bearer …</code>{' '}
                when creating payment links. This is not the webhook secret.
              </p>
              <div className="relative">
                <input
                  id="int-ps-key"
                  type={showPaySharpKey ? 'text' : 'password'}
                  className="form-input pr-11"
                  placeholder={paysharp.apiKeySet ? 'Leave blank to keep current token' : 'Paste API token'}
                  value={paysharp.apiKey}
                  onChange={(ev) => setPaysharp({ ...paysharp, apiKey: ev.target.value })}
                  autoComplete="off"
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-500 hover:bg-neutral-100 hover:text-dark"
                  onClick={() => setShowPaySharpKey((s) => !s)}
                  aria-label={showPaySharpKey ? 'Hide' : 'Show'}
                >
                  {showPaySharpKey ? <IconEyeOff /> : <IconEye />}
                </button>
              </div>
            </div>
            <div className="form-field">
              <label className="form-label" htmlFor="int-ps-wh">
                Webhook secret (optional)
              </label>
              <p className="mb-1 text-xs text-slate-500">
                For verifying inbound Paysharp webhooks only — never used as the Bearer token for Link Payment API.
              </p>
              <div className="relative">
                <input
                  id="int-ps-wh"
                  type={showPaySharpWh ? 'text' : 'password'}
                  className="form-input pr-11"
                  placeholder={paysharp.webhookSecretSet ? 'Leave blank to keep current secret' : 'Optional webhook signing secret'}
                  value={paysharp.webhookSecret}
                  onChange={(ev) => setPaysharp({ ...paysharp, webhookSecret: ev.target.value })}
                  autoComplete="off"
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-500 hover:bg-neutral-100 hover:text-dark"
                  onClick={() => setShowPaySharpWh((s) => !s)}
                  aria-label={showPaySharpWh ? 'Hide' : 'Show'}
                >
                  {showPaySharpWh ? <IconEyeOff /> : <IconEye />}
                </button>
              </div>
            </div>
            <div className="pt-2">
              <button type="submit" disabled={saving} className="btn-primary disabled:opacity-50">
                {saving ? 'Saving…' : 'Save Paysharp settings'}
              </button>
            </div>
          </form>
        </div>
      ) : tab === 'paypal' ? (
        <div className="flux-card border border-neutral-200/90 p-5 shadow-panel sm:p-6">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div className="flex gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <IconCard />
              </div>
              <div>
                <h3 className="text-lg font-bold text-dark">PayPal</h3>
                <p className="text-sm text-slate-600">REST credentials for PayPal checkout or subscriptions.</p>
              </div>
            </div>
            <Toggle checked={paypal.enabled} onChange={(v) => setPaypal({ ...paypal, enabled: v })} label="Enabled" />
          </div>
          <form className="form-stack !space-y-4" onSubmit={savePaypal}>
            <div className="form-field">
              <label className="form-label" htmlFor="int-pp-mode">
                Environment
              </label>
              <select
                id="int-pp-mode"
                className="form-select"
                value={paypal.mode}
                onChange={(ev) => setPaypal({ ...paypal, mode: ev.target.value })}
              >
                <option value="sandbox">Sandbox</option>
                <option value="live">Live</option>
              </select>
            </div>
            <div className="form-field">
              <label className="form-label" htmlFor="int-pp-client">
                Client ID
              </label>
              <input
                id="int-pp-client"
                className="form-input"
                value={paypal.clientId}
                onChange={(ev) => setPaypal({ ...paypal, clientId: ev.target.value })}
                autoComplete="off"
              />
            </div>
            <div className="form-field">
              <label className="form-label" htmlFor="int-pp-secret">
                Client secret
              </label>
              <div className="relative">
                <input
                  id="int-pp-secret"
                  type={showPaypalSecret ? 'text' : 'password'}
                  className="form-input pr-11"
                  placeholder={paypal.clientSecretSet ? 'Leave blank to keep current secret' : 'Client secret'}
                  value={paypal.clientSecret}
                  onChange={(ev) => setPaypal({ ...paypal, clientSecret: ev.target.value })}
                  autoComplete="off"
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-500 hover:bg-neutral-100 hover:text-dark"
                  onClick={() => setShowPaypalSecret((s) => !s)}
                  aria-label={showPaypalSecret ? 'Hide' : 'Show'}
                >
                  {showPaypalSecret ? <IconEyeOff /> : <IconEye />}
                </button>
              </div>
            </div>
            <div className="pt-2">
              <button type="submit" disabled={saving} className="btn-primary disabled:opacity-50">
                {saving ? 'Saving…' : 'Save PayPal settings'}
              </button>
            </div>
          </form>
        </div>
      ) : tab === 'razorpay' ? (
        <div className="flux-card border border-neutral-200/90 p-5 shadow-panel sm:p-6">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div className="flex gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <IconRz />
              </div>
              <div>
                <h3 className="text-lg font-bold text-dark">Razorpay</h3>
                <p className="text-sm text-slate-600">
                  Key ID and secrets are stored encrypted (AES-256-GCM). Register webhook{' '}
                  <code className="rounded bg-neutral-100 px-1 text-xs">POST /api/subscription/webhook/razorpay</code> on your public API
                  host (same base URL as this backend).
                </p>
              </div>
            </div>
            <Toggle checked={razorpay.enabled} onChange={(v) => setRazorpay({ ...razorpay, enabled: v })} label="Enabled" />
          </div>
          <form className="form-stack !space-y-4" onSubmit={saveRazorpay}>
            <div className="form-field">
              <label className="form-label" htmlFor="int-rz-keyid">
                Key ID
              </label>
              <input
                id="int-rz-keyid"
                className="form-input"
                placeholder="rzp_test_…"
                value={razorpay.keyId}
                onChange={(ev) => setRazorpay({ ...razorpay, keyId: ev.target.value })}
                autoComplete="off"
              />
            </div>
            <div className="form-field">
              <label className="form-label" htmlFor="int-rz-secret">
                Key secret
              </label>
              <div className="relative">
                <input
                  id="int-rz-secret"
                  type={showRzKey ? 'text' : 'password'}
                  className="form-input pr-11"
                  placeholder={razorpay.keySecretSet ? 'Leave blank to keep current secret' : 'Key secret'}
                  value={razorpay.keySecret}
                  onChange={(ev) => setRazorpay({ ...razorpay, keySecret: ev.target.value })}
                  autoComplete="off"
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-500 hover:bg-neutral-100 hover:text-dark"
                  onClick={() => setShowRzKey((s) => !s)}
                  aria-label={showRzKey ? 'Hide' : 'Show'}
                >
                  {showRzKey ? <IconEyeOff /> : <IconEye />}
                </button>
              </div>
            </div>
            <div className="form-field">
              <label className="form-label" htmlFor="int-rz-wh">
                Webhook secret
              </label>
              <div className="relative">
                <input
                  id="int-rz-wh"
                  type={showRzWh ? 'text' : 'password'}
                  className="form-input pr-11"
                  placeholder={razorpay.webhookSecretSet ? 'Leave blank to keep current' : 'Webhook signing secret'}
                  value={razorpay.webhookSecret}
                  onChange={(ev) => setRazorpay({ ...razorpay, webhookSecret: ev.target.value })}
                  autoComplete="off"
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-500 hover:bg-neutral-100 hover:text-dark"
                  onClick={() => setShowRzWh((s) => !s)}
                  aria-label={showRzWh ? 'Hide' : 'Show'}
                >
                  {showRzWh ? <IconEyeOff /> : <IconEye />}
                </button>
              </div>
            </div>
            <div className="pt-2">
              <button type="submit" disabled={saving} className="btn-primary disabled:opacity-50">
                {saving ? 'Saving…' : 'Save Razorpay settings'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
