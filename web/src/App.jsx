import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from './components/common/ProtectedRoute';
import LocationLoadingIndicator from './components/common/LocationLoadingIndicator';

const DashboardLayout = lazy(() => import('./pages/DashboardLayout'));
const HomeDashboardPage = lazy(() => import('./pages/HomeDashboardPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const CustomersPage = lazy(() => import('./pages/CustomersPage'));
const CustomerDetailPage = lazy(() => import('./pages/CustomerDetailPage'));
const FieldTasksPage = lazy(() => import('./pages/FieldTasksPage'));
const VisitsPage = lazy(() => import('./pages/VisitsPage'));
const VisitDetailPage = lazy(() => import('./pages/VisitDetailPage'));
const FieldTasksImportPage = lazy(() => import('./pages/FieldTasksImportPage'));
const FieldTaskDetailsPage = lazy(() => import('./pages/FieldTaskDetailsPage'));
const LiveTrackPage = lazy(() => import('./pages/LiveTrackPage'));
const CompanySetupPage = lazy(() => import('./pages/CompanySetupPage'));
const UsersPage = lazy(() => import('./pages/UsersPage'));
const UsersImportPage = lazy(() => import('./pages/UsersImportPage'));
const UserDetailsPage = lazy(() => import('./pages/UserDetailsPage'));
const CustomersImportPage = lazy(() => import('./pages/CustomersImportPage'));
const OperationsMapPage = lazy(() => import('./pages/OperationsMapPage'));
const AttendancePage = lazy(() => import('./pages/AttendancePage'));
const LeavePage = lazy(() => import('./pages/LeavePage'));
const ExpensesPage = lazy(() => import('./pages/ExpensesPage'));
const GeofencesPage = lazy(() => import('./pages/GeofencesPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const PlatformModulesPage = lazy(() => import('./pages/PlatformModulesPage'));

function withSuspense(node) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center px-4 py-6">
          <LocationLoadingIndicator label="Loading..." />
        </div>
      }
    >
      {node}
    </Suspense>
  );
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={withSuspense(<LoginPage />)} />
      <Route
        path="/company-setup"
        element={
          <ProtectedRoute>
            {withSuspense(<CompanySetupPage />)}
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            {withSuspense(<DashboardLayout />)}
          </ProtectedRoute>
        }
      >
        <Route index element={withSuspense(<HomeDashboardPage />)} />
        <Route path="profile" element={withSuspense(<ProfilePage />)} />
        <Route path="settings" element={withSuspense(<SettingsPage />)} />
        <Route path="users" element={withSuspense(<UsersPage />)} />
        <Route path="users/import" element={withSuspense(<UsersImportPage />)} />
        <Route path="users/:id" element={withSuspense(<UserDetailsPage />)} />
        <Route path="track/customers/:customerId" element={withSuspense(<CustomerDetailPage />)} />
        <Route path="track/customers" element={withSuspense(<CustomersPage />)} />
        <Route path="track/customers/import" element={withSuspense(<CustomersImportPage />)} />
        <Route path="track/fieldtasks" element={withSuspense(<FieldTasksPage />)} />
        <Route path="track/visits/:visitId" element={withSuspense(<VisitDetailPage />)} />
        <Route path="track/visits" element={withSuspense(<VisitsPage />)} />
        <Route path="track/fieldtasks/import" element={withSuspense(<FieldTasksImportPage />)} />
        <Route path="track/fieldtasks/:id" element={withSuspense(<FieldTaskDetailsPage />)} />
        <Route path="track/livetrack" element={withSuspense(<LiveTrackPage />)} />
        <Route path="operations/map" element={withSuspense(<OperationsMapPage />)} />
        <Route path="operations/attendance" element={withSuspense(<AttendancePage />)} />
        <Route path="operations/leave" element={withSuspense(<LeavePage />)} />
        <Route path="operations/expenses" element={withSuspense(<ExpensesPage />)} />
        <Route path="operations/geofences" element={withSuspense(<GeofencesPage />)} />
        <Route path="operations/reports" element={withSuspense(<ReportsPage />)} />
        <Route path="operations/modules" element={withSuspense(<PlatformModulesPage />)} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default App;
