import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import LocationLoadingIndicator from '../common/LocationLoadingIndicator';

export default function SuperAdminRoute({ children }) {
  const { admin, loading, isAuthenticated } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-200">
        <LocationLoadingIndicator label="Loading..." />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!['superadmin', 'mainsuperadmin'].includes(admin?.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
