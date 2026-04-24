import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from './components/common/ProtectedRoute';
import SuperAdminRoute from './components/superadmin/SuperAdminRoute';
import LocationLoadingIndicator from './components/common/LocationLoadingIndicator';

const DashboardLayout = lazy(() => import('./pages/DashboardLayout'));
const HomeDashboardPage = lazy(() => import('./pages/HomeDashboardPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const OrganizationSetupPage = lazy(() => import('./pages/OrganizationSetupPage'));
const OrganizationInfoPage = lazy(() => import('./pages/OrganizationInfoPage'));
const RolesPermissionsPage = lazy(() => import('./pages/RolesPermissionsPage'));
const CustomersPage = lazy(() => import('./pages/CustomersPage'));
const CustomerFollowupPage = lazy(() => import('./pages/CustomerFollowupPage'));
const CustomerDetailPage = lazy(() => import('./pages/CustomerDetailPage'));
const FieldTasksPage = lazy(() => import('./pages/FieldTasksPage'));
const VisitsPage = lazy(() => import('./pages/VisitsPage'));
const VisitDetailPage = lazy(() => import('./pages/VisitDetailPage'));
const LeadsOverviewPage = lazy(() => import('./pages/LeadsOverviewPage'));
const LeadFollowupPage = lazy(() => import('./pages/LeadFollowupPage'));
const LeadDetailPage = lazy(() => import('./pages/LeadDetailPage'));
const FieldTasksImportPage = lazy(() => import('./pages/FieldTasksImportPage'));
const FieldTaskDetailsPage = lazy(() => import('./pages/FieldTaskDetailsPage'));
const LiveTrackPage = lazy(() => import('./pages/LiveTrackPage'));
const CompanySetupPage = lazy(() => import('./pages/CompanySetupPage'));
const UsersPage = lazy(() => import('./pages/UsersPage'));
const UsersImportPage = lazy(() => import('./pages/UsersImportPage'));
const EmployeeOnboardingPage = lazy(() => import('./pages/EmployeeOnboardingPage'));
const UserDetailsPage = lazy(() => import('./pages/UserDetailsPage'));
const CustomersImportPage = lazy(() => import('./pages/CustomersImportPage'));
const OperationsMapPage = lazy(() => import('./pages/OperationsMapPage'));
const EmployeeAttendanceViewPage = lazy(() => import('./pages/EmployeeAttendanceViewPage'));
const AttendanceApprovalPage = lazy(() => import('./pages/AttendanceApprovalPage'));
const AttendanceOvertimePage = lazy(() => import('./pages/AttendanceOvertimePage'));
const LeavePage = lazy(() => import('./pages/LeavePage'));
const HolidaysPage = lazy(() => import('./pages/HolidaysPage'));
const ExpensesPage = lazy(() => import('./pages/ExpensesPage'));
const GeofencesPage = lazy(() => import('./pages/GeofencesPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const PlatformModulesPage = lazy(() => import('./pages/PlatformModulesPage'));
const SubscriptionBillingPage = lazy(() => import('./pages/SubscriptionBillingPage'));
const OurProductsPage = lazy(() => import('./pages/OurProductsPage'));
const SuperAdminLayout = lazy(() => import('./pages/superadmin/SuperAdminLayout'));
const SuperAdminDashboardPage = lazy(() => import('./pages/superadmin/SuperAdminDashboardPage'));
const SuperAdminCompaniesPage = lazy(() => import('./pages/superadmin/SuperAdminCompaniesPage'));
const SuperAdminCompanyCreatePage = lazy(() => import('./pages/superadmin/SuperAdminCompanyCreatePage'));
const SuperAdminCompanyDetailPage = lazy(() => import('./pages/superadmin/SuperAdminCompanyDetailPage'));
const SuperAdminCompanyEditPage = lazy(() => import('./pages/superadmin/SuperAdminCompanyEditPage'));
const SuperAdminLicensesPage = lazy(() => import('./pages/superadmin/SuperAdminLicensesPage'));
const SuperAdminPlansPage = lazy(() => import('./pages/superadmin/SuperAdminPlansPage'));
const SuperAdminSettingsPage = lazy(() => import('./pages/superadmin/SuperAdminSettingsPage'));
const SuperAdminIntegrationsPage = lazy(() => import('./pages/superadmin/SuperAdminIntegrationsPage'));
const SuperAdminPaymentsPage = lazy(() => import('./pages/superadmin/SuperAdminPaymentsPage'));
const SuperAdminPartnersPage = lazy(() => import('./pages/superadmin/SuperAdminPartnersPage'));
const SuperAdminPartnerDetailPage = lazy(() => import('./pages/superadmin/SuperAdminPartnerDetailPage'));
const SuperAdminPlaceholderPage = lazy(() => import('./pages/superadmin/SuperAdminPlaceholderPage'));

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
        path="/super"
        element={
          <ProtectedRoute>
            <SuperAdminRoute>{withSuspense(<SuperAdminLayout />)}</SuperAdminRoute>
          </ProtectedRoute>
        }
      >
        <Route index element={withSuspense(<SuperAdminDashboardPage />)} />
        <Route path="companies" element={withSuspense(<SuperAdminCompaniesPage />)} />
        <Route path="companies/new" element={withSuspense(<SuperAdminCompanyCreatePage />)} />
        <Route path="companies/:id/edit" element={withSuspense(<SuperAdminCompanyEditPage />)} />
        <Route path="companies/:id" element={withSuspense(<SuperAdminCompanyDetailPage />)} />
        <Route path="licenses" element={withSuspense(<SuperAdminLicensesPage />)} />
        <Route path="plans" element={withSuspense(<SuperAdminPlansPage />)} />
        <Route path="payments" element={withSuspense(<SuperAdminPaymentsPage />)} />
        <Route path="super-admins" element={withSuspense(<SuperAdminPartnersPage />)} />
        <Route path="super-admins/:id" element={withSuspense(<SuperAdminPartnerDetailPage />)} />
        <Route path="notifications" element={withSuspense(<SuperAdminPlaceholderPage title="Notifications" subtitle="Cross-tenant alerts will appear here." />)} />
        <Route path="integrations" element={withSuspense(<SuperAdminIntegrationsPage />)} />
        <Route path="settings" element={withSuspense(<SuperAdminSettingsPage />)} />
      </Route>
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
        <Route path="billing" element={withSuspense(<SubscriptionBillingPage />)} />
        <Route path="our-products" element={withSuspense(<OurProductsPage />)} />
        <Route path="settings/organization-info" element={withSuspense(<OrganizationInfoPage />)} />
        <Route path="settings/organization" element={withSuspense(<OrganizationSetupPage />)} />
        <Route path="settings/roles" element={withSuspense(<RolesPermissionsPage />)} />
        <Route path="settings" element={withSuspense(<SettingsPage />)} />
        <Route path="users" element={withSuspense(<UsersPage />)} />
        <Route path="users/new" element={withSuspense(<EmployeeOnboardingPage />)} />
        <Route path="users/import" element={withSuspense(<UsersImportPage />)} />
        <Route path="users/:id/employee" element={withSuspense(<EmployeeOnboardingPage />)} />
        <Route path="users/:id" element={withSuspense(<UserDetailsPage />)} />
        <Route path="track/customers/follow-up" element={withSuspense(<CustomerFollowupPage />)} />
        <Route path="track/customers/import" element={withSuspense(<CustomersImportPage />)} />
        <Route path="track/customers/:customerId" element={withSuspense(<CustomerDetailPage />)} />
        <Route path="track/customers" element={withSuspense(<CustomersPage />)} />
        <Route path="track/fieldtasks" element={withSuspense(<FieldTasksPage />)} />
        <Route path="track/visits/:visitId" element={withSuspense(<VisitDetailPage />)} />
        <Route path="track/visits" element={withSuspense(<VisitsPage />)} />
        <Route path="track/leads" element={withSuspense(<LeadsOverviewPage />)} />
        <Route path="track/leads/follow-up" element={withSuspense(<LeadFollowupPage />)} />
        <Route path="track/leads/:id" element={withSuspense(<LeadDetailPage />)} />
        <Route path="track/fieldtasks/import" element={withSuspense(<FieldTasksImportPage />)} />
        <Route path="track/fieldtasks/:id" element={withSuspense(<FieldTaskDetailsPage />)} />
        <Route path="track/livetrack" element={withSuspense(<LiveTrackPage />)} />
        <Route path="operations/map" element={withSuspense(<OperationsMapPage />)} />
        <Route path="operations/attendance" element={<Navigate to="/dashboard/operations/attendance/view" replace />} />
        <Route path="operations/attendance/view" element={withSuspense(<EmployeeAttendanceViewPage />)} />
        <Route path="operations/attendance/approval" element={withSuspense(<AttendanceApprovalPage />)} />
        <Route path="operations/attendance/overtime" element={withSuspense(<AttendanceOvertimePage />)} />
        <Route path="operations/leave" element={withSuspense(<LeavePage />)} />
        <Route path="operations/holidays" element={withSuspense(<HolidaysPage />)} />
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
