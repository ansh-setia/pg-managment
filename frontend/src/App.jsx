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
import Managers from './pages/Managers.jsx';

const Auth = createContext(null);
export const useAuth = () => useContext(Auth);

export const ManagerContext = createContext({
  selectedProperty: 'all',
  setSelectedProperty: () => {},
  properties: [],
});
export const useManagerContext = () => useContext(ManagerContext);

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
    ['/managers', 'manage_accounts', 'Managers'],
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

  // Multi-PG manager properties state
  const [managerProperties, setManagerProperties] = useState([]);
  const [selectedProperty, setSelectedProperty] = useState(() =>
    localStorage.getItem('selected_manager_prop') || 'all'
  );

  useEffect(() => {
    if (user.role === 'manager') {
      api('/manager/properties')
        .then((res) => {
          const props = res.properties || [];
          setManagerProperties(props);
          if (props.length === 1) {
            setSelectedProperty(props[0].id);
          }
        })
        .catch(() => {});
    }
  }, [user.role]);

  const handlePropertyChange = (val) => {
    setSelectedProperty(val);
    localStorage.setItem('selected_manager_prop', val);
  };

  const currentPropName =
    selectedProperty === 'all'
      ? 'All Assigned PGs'
      : managerProperties.find((p) => String(p.id) === String(selectedProperty))?.name || user.name || 'Your PG';

  return (
    <ManagerContext.Provider
      value={{
        selectedProperty,
        setSelectedProperty: handlePropertyChange,
        properties: managerProperties,
      }}
    >
      <div className="w-full max-w-xl mx-auto min-h-screen flex flex-col justify-between bg-surface-2 text-ink">
        <header className="sticky top-0 z-20 bg-surface-2/95 backdrop-blur border-b border-line px-5 py-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-primary-soft text-primary font-bold flex items-center justify-center text-sm border border-line shrink-0">
              {initials}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-label text-xs font-semibold text-primary truncate">
                {ROLE_LABEL[user.role]} {user.tenant ? `· Room ${user.tenant.room}` : ''}
              </span>
              <span className="font-title text-base font-bold text-ink leading-tight truncate">
                {user.role === 'manager' && managerProperties.length > 0 ? currentPropName : user.name || 'Your PG'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Manager Property Switcher (if > 1 property) */}
            {user.role === 'manager' && managerProperties.length > 1 && (
              <div className="flex items-center gap-1 px-2.5 py-1 bg-surface border border-line rounded-full text-xs font-semibold shadow-sm">
                <span className="material-symbols-outlined text-[15px] text-primary">apartment</span>
                <select
                  value={selectedProperty}
                  onChange={(e) => handlePropertyChange(e.target.value)}
                  className="bg-transparent text-ink font-bold text-xs focus:outline-none cursor-pointer max-w-[130px] truncate"
                >
                  <option value="all">🌐 All PGs ({managerProperties.length})</option>
                  {managerProperties.map((p) => (
                    <option key={p.id} value={p.id}>
                      🏢 {p.name} {p.isPrimary ? '★' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <button
              type="button"
              onClick={logout}
              className="inline-flex items-center justify-center px-3.5 py-1.5 rounded-full bg-surface text-ink border border-line text-xs font-semibold hover:bg-surface-2 transition-colors"
            >
              Logout
            </button>
          </div>
        </header>

        {/* Notice for managers with 0 properties */}
        {user.role === 'manager' && managerProperties.length === 0 && (
          <div className="mx-4 mt-4 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center gap-3">
            <span className="material-symbols-outlined text-amber-600 text-[24px]">info</span>
            <div>
              <p className="font-bold">No properties assigned yet</p>
              <p className="opacity-90">Your account is active, but you have not been allotted any PG properties yet. Please contact your property owner.</p>
            </div>
          </div>
        )}

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
                  <span className="text-[11px] leading-tight truncate">{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>
    </ManagerContext.Provider>
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
              <Route path="/managers" element={<Managers />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/hisaab" replace />} />
            </>)}
          </Route>
        )}
      </Routes>
    </Auth.Provider>
  );
}
