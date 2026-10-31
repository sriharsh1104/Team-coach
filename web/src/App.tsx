import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { AppShell } from './layout/AppShell';
import { ChatPage } from './pages/ChatPage';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { ManageTournamentRecordsPage } from './pages/ManageTournamentRecordsPage';
import { MapsPage } from './pages/MapsPage';
import { MembersPage } from './pages/MembersPage';
import { PointsTablePage } from './pages/PointsTablePage';
import {
  CreateOrgPage,
  JoinOrgPage,
  OrgChoicePage,
} from './pages/OrgSetupPages';
import { ProfilePage } from './pages/ProfilePage';
import { RuleBookPage } from './pages/RuleBookPage';
import { StatsPage } from './pages/StatsPage';
import { SignupPage } from './pages/SignupPage';
import { SocialHandlesPage } from './pages/SocialHandlesPage';
import { TwoFactorPage } from './pages/TwoFactorPage';
import { VerifyEmailPage } from './pages/VerifyEmailPage';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isLoading, user } = useAuth();
  if (isLoading) return <div className="app-loading">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function RequireOrg({ children }: { children: React.ReactNode }) {
  const { org } = useAuth();
  if (!org) return <Navigate to="/org" replace />;
  return children;
}

function PublicOnly({ children }: { children: React.ReactNode }) {
  const { isLoading, user, org } = useAuth();
  if (isLoading) return <div className="app-loading">Loading…</div>;
  if (user && org) return <Navigate to="/app" replace />;
  if (user && !org) return <Navigate to="/org" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      {/* Public marketing site — no login required */}
      <Route path="/" element={<HomePage />} />

      <Route
        path="/login"
        element={
          <PublicOnly>
            <LoginPage />
          </PublicOnly>
        }
      />
      <Route
        path="/signup"
        element={
          <PublicOnly>
            <SignupPage />
          </PublicOnly>
        }
      />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/2fa" element={<TwoFactorPage />} />

      <Route
        path="/org"
        element={
          <RequireAuth>
            <OrgChoicePage />
          </RequireAuth>
        }
      />
      <Route
        path="/org/create"
        element={
          <RequireAuth>
            <CreateOrgPage />
          </RequireAuth>
        }
      />
      <Route
        path="/org/join"
        element={
          <RequireAuth>
            <JoinOrgPage />
          </RequireAuth>
        }
      />

      {/* Authenticated team workspace */}
      <Route
        path="/app"
        element={
          <RequireAuth>
            <RequireOrg>
              <AppShell />
            </RequireOrg>
          </RequireAuth>
        }
      >
        <Route index element={<ChatPage />} />
        <Route path="members" element={<MembersPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route
          path="tournament-records"
          element={<ManageTournamentRecordsPage />}
        />
        <Route path="stats" element={<StatsPage />} />
        <Route path="scrims" element={<Navigate to="/app/stats" replace />} />
        <Route path="maps" element={<MapsPage />} />
        <Route path="points-table" element={<PointsTablePage />} />
        <Route path="rule-book" element={<RuleBookPage />} />
        <Route path="social" element={<SocialHandlesPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
