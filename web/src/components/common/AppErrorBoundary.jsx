import { Component } from 'react';
import logoUrl from '../../assets/logo.png';

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  componentDidMount() {
    window.addEventListener('error', this.handleWindowError);
    window.addEventListener('unhandledrejection', this.handleUnhandledRejection);
  }

  componentWillUnmount() {
    window.removeEventListener('error', this.handleWindowError);
    window.removeEventListener('unhandledrejection', this.handleUnhandledRejection);
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Keep diagnostics in console for faster root-cause debugging.
    // eslint-disable-next-line no-console
    console.error('[AppErrorBoundary] UI crashed', error, info);
  }

  handleWindowError = (event) => {
    const nextError = event?.error || new Error(event?.message || 'Unexpected runtime error');
    this.setState({ hasError: true, error: nextError });
  };

  handleUnhandledRejection = (event) => {
    const reason = event?.reason;
    const nextError =
      reason instanceof Error
        ? reason
        : new Error(typeof reason === 'string' ? reason : 'Unhandled promise rejection');
    this.setState({ hasError: true, error: nextError });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    const { hasError, error } = this.state;
    const { children } = this.props;

    if (!hasError) {
      return children;
    }

    const message = String(error?.message || 'Unexpected UI error');
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <img src={logoUrl} alt="LiveTrack" className="h-9 w-9 rounded-lg object-contain" />
            <h1 className="text-lg font-bold text-slate-900">Something went wrong</h1>
          </div>
          <p className="text-sm text-slate-600">
            This screen failed to load. Please reload once. If this keeps happening, share this message with the team.
          </p>
          <p className="mt-3 rounded-lg bg-slate-100 px-3 py-2 font-mono text-xs text-slate-700">{message}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" className="btn-primary" onClick={this.handleReload}>
              Reload page
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default AppErrorBoundary;
