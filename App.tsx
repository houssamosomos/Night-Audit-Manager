import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { seedIfEmpty } from './lib/seed';
import { initSyncWatchers, syncNow } from './lib/sync';
import { OFFLINE_DEMO } from './lib/supabase';
import { Spinner } from './components/ui';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Reservations from './pages/Reservations';
import Guests from './pages/Guests';
import Rooms from './pages/Rooms';
import Cashier from './pages/Cashier';
import NightAudit from './pages/NightAudit';
import Reports from './pages/Reports';
import Users from './pages/Users';
import Settings from './pages/Settings';

function Protected({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" state={{ from: loc }} replace />;
  return children;
}

export default function App() {
  const { user } = useAuth();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      if (OFFLINE_DEMO) await seedIfEmpty();
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    if (user) {
      initSyncWatchers(user.hotel_id);
      syncNow(user.hotel_id);
    }
  }, [user]);

  if (!ready) return <div className="grid min-h-screen place-items-center bg-navy-950"><Spinner /></div>;

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Protected><Layout /></Protected>}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/reservations" element={<Reservations />} />
        <Route path="/guests" element={<Guests />} />
        <Route path="/rooms" element={<Rooms />} />
        <Route path="/cashier" element={<Cashier />} />
        <Route path="/night-audit" element={<NightAudit />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/users" element={<Users />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
