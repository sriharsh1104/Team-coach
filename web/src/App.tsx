import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { postAuthPath } from './auth/postAuthPath';
import { AppShell } from './layout/AppShell';
import { ChatPage } from './pages/ChatPage';
import { GuildSpacePage } from './pages/guild/GuildSpacePage';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { ManageTournamentRecordsPage } from './pages/ManageTournamentRecordsPage';
import { MapsPage } from './pages/MapsPage';
import { MemberProfilePage } from './pages/MemberProfilePage';
import { MembersPage } from './pages/MembersPage';
import { PointsTablePage } from './pages/PointsTablePage';
import {
  CreateOrgPage,
  JoinOrgPage,
  OrgChoicePage,
} from './pages/OrgSetupPages';
import { ProfilePage } from './pages/ProfilePage';
import { RuleBookPage } from './pages/RuleBookPage';
import { SecurityPage } from './pages/SecurityPage';
import { StatsPage } from './pages/StatsPage';
import { SignupPage } from './pages/SignupPage';
import { SocialHandlesPage } from './pages/SocialHandlesPage';
import { TwoFactorPage } from './pages/TwoFactorPage';
import { TwoFactorSetupPage } from './pages/TwoFactorSetupPage';
import { InviteJoinPage } from './pages/InviteJoinPage';
import { VerifyEmailPage } from './pages/VerifyEmailPage';
import { SesLoader } from './ui/SesLoader';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isLoading, user } = useAuth();
  if (isLoading) return <SesLoader label="Loading" />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function RequireProfileComplete({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (user && !user.profileComplete) {
    return <Navigate to="/profile" replace />;
  }
  return children;
}

function RequireOrg() {
  const { org } = useAuth();
  if (!org) return <Navigate to="/guild" replace />;
  return <Outlet />;
}

function GuildTools() {
  const { org, guild } = useAuth();
  if (org && !org.isOwner) return <Navigate to="/app" replace />;
  if (!org && !guild) return <Navigate to="/guild" replace />;
  return <Outlet />;
}

function PublicOnly({ children }: { children: React.ReactNode }) {
  const { isLoading, user, org } = useAuth();
  if (isLoading) return <SesLoader label="Loading" />;
  if (user) {
    return <Navigate to={postAuthPath(user, org)} replace />;
  }
  return children;
}

export default function App() {
  return (
    <Routes>
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
      <Route path="/join/:token" element={<InviteJoinPage />} />

      <Route
        path="/org"
        element={
          <RequireAuth>
            <RequireProfileComplete>
              <OrgChoicePage />
            </RequireProfileComplete>
          </RequireAuth>
        }
      />
      <Route
        path="/org/create"
        element={
          <RequireAuth>
            <RequireProfileComplete>
              <CreateOrgPage />
            </RequireProfileComplete>
          </RequireAuth>
        }
      />
      <Route
        path="/org/join"
        element={
          <RequireAuth>
            <RequireProfileComplete>
              <JoinOrgPage />
            </RequireProfileComplete>
          </RequireAuth>
        }
      />

      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route
          path="/guild"
          element={
            <RequireProfileComplete>
              <GuildSpacePage />
            </RequireProfileComplete>
          }
        />
        <Route
          element={
            <RequireProfileComplete>
              <GuildTools />
            </RequireProfileComplete>
          }
        >
          <Route path="/guild/chat" element={<ChatPage variant="guild" />} />
        </Route>
        <Route path="/profile" element={<ProfilePage />} />
        <Route
          path="/members/:userId"
          element={
            <RequireProfileComplete>
              <MemberProfilePage />
            </RequireProfileComplete>
          }
        />
        <Route
          path="/settings"
          element={
            <RequireProfileComplete>
              <SecurityPage />
            </RequireProfileComplete>
          }
        />
        <Route
          path="/settings/2fa"
          element={
            <RequireProfileComplete>
              <TwoFactorSetupPage />
            </RequireProfileComplete>
          }
        />
        <Route
          path="/social"
          element={
            <RequireProfileComplete>
              <SocialHandlesPage />
            </RequireProfileComplete>
          }
        />

        <Route
          path="/app"
          element={
            <RequireProfileComplete>
              <RequireOrg />
            </RequireProfileComplete>
          }
        >
          <Route index element={<ChatPage />} />
          <Route path="members" element={<MembersPage />} />
          <Route path="profile" element={<Navigate to="/profile" replace />} />
          <Route
            path="tournament-records"
            element={<ManageTournamentRecordsPage />}
          />
          <Route path="stats" element={<StatsPage />} />
          <Route path="scrims" element={<Navigate to="/app/stats" replace />} />
          <Route path="maps" element={<MapsPage />} />
          <Route path="points-table" element={<PointsTablePage />} />
          <Route path="rule-book" element={<RuleBookPage />} />
          <Route path="social" element={<Navigate to="/social" replace />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
