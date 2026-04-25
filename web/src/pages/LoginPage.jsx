import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { postPublicAuth } from '../api/client';
import { LiveTrackWordmark } from '../components/brand/LiveTrackWordmark';
import logoImg from '../assets/logo.png';
import homeBg from '../assets/homebg.png';

const clientReviews = [
  {
    quote: 'We see who is on site, which tasks are late, and live GPS in one place — huge for dispatch.',
    author: 'Priya N.',
    role: 'Operations Lead',
  },
  {
    quote: 'Field tasks, customer visits and attendance finally line up with what our teams actually do each day.',
    author: 'Arjun M.',
    role: 'Service Manager',
  },
  {
    quote: 'The dashboard and maps make it easier to coach teams without chasing spreadsheets.',
    author: 'Karthik R.',
    role: 'Admin',
  },
];

function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reviewIndex, setReviewIndex] = useState(0);

  const [panel, setPanel] = useState('login');
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotOtp, setForgotOtp] = useState('');
  const [forgotNew, setForgotNew] = useState('');
  const [forgotConfirm, setForgotConfirm] = useState('');
  const [forgotStep, setForgotStep] = useState(1);
  const [forgotMessage, setForgotMessage] = useState('');
  const [forgotError, setForgotError] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);

  const [signupForm, setSignupForm] = useState({
    companyName: '',
    email: '',
    phone: '',
    planId: '',
    durationMonths: 12,
    gateway: 'paysharp',
  });
  const [signupPlans, setSignupPlans] = useState([]);
  const [signupLoadingPlans, setSignupLoadingPlans] = useState(false);
  const [signupBusy, setSignupBusy] = useState(false);
  const [signupError, setSignupError] = useState('');
  const [signupPayment, setSignupPayment] = useState(null);
  const [signupPaymentState, setSignupPaymentState] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupConfirmPassword, setSignupConfirmPassword] = useState('');

  useEffect(() => {
    const timer = setInterval(() => {
      setReviewIndex((old) => (old + 1) % clientReviews.length);
    }, 2800);
    return () => clearInterval(timer);
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await login(email, password);
      if (['superadmin', 'mainsuperadmin'].includes(response.admin?.role)) {
        navigate('/super');
      } else if (response.admin?.companySetupCompleted) {
        navigate('/dashboard');
      } else {
        navigate('/company-setup');
      }
    } catch (apiError) {
      if (!apiError.response) {
        setError('Login service is temporarily unavailable. Please try again.');
      } else {
        setError(apiError.response?.data?.message || 'Unable to login right now.');
      }
    } finally {
      setLoading(false);
    }
  };

  const openForgot = () => {
    setPanel('forgot');
    setForgotEmail(email.trim());
    setForgotStep(1);
    setForgotOtp('');
    setForgotNew('');
    setForgotConfirm('');
    setForgotMessage('');
    setForgotError('');
  };

  const sendForgotOtp = async (e) => {
    e.preventDefault();
    setForgotError('');
    setForgotMessage('');
    setForgotLoading(true);
    try {
      const data = await postPublicAuth('/auth/forgot-password/request-otp', {
        email: forgotEmail.trim().toLowerCase(),
      });
      setForgotMessage(data.message || 'If an account exists for this email, a reset code was sent.');
      setForgotStep(2);
    } catch (err) {
      setForgotError(err.response?.data?.message || 'Could not send reset code. Try again.');
    } finally {
      setForgotLoading(false);
    }
  };

  const resetForgotPassword = async (e) => {
    e.preventDefault();
    setForgotError('');
    setForgotMessage('');
    if (forgotNew !== forgotConfirm) {
      setForgotError('New password and confirmation do not match.');
      return;
    }
    setForgotLoading(true);
    try {
      const data = await postPublicAuth('/auth/forgot-password/reset', {
        email: forgotEmail.trim().toLowerCase(),
        otp: forgotOtp.replace(/\s/g, ''),
        newPassword: forgotNew,
      });
      setForgotMessage(data.message || 'Password updated.');
      setForgotStep(1);
      setForgotOtp('');
      setForgotNew('');
      setForgotConfirm('');
      setPanel('login');
      setEmail(forgotEmail.trim().toLowerCase());
    } catch (err) {
      setForgotError(err.response?.data?.message || 'Reset failed. Check the code and try again.');
    } finally {
      setForgotLoading(false);
    }
  };

  const resetSignup = () => {
    setSignupError('');
    setSignupPaymentState('');
    setSignupPayment(null);
    setSignupPassword('');
    setSignupConfirmPassword('');
  };

  const openSignup = async () => {
    setPanel('signup');
    resetSignup();
    setSignupLoadingPlans(true);
    try {
      const data = await postPublicAuth('/auth/register/plans', {});
      const items = Array.isArray(data.items) ? data.items : [];
      setSignupPlans(items);
      if (items.length > 0) {
        setSignupForm((prev) => ({
          ...prev,
          planId: prev.planId || items[0]._id,
          durationMonths: Math.max(1, Number(items[0].durationMonths) || 12),
        }));
      }
    } catch (e) {
      setSignupError(e.response?.data?.message || 'Could not load plans.');
    } finally {
      setSignupLoadingPlans(false);
    }
  };

  const startSignupPayment = async (event) => {
    event.preventDefault();
    setSignupBusy(true);
    setSignupError('');
    setSignupPaymentState('');
    try {
      const data = await postPublicAuth('/auth/register/initiate-payment', signupForm);
      setSignupPayment(data);
    } catch (e) {
      setSignupError(e.response?.data?.message || 'Could not start payment.');
    } finally {
      setSignupBusy(false);
    }
  };

  const refreshSignupPayment = async () => {
    if (!signupPayment?.paymentId) return;
    setSignupBusy(true);
    setSignupError('');
    try {
      const data = await postPublicAuth(`/auth/register/payments/${encodeURIComponent(signupPayment.paymentId)}/refresh`, {
        email: signupForm.email,
      });
      const status = String(data?.item?.status || '').toLowerCase();
      if (status === 'captured' || status === 'paid') {
        setSignupPaymentState('captured');
      } else if (status === 'failed') {
        setSignupPaymentState('failed');
      } else {
        setSignupPaymentState('pending');
      }
    } catch (e) {
      setSignupError(e.response?.data?.message || 'Could not verify payment status.');
    } finally {
      setSignupBusy(false);
    }
  };

  const completeSignup = async (event) => {
    event.preventDefault();
    setSignupBusy(true);
    setSignupError('');
    try {
      await postPublicAuth('/auth/register/complete', {
        email: signupForm.email,
        paymentId: signupPayment?.paymentId,
        password: signupPassword,
        confirmPassword: signupConfirmPassword,
      });
      const response = await login(signupForm.email, signupPassword);
      if (response.admin?.companySetupCompleted) {
        navigate('/dashboard');
      } else {
        navigate('/company-setup');
      }
    } catch (e) {
      setSignupError(e.response?.data?.message || 'Could not complete account setup.');
    } finally {
      setSignupBusy(false);
    }
  };

  return (
    <div
      className="animate-fade-in min-h-screen bg-neutral-900 px-3 py-6 md:px-8 md:py-10"
      style={{
        backgroundImage: `linear-gradient(rgba(15,23,42,0.55),rgba(15,23,42,0.65)), url(${homeBg})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed',
      }}
    >
      <div className="animate-slide-up mx-auto flex min-h-[74vh] w-full max-w-5xl items-center justify-center rounded-[2rem] border border-white/10 bg-white/95 p-1.5 shadow-panel-lg backdrop-blur-sm">
        <section className="hidden h-full w-1/2 rounded-2xl bg-primary p-8 text-dark lg:block">
          <div className="mb-8">
            <img src={logoImg} alt="LiveTrack" width={48} height={48} className="h-12 w-12 rounded-xl object-contain" />
          </div>
          <h2 className="mb-4 text-4xl font-black leading-tight tracking-tight">
            Run field operations with <LiveTrackWordmark className="inline" />
          </h2>
          <p className="max-w-md text-sm text-slate-700">
            One workspace for your company: live tracking, field tasks, site visits, customers, attendance, leave and
            maps — for operations and admin teams coordinating people in the field.
          </p>

          <div className="mt-14">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">From Clients</p>
            <div className="mt-3 min-h-[144px]">
              <article
                key={reviewIndex}
                className="animate-review-swap rounded-2xl border border-black/10 bg-white/70 p-4 backdrop-blur-sm"
              >
                <p className="text-sm text-slate-800">&ldquo;{clientReviews[reviewIndex].quote}&rdquo;</p>
                <p className="mt-3 text-xs font-semibold text-dark">{clientReviews[reviewIndex].author}</p>
                <p className="text-xs text-slate-600">{clientReviews[reviewIndex].role}</p>
                <p className="mt-2 text-xs text-amber-500">{'★'.repeat(5)}</p>
              </article>
            </div>
          </div>
        </section>

        <section className="animate-fade-in w-full p-6 lg:w-1/2 lg:px-9">
          {panel === 'login' ? (
            <>
              <div className="mb-4 flex items-center gap-3">
                <img
                  src={logoImg}
                  alt=""
                  width={44}
                  height={44}
                  className="h-11 w-11 rounded-xl object-contain"
                  aria-hidden
                />
                <LiveTrackWordmark as="h3" className="text-3xl font-black text-dark" />
              </div>
              <p className="mb-2 text-3xl font-bold text-dark">Welcome back</p>
              <p className="mb-8 text-sm text-slate-500">
                Company admin sign-in only. Field staff use the mobile app — this portal does not accept field user
                accounts.
              </p>
              <form className="form-stack" onSubmit={handleSubmit}>
                <div className="form-field">
                  <label htmlFor="email" className="form-label-muted">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="form-input"
                    autoComplete="email"
                    required
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="password" className="form-label-muted">
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="form-input"
                    autoComplete="current-password"
                    required
                  />
                </div>

                {error && <p className="alert-error">{error}</p>}

                <button type="submit" disabled={loading} className="btn-primary w-full py-3 disabled:cursor-not-allowed">
                  {loading ? 'Signing in...' : 'Sign in'}
                </button>

                <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 pt-2 text-sm">
                  <button type="button" className="font-semibold text-primary hover:underline" onClick={openSignup}>
                    Create new account
                  </button>
                  <span className="hidden text-slate-300 sm:inline" aria-hidden>
                    |
                  </span>
                  <button type="button" className="font-semibold text-slate-600 hover:underline" onClick={openForgot}>
                    Forgot password?
                  </button>
                </div>
              </form>
            </>
          ) : panel === 'forgot' ? (
            <>
              <div className="mb-4 flex items-center gap-3">
                <img
                  src={logoImg}
                  alt=""
                  width={44}
                  height={44}
                  className="h-11 w-11 rounded-xl object-contain"
                  aria-hidden
                />
                <h3 className="text-3xl font-black text-dark">Reset password</h3>
              </div>
              <p className="mb-6 text-sm text-slate-500">
                We will email a one-time code to your address. Enter the code and choose a new password.
              </p>

              {forgotStep === 1 ? (
                <form className="form-stack" onSubmit={sendForgotOtp}>
                  <div className="form-field">
                    <label htmlFor="forgot-email" className="form-label-muted">
                      Account email
                    </label>
                    <input
                      id="forgot-email"
                      type="email"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      className="form-input"
                      autoComplete="email"
                      required
                    />
                  </div>
                  {forgotError && <p className="alert-error">{forgotError}</p>}
                  <button type="submit" disabled={forgotLoading} className="btn-primary w-full py-3 disabled:cursor-not-allowed">
                    {forgotLoading ? 'Sending…' : 'Send code to email'}
                  </button>
                  <button
                    type="button"
                    className="w-full text-center text-sm font-semibold text-slate-600 hover:underline"
                    onClick={() => {
                      setPanel('login');
                      setForgotError('');
                    }}
                  >
                    Back to sign in
                  </button>
                </form>
              ) : (
                <form className="form-stack" onSubmit={resetForgotPassword}>
                  {forgotMessage && <p className="rounded-lg bg-primary/10 px-3 py-2 text-sm text-dark">{forgotMessage}</p>}
                  <div className="form-field">
                    <label htmlFor="forgot-otp" className="form-label-muted">
                      Code from email
                    </label>
                    <input
                      id="forgot-otp"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      value={forgotOtp}
                      onChange={(e) => setForgotOtp(e.target.value)}
                      className="form-input"
                      placeholder="6-digit code"
                      required
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor="forgot-new" className="form-label-muted">
                      New password
                    </label>
                    <input
                      id="forgot-new"
                      type="password"
                      value={forgotNew}
                      onChange={(e) => setForgotNew(e.target.value)}
                      className="form-input"
                      autoComplete="new-password"
                      minLength={6}
                      required
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor="forgot-confirm" className="form-label-muted">
                      Confirm new password
                    </label>
                    <input
                      id="forgot-confirm"
                      type="password"
                      value={forgotConfirm}
                      onChange={(e) => setForgotConfirm(e.target.value)}
                      className="form-input"
                      autoComplete="new-password"
                      minLength={6}
                      required
                    />
                  </div>
                  {forgotError && <p className="alert-error">{forgotError}</p>}
                  <button type="submit" disabled={forgotLoading} className="btn-primary w-full py-3 disabled:cursor-not-allowed">
                    {forgotLoading ? 'Updating…' : 'Update password'}
                  </button>
                  <button
                    type="button"
                    className="w-full text-center text-sm font-semibold text-slate-600 hover:underline"
                    onClick={() => {
                      setForgotStep(1);
                      setForgotError('');
                      setForgotMessage('');
                    }}
                  >
                    Resend code (change email)
                  </button>
                  <button
                    type="button"
                    className="w-full text-center text-sm font-semibold text-slate-600 hover:underline"
                    onClick={() => {
                      setPanel('login');
                      setForgotError('');
                    }}
                  >
                    Back to sign in
                  </button>
                </form>
              )}
            </>
          ) : (
            <>
              <div className="mb-4 flex items-center gap-3">
                <img src={logoImg} alt="" width={44} height={44} className="h-11 w-11 rounded-xl object-contain" aria-hidden />
                <h3 className="text-3xl font-black text-dark">Create new account</h3>
              </div>
              <p className="mb-6 text-sm text-slate-500">
                Enter company details, select a plan, pay, then set your admin password.
              </p>
              {signupError && <p className="alert-error mb-3">{signupError}</p>}
              {!signupPayment ? (
                <form className="form-stack" onSubmit={startSignupPayment}>
                  <div className="form-field">
                    <label htmlFor="signup-company" className="form-label-muted">
                      Company name
                    </label>
                    <input
                      id="signup-company"
                      className="form-input"
                      value={signupForm.companyName}
                      onChange={(e) => setSignupForm((p) => ({ ...p, companyName: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor="signup-email" className="form-label-muted">
                      Email (this will be your admin username)
                    </label>
                    <input
                      id="signup-email"
                      type="email"
                      className="form-input"
                      value={signupForm.email}
                      onChange={(e) => setSignupForm((p) => ({ ...p, email: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor="signup-phone" className="form-label-muted">
                      Phone
                    </label>
                    <input
                      id="signup-phone"
                      className="form-input"
                      value={signupForm.phone}
                      onChange={(e) => setSignupForm((p) => ({ ...p, phone: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor="signup-plan" className="form-label-muted">
                      Select plan
                    </label>
                    <select
                      id="signup-plan"
                      className="form-select"
                      value={signupForm.planId}
                      onChange={(e) => setSignupForm((p) => ({ ...p, planId: e.target.value }))}
                      required
                      disabled={signupLoadingPlans}
                    >
                      {signupPlans.map((p) => (
                        <option key={p._id} value={p._id}>
                          {p.name} - INR {p.priceInr} / {p.durationMonths || 12} mo
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-field">
                    <label htmlFor="signup-months" className="form-label-muted">
                      Duration (months)
                    </label>
                    <input
                      id="signup-months"
                      type="number"
                      className="form-input"
                      min={1}
                      max={120}
                      value={signupForm.durationMonths}
                      onChange={(e) => setSignupForm((p) => ({ ...p, durationMonths: Number(e.target.value) || 12 }))}
                      required
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className={`btn-secondary flex-1 ${signupForm.gateway === 'paysharp' ? 'ring-2 ring-primary/40' : ''}`}
                      onClick={() => setSignupForm((p) => ({ ...p, gateway: 'paysharp' }))}
                    >
                      Paysharp
                    </button>
                    <button
                      type="button"
                      className={`btn-secondary flex-1 ${signupForm.gateway === 'razorpay' ? 'ring-2 ring-primary/40' : ''}`}
                      onClick={() => setSignupForm((p) => ({ ...p, gateway: 'razorpay' }))}
                    >
                      Razorpay
                    </button>
                  </div>
                  <button type="submit" disabled={signupBusy || signupLoadingPlans} className="btn-primary w-full py-3 disabled:cursor-not-allowed">
                    {signupBusy ? 'Starting payment...' : 'Proceed to payment'}
                  </button>
                  <button
                    type="button"
                    className="w-full text-center text-sm font-semibold text-slate-600 hover:underline"
                    onClick={() => {
                      setPanel('login');
                      resetSignup();
                    }}
                  >
                    Back to sign in
                  </button>
                </form>
              ) : signupPaymentState !== 'captured' ? (
                <div className="form-stack">
                  <p className="text-sm text-slate-600">
                    Plan: <strong>{signupPayment.planName}</strong> | Amount: INR {signupPayment.gatewayAmount || signupPayment.amount}
                  </p>
                  <a href={signupPayment.checkoutUrl} target="_blank" rel="noreferrer" className="btn-primary w-full py-3 text-center">
                    Open payment page
                  </a>
                  <button type="button" className="btn-secondary w-full" onClick={refreshSignupPayment} disabled={signupBusy}>
                    {signupBusy ? 'Checking...' : "I've paid - Check status"}
                  </button>
                  {signupPaymentState === 'pending' ? <p className="text-xs text-amber-700">Payment is still pending.</p> : null}
                  {signupPaymentState === 'failed' ? <p className="text-xs text-red-700">Payment failed. Please retry payment.</p> : null}
                </div>
              ) : (
                <form className="form-stack" onSubmit={completeSignup}>
                  <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                    Payment captured. Your admin username is <strong>{signupForm.email}</strong>.
                  </p>
                  <div className="form-field">
                    <label htmlFor="signup-password" className="form-label-muted">
                      Set password
                    </label>
                    <input
                      id="signup-password"
                      type="password"
                      className="form-input"
                      minLength={6}
                      value={signupPassword}
                      onChange={(e) => setSignupPassword(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor="signup-confirm" className="form-label-muted">
                      Re-enter password
                    </label>
                    <input
                      id="signup-confirm"
                      type="password"
                      className="form-input"
                      minLength={6}
                      value={signupConfirmPassword}
                      onChange={(e) => setSignupConfirmPassword(e.target.value)}
                      required
                    />
                  </div>
                  <button type="submit" disabled={signupBusy} className="btn-primary w-full py-3 disabled:cursor-not-allowed">
                    {signupBusy ? 'Creating account...' : 'Submit and go to dashboard'}
                  </button>
                </form>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

export default LoginPage;
