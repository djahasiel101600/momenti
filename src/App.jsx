import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import ScrollToTop from './components/ScrollToTop';
import Home from '@/pages/Home';
import Invitation from '@/pages/Invitation';
import Studio from '@/pages/Studio';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import RsvpDashboard from '@/pages/RsvpDashboard';
import Billing from '@/pages/Billing';
import InvitationAnalytics from '@/pages/InvitationAnalytics';
import TemplateGallery from '@/pages/TemplateGallery';
import ProtectedRoute from '@/components/ProtectedRoute';
import { Navigate } from 'react-router-dom';
// Add page imports here

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError && authError.type !== 'auth_required') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
        <div className="max-w-md w-full p-8 bg-white rounded-lg shadow-lg border border-slate-100 text-center">
          <h1 className="text-xl font-semibold text-slate-900">Something went wrong</h1>
          <p className="mt-3 text-sm text-slate-600">{authError.message}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-6 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  // Note: auth_required deliberately falls through to the router. Public
  // pages (/, /login, /register, /:slug …) must render normally, and
  // protected ones redirect through ProtectedRoute. Auto-navigating here
  // caused a /login -> /login?returnTo=/login… redirect loop whenever a
  // stale token was rejected after a server restart.

  // Render the main app
  return (
    <Routes>
      {/* Add your page Route elements here */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/" element={<Home />} />
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route path="/studio" element={<Studio />} />
        <Route path="/studio/rsvps/:id" element={<RsvpDashboard />} />
        <Route path="/studio/analytics/:id" element={<InvitationAnalytics />} />
        <Route path="/studio/templates" element={<TemplateGallery />} />
        <Route path="/studio/billing" element={<Billing />} />
      </Route>
      <Route path="/:client" element={<Invitation />} />
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App