import { createContext, useContext, useEffect, useState } from 'react';
import { Navigate, NavLink, Outlet, Route, Routes } from 'react-router-dom';
import { api, hasToken, setToken } from './api.js';
import Login from './pages/Login.jsx';
import Vacancy from './pages/Vacancy.jsx';
import Onboard from './pages/Onboard.jsx';
import ParentApproval from './pages/ParentApproval.jsx';
import { Rent, Bill, Complaint, Menu, LeavePass } from './pages/Tenant.jsx';
import { Meter, Complaints, Tenants, MenuEdit } from './pages/Manager.jsx';
import { Hisaab, Beds, Settings } from './pages/Owner.jsx';

const Auth = createContext(null);
export const useAuth = () => useContext(Auth);

const TABS = {
  tenant: [
    ['/kiraya', 'account_balance_wallet', 'Rent'],
    ['/bill', 'bolt', 'Electricity'],
    ['/complaint', 'build', 'Complaints'],
    ['/menu', 'restaurant', 'Food Menu'],
    ['/leave', 'event_available', 'Leaves & Passes'],
  ],
  manager: [
    ['/meter', 'bolt', 'Meter Readings'],
    ['/complaints', 'build', 'Complaints'],
    ['/tenants', 'group', 'Tenants & Passes'],
    ['/menu', 'restaurant', 'Food Menu'],
  ],
  malik: [
    ['/hisaab', 'account_balance_wallet', 'Finances'],
    ['/beds', 'bed', 'Rooms & Beds'],
    ['/tenants', 'group', 'Tenants'],
    ['/settings', 'settings', 'Settings'],
  ],
};
const ROLE_LABEL = { tenant: 'Tenant', manager: 'Manager', malik: 'Owner' };

function Shell() {
  const { user, logout } = useAuth();
  const initials = (user.name || 'PG')
    .split(' ')
    .map((s) => s[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="w-full max-w-xl mx-auto min-h-screen flex flex-col justify-between bg-surface-2 text-ink">
      <header className="sticky top-0 z-20 bg-surface-2/95 backdrop-blur border-b border-line px-5 py-3.5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary-soft text-primary font-bold flex items-center justify-center text-sm border border-line shrink-0">
            {initials}
          </div>
          <div className="flex flex-col">
            <span className="font-label text-xs font-semibold text-primary">
              {ROLE_LABEL[user.role]} {user.tenant ? `· Room ${user.tenant.room}` : ''}
            </span>
            <span className="font-title text-base font-bold text-ink leading-tight">
              {user.name || 'Your PG'}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={logout}
          className="inline-flex items-center justify-center px-4 py-1.5 rounded-full bg-surface text-ink border border-line text-xs font-semibold hover:bg-surface-2 transition-colors"
        >
          Logout
        </button>
      </header>

      <main className="flex-1 px-4 py-4 pb-24">
        <Outlet />
      </main>

      <nav
        className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-xl z-20 bg-surface border-t border-line px-1.5 py-2 grid gap-1 shadow-sm"
        style={{ gridTemplateColumns: `repeat(${TABS[user.role]?.length || 4}, minmax(0, 1fr))` }}
        aria-label="Primary navigation"
      >
        {TABS[user.role].map(([to, icon, label]) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 py-1 transition-colors ${
                isActive ? 'text-primary font-bold' : 'text-ink-2 hover:text-ink'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={`px-3.5 py-1 rounded-full flex items-center justify-center transition-colors ${
                    isActive ? 'bg-primary-soft text-primary' : 'text-ink-2'
                  }`}
                >
                  <span className="material-symbols-outlined text-[20px]">{icon}</span>
                </span>
                <span className="text-[11px] leading-tight">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(!hasToken());

  useEffect(() => {
    if (!hasToken()) return;
    api('/auth/me').then(setUser).catch(() => setToken(null)).finally(() => setReady(true));
  }, []);

  const login = async () => setUser(await api('/auth/me'));
  const logout = () => { setToken(null); setUser(null); };

  if (!ready) return <p className="muted pad">Loading…</p>;

  return (
    <Auth.Provider value={{ user, logout }}>
      <Routes>
        <Route path="/vacancy" element={<Vacancy />} />
        <Route path="/onboard/:token" element={<Onboard onLogin={login} />} />
        <Route path="/parent-approval/:token" element={<ParentApproval />} />
        {!user && <Route path="*" element={<Login onLogin={login} />} />}
        {user && (
          <Route element={<Shell />}>
            {user.role === 'tenant' && (<>
              <Route path="/kiraya" element={<Rent />} />
              <Route path="/bill" element={<Bill />} />
              <Route path="/complaint" element={<Complaint />} />
              <Route path="/menu" element={<Menu />} />
              <Route path="/leave" element={<LeavePass />} />
              <Route path="*" element={<Navigate to="/kiraya" replace />} />
            </>)}
            {user.role === 'manager' && (<>
              <Route path="/meter" element={<Meter />} />
              <Route path="/complaints" element={<Complaints />} />
              <Route path="/tenants" element={<Tenants />} />
              <Route path="/menu" element={<MenuEdit />} />
              <Route path="*" element={<Navigate to="/meter" replace />} />
            </>)}
            {user.role === 'malik' && (<>
              <Route path="/hisaab" element={<Hisaab />} />
              <Route path="/beds" element={<Beds />} />
              <Route path="/tenants" element={<Tenants />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/hisaab" replace />} />
            </>)}
          </Route>
        )}
      </Routes>
    </Auth.Provider>
  );
}
