import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Dices } from 'lucide-react';
import { useAuth } from './context';
import { AuthPage } from './pages/AuthPage';
import { HomePage } from './pages/HomePage';
import { RoomPage } from './pages/RoomPage';
import { ProfilePage } from './pages/ProfilePage';
import { MapsPage } from './pages/MapsPage';
import { EditorPage } from './pages/EditorPage';
import { LeaderboardPage } from './pages/LeaderboardPage';
import { ReplayPage } from './pages/ReplayPage';

export function App() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="center" style={{ height: '100%' }}>
        <div className="loading-dice"><Dices size={54} color="var(--brand)" /></div>
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<AuthPage redirectTo={location.pathname} />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/salon/:id" element={<RoomPage />} />
      <Route path="/profil" element={<ProfilePage />} />
      <Route path="/plateaux" element={<MapsPage />} />
      <Route path="/classement" element={<LeaderboardPage />} />
      <Route path="/replay/:id" element={<ReplayPage />} />
      <Route path="/editeur" element={<EditorPage />} />
      <Route path="/editeur/:id" element={<EditorPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
