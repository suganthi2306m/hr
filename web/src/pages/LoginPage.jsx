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

  const [showSignupCard, setShowSignupCard] = useState(false);

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
      if (response.admin?.companySetupCompleted) {
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
      {showSignupCard && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="presentation"
          onClick={() => setShowSignupCard(false)}
        >
          <div
            role="dialog"
            aria-labelledby="signup-card-title"
            className="w-full max-w-md rounded-2xl border border-white/10 bg-flux-sidebar p-6 text-white shadow-panel-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="signup-card-title" className="text-lg font-bold">
              Contact the LiveTrack team
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              New company accounts are provisioned by our team. Reach us using:
            </p>
            <ul className="mt-4 space-y-3 text-sm">
              <li>
                <span className="text-slate-500">Email </span>
                <a className="font-semibold text-primary hover:underline" href="mailto:mcrt@gmail.com">
                  mcrt@gmail.com
                </a>
              </li>
              <li>
                <span className="text-slate-500">Phone </span>
                <a className="font-semibold text-primary hover:underline" href="tel:9876543210">
                  9876543210
                </a>
              </li>
            </ul>
            <p className="mt-4 text-xs text-slate-500">Click outside this card to close.</p>
          </div>
        </div>
      )}

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
                  <button type="button" className="font-semibold text-primary hover:underline" onClick={() => setShowSignupCard(true)}>
                    Sign up
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
          ) : (
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
          )}
        </section>
      </div>
    </div>
  );
}

export default LoginPage;
