import { useState, useMemo } from 'react';
import { api } from '../api.js';
import { ErrorBox, Loading, fmtDate, fmtTime, inr, useLoad } from '../components.jsx';

export default function Managers() {
  const { data, error, reload } = useLoad(() => api('/owner/managers'));
  const [view, setView] = useState('manager'); // 'manager' | 'property'
  const [search, setSearch] = useState('');
  const [propertyFilter, setPropertyFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [onlyUnassigned, setOnlyUnassigned] = useState(false);

  // Modals state
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [managePropsManager, setManagePropsManager] = useState(null);
  const [permissionsManager, setPermissionsManager] = useState(null);
  const [activityManager, setActivityManager] = useState(null);
  const [replaceTargetProperty, setReplaceTargetProperty] = useState(null);
  const [addPropertyModalOpen, setAddPropertyModalOpen] = useState(false);
  const [activeMenuManagerId, setActiveMenuManagerId] = useState(null);

  // Status message
  const [msg, setMsg] = useState({ text: '', bad: false });
  const [busyAction, setBusyAction] = useState(false);

  if (error) return <ErrorBox text={error} />;
  if (!data) return <Loading />;

  const { summary, managers = [], properties = [], invitations = [] } = data;

  // Filter managers
  const filteredManagers = managers.filter((m) => {
    const q = search.trim().toLowerCase();
    const matchSearch =
      !q ||
      m.name.toLowerCase().includes(q) ||
      m.phone.includes(q) ||
      m.assignedProperties.some((p) => p.name.toLowerCase().includes(q));

    const matchProp =
      propertyFilter === 'all' ||
      m.assignedProperties.some((p) => String(p.id) === propertyFilter || p.name === propertyFilter);

    const matchStatus = statusFilter === 'all' || m.status === statusFilter;
    const matchRole =
      roleFilter === 'all' ||
      (roleFilter === 'full' && m.permissionRole === 'Full Manager') ||
      (roleFilter === 'caretaker' && m.permissionRole === 'Caretaker') ||
      (roleFilter === 'custom' && m.permissionRole === 'Custom Access');

    const matchUnassigned = !onlyUnassigned || m.assignedCount === 0;

    return matchSearch && matchProp && matchStatus && matchRole && matchUnassigned;
  });

  // Filter properties
  const filteredProperties = properties.filter((p) => {
    const q = search.trim().toLowerCase();
    const matchSearch =
      !q ||
      p.name.toLowerCase().includes(q) ||
      (p.address && p.address.toLowerCase().includes(q));
    const matchProp = propertyFilter === 'all' || String(p.id) === propertyFilter;
    const matchUnassigned = !onlyUnassigned || !p.isManaged;
    return matchSearch && matchProp && matchUnassigned;
  });

  // Action helpers
  const handleSuspend = async (mgr) => {
    if (!window.confirm(`Suspend access for ${mgr.name}? They will not be able to manage any assigned PGs until reactivated.`)) return;
    setBusyAction(true);
    try {
      await api(`/owner/managers/${mgr.id}/suspend`, { method: 'POST' });
      setMsg({ text: `Access suspended for ${mgr.name} ✓`, bad: false });
      reload();
    } catch (err) {
      setMsg({ text: err.message, bad: true });
    } finally {
      setBusyAction(false);
      setActiveMenuManagerId(null);
    }
  };

  const handleReactivate = async (mgr) => {
    setBusyAction(true);
    try {
      await api(`/owner/managers/${mgr.id}/reactivate`, { method: 'POST' });
      setMsg({ text: `Access reactivated for ${mgr.name} ✓`, bad: false });
      reload();
    } catch (err) {
      setMsg({ text: err.message, bad: true });
    } finally {
      setBusyAction(false);
      setActiveMenuManagerId(null);
    }
  };

  const handleRemove = async (mgr) => {
    if (!window.confirm(`Remove manager ${mgr.name} from your workspace? Historical records and audit logs will remain intact.`)) return;
    setBusyAction(true);
    try {
      await api(`/owner/managers/${mgr.id}`, { method: 'DELETE' });
      setMsg({ text: `Manager ${mgr.name} removed ✓`, bad: false });
      reload();
    } catch (err) {
      setMsg({ text: err.message, bad: true });
    } finally {
      setBusyAction(false);
      setActiveMenuManagerId(null);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Page Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex flex-col gap-0.5">
          <h1 className="font-headline text-2xl font-bold text-ink">Managers</h1>
          <p className="font-body text-sm text-ink-2">Manage your staff, property assignments and access permissions.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAddPropertyModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-surface border border-line text-ink font-label text-xs font-semibold hover:bg-surface-2 transition-colors shrink-0"
          >
            <span className="material-symbols-outlined text-[16px]">domain_add</span>
            <span>+ New PG</span>
          </button>
          <button
            type="button"
            onClick={() => setAddModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-primary text-on-primary font-label text-xs font-bold shadow-sm hover:opacity-95 transition-opacity shrink-0"
          >
            <span className="material-symbols-outlined text-[18px]">person_add</span>
            <span>+ Add Manager</span>
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="bg-surface border border-line rounded-2xl p-4 shadow-sm flex flex-col items-center justify-center text-center">
          <span className="font-headline text-2xl font-bold text-ink tabular-nums">{summary.totalManagers}</span>
          <span className="font-body text-xs text-ink-2 mt-0.5">Total Managers</span>
        </div>
        <div className="bg-surface border border-line rounded-2xl p-4 shadow-sm flex flex-col items-center justify-center text-center">
          <span className="font-headline text-2xl font-bold text-success tabular-nums">{summary.activeManagers}</span>
          <span className="font-body text-xs text-ink-2 mt-0.5">Active Managers</span>
        </div>
        <div className="bg-surface border border-line rounded-2xl p-4 shadow-sm flex flex-col items-center justify-center text-center">
          <span className="font-headline text-2xl font-bold text-primary tabular-nums">{summary.managedProperties}</span>
          <span className="font-body text-xs text-ink-2 mt-0.5">Managed PGs</span>
        </div>
        <div className="bg-surface border border-line rounded-2xl p-4 shadow-sm flex flex-col items-center justify-center text-center">
          <span className={`font-headline text-2xl font-bold tabular-nums ${summary.unassignedProperties > 0 ? 'text-warning' : 'text-ink-2'}`}>
            {summary.unassignedProperties}
          </span>
          <span className="font-body text-xs text-ink-2 mt-0.5">Unassigned PGs</span>
        </div>
      </div>

      {/* Notification Message */}
      {msg.text && (
        <div className={`rounded-xl px-4 py-2.5 text-xs font-semibold flex items-center justify-between gap-2 ${msg.bad ? 'bg-danger-soft text-on-danger-soft' : 'bg-success-soft text-on-success-soft'}`}>
          <span>{msg.text}</span>
          <button type="button" onClick={() => setMsg({ text: '', bad: false })} className="text-xs font-bold opacity-70 hover:opacity-100">✕</button>
        </div>
      )}

      {/* View Switcher & Search/Filters */}
      <div className="flex flex-col gap-3">
        {/* Switcher & Search bar */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="grid grid-cols-2 p-1 rounded-xl bg-surface-2 border border-line w-full sm:w-64">
            <button
              type="button"
              onClick={() => setView('manager')}
              className={`py-1.5 px-3 rounded-lg font-label text-xs font-semibold transition-all inline-flex items-center justify-center gap-1.5 ${
                view === 'manager' ? 'bg-surface text-primary shadow-sm' : 'text-ink-2 hover:text-ink'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">groups</span>
              <span>By Manager</span>
            </button>
            <button
              type="button"
              onClick={() => setView('property')}
              className={`py-1.5 px-3 rounded-lg font-label text-xs font-semibold transition-all inline-flex items-center justify-center gap-1.5 ${
                view === 'property' ? 'bg-surface text-primary shadow-sm' : 'text-ink-2 hover:text-ink'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">apartment</span>
              <span>By Property</span>
            </button>
          </div>

          <div className="relative flex-1 min-w-[200px]">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-ink-2 text-[18px]">search</span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by manager name, phone or PG..."
              className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-surface border border-line text-xs font-body text-ink focus:border-primary focus:outline-none"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-2 hover:text-ink text-xs font-bold"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Compact Filters Row */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
          {/* Property Dropdown */}
          {properties.length > 1 && (
            <select
              value={propertyFilter}
              onChange={(e) => setPropertyFilter(e.target.value)}
              className="px-3 py-1.5 rounded-full bg-surface border border-line text-ink font-label text-xs font-semibold focus:border-primary focus:outline-none shrink-0"
            >
              <option value="all">All Properties</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}

          {/* Status Filter */}
          <div className="flex items-center gap-1 shrink-0">
            {['all', 'active', 'suspended', 'unassigned'].map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1 rounded-full font-label text-xs font-semibold transition-all capitalize ${
                  statusFilter === st ? 'bg-primary text-on-primary' : 'bg-surface border border-line text-ink-2 hover:text-ink'
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          {/* Unassigned Only Toggle */}
          <button
            type="button"
            onClick={() => setOnlyUnassigned(!onlyUnassigned)}
            className={`px-3 py-1 rounded-full font-label text-xs font-semibold transition-all shrink-0 inline-flex items-center gap-1 ${
              onlyUnassigned ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-surface border border-line text-ink-2 hover:text-ink'
            }`}
          >
            <span>Unassigned Only</span>
            {onlyUnassigned && <span>✓</span>}
          </button>
        </div>
      </div>

      {/* ---------------------------------------------------------------------- */}
      {/* VIEW 1: BY MANAGER */}
      {/* ---------------------------------------------------------------------- */}
      {view === 'manager' && (
        <div className="flex flex-col gap-3">
          {filteredManagers.length === 0 ? (
            <div className="bg-surface border border-line rounded-2xl p-8 text-center flex flex-col items-center gap-3">
              <span className="material-symbols-outlined text-ink-2 text-[44px]">badge</span>
              <div>
                <p className="font-bold text-ink text-sm">
                  {managers.length === 0 ? 'No managers added yet' : 'No matching managers found'}
                </p>
                <p className="text-xs text-ink-2 mt-0.5">
                  {managers.length === 0
                    ? 'Assign managers to your PGs and manage their responsibilities from one place.'
                    : 'Try clearing your search query or adjusting your filters.'}
                </p>
              </div>
              {managers.length === 0 ? (
                <button
                  type="button"
                  onClick={() => setAddModalOpen(true)}
                  className="mt-1 inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-primary text-on-primary font-label text-xs font-bold shadow-sm hover:opacity-95"
                >
                  <span className="material-symbols-outlined text-[18px]">person_add</span>
                  <span>+ Add Your First Manager</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => { setSearch(''); setPropertyFilter('all'); setStatusFilter('all'); setOnlyUnassigned(false); }}
                  className="text-xs font-bold text-primary hover:underline"
                >
                  Clear Filters
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {filteredManagers.map((mgr) => {
                const initials = (mgr.name || 'MG')
                  .split(' ')
                  .map((s) => s[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase();

                const isSuspended = mgr.status === 'suspended';
                const isUnassigned = mgr.status === 'unassigned';

                return (
                  <div
                    key={mgr.id}
                    className="bg-surface border border-line rounded-2xl p-4 shadow-sm flex flex-col gap-3 hover:border-line/80 transition-colors"
                  >
                    {/* Top Row: Avatar, Name, Status, Overflow Menu */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-primary-soft text-primary font-bold flex items-center justify-center text-sm border border-line shrink-0">
                          {initials}
                        </div>
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-title text-sm font-bold text-ink">{mgr.name}</span>
                            {mgr.isPrimary && (
                              <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-bold inline-flex items-center gap-0.5">
                                <span>⭐</span>
                                <span>Primary</span>
                              </span>
                            )}
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                isSuspended
                                  ? 'bg-danger-soft text-on-danger-soft'
                                  : isUnassigned
                                  ? 'bg-surface-2 text-ink-2'
                                  : 'bg-success-soft text-on-success-soft'
                              }`}
                            >
                              {isSuspended ? 'Suspended' : isUnassigned ? 'Unassigned' : 'Active'}
                            </span>
                          </div>
                          <span className="font-body text-xs text-ink-2 tabular-nums">
                            +91 {mgr.phone} {mgr.email ? `· ${mgr.email}` : ''}
                          </span>
                        </div>
                      </div>

                      {/* Overflow Menu Button */}
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setActiveMenuManagerId(activeMenuManagerId === mgr.id ? null : mgr.id)}
                          className="w-8 h-8 rounded-full hover:bg-surface-2 flex items-center justify-center text-ink-2 hover:text-ink transition-colors"
                          title="More options"
                        >
                          <span className="material-symbols-outlined text-[20px]">more_vert</span>
                        </button>

                        {/* Dropdown menu */}
                        {activeMenuManagerId === mgr.id && (
                          <div
                            className="absolute right-0 top-9 z-30 w-48 bg-surface rounded-2xl border border-line shadow-xl py-1.5 flex flex-col animate-in fade-in zoom-in-95 duration-150"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() => { setActivityManager(mgr); setActiveMenuManagerId(null); }}
                              className="w-full px-3.5 py-2 text-left text-xs font-semibold text-ink hover:bg-surface-2 flex items-center gap-2"
                            >
                              <span className="material-symbols-outlined text-[16px] text-ink-2">history</span>
                              <span>View Activity Logs</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => { setPermissionsManager(mgr); setActiveMenuManagerId(null); }}
                              className="w-full px-3.5 py-2 text-left text-xs font-semibold text-ink hover:bg-surface-2 flex items-center gap-2"
                            >
                              <span className="material-symbols-outlined text-[16px] text-ink-2">tune</span>
                              <span>Change Permissions</span>
                            </button>
                            {isSuspended ? (
                              <button
                                type="button"
                                onClick={() => handleReactivate(mgr)}
                                className="w-full px-3.5 py-2 text-left text-xs font-semibold text-success hover:bg-success-soft/30 flex items-center gap-2"
                              >
                                <span className="material-symbols-outlined text-[16px]">check_circle</span>
                                <span>Reactivate Access</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleSuspend(mgr)}
                                className="w-full px-3.5 py-2 text-left text-xs font-semibold text-warning hover:bg-warning-soft/30 flex items-center gap-2"
                              >
                                <span className="material-symbols-outlined text-[16px]">block</span>
                                <span>Suspend Access</span>
                              </button>
                            )}
                            <div className="border-t border-line my-1" />
                            <button
                              type="button"
                              onClick={() => handleRemove(mgr)}
                              className="w-full px-3.5 py-2 text-left text-xs font-semibold text-danger hover:bg-danger-soft/30 flex items-center gap-2"
                            >
                              <span className="material-symbols-outlined text-[16px]">delete</span>
                              <span>Remove Manager</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Middle: Assigned Properties Chips */}
                    <div className="flex flex-col gap-1.5 pt-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-ink-2 text-[11px] uppercase tracking-wider">
                          Assigned PGs ({mgr.assignedCount}):
                        </span>
                        <span className="text-[11px] text-primary font-bold">{mgr.permissionRole}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {mgr.assignedProperties.length === 0 ? (
                          <span className="text-xs text-ink-2 italic">No properties assigned currently.</span>
                        ) : (
                          <>
                            {mgr.assignedProperties.slice(0, 3).map((p) => (
                              <span
                                key={p.id}
                                className="px-2.5 py-1 rounded-xl bg-surface-2 border border-line text-ink text-xs font-semibold inline-flex items-center gap-1"
                              >
                                <span>🏢</span>
                                <span>{p.name}</span>
                                {p.isPrimary && <span className="text-[10px] text-amber-600 font-bold">★</span>}
                              </span>
                            ))}
                            {mgr.assignedProperties.length > 3 && (
                              <span className="px-2 py-0.5 rounded-full bg-surface-2 border border-line text-ink-2 text-[11px] font-bold">
                                +{mgr.assignedProperties.length - 3} more
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    {/* Bottom Action Buttons (Target 3-click workflows) */}
                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-line flex-wrap">
                      <button
                        type="button"
                        onClick={() => setPermissionsManager(mgr)}
                        className="px-3.5 py-1.5 rounded-full border border-line bg-surface text-ink hover:bg-surface-2 font-label text-xs font-semibold transition-colors inline-flex items-center gap-1"
                      >
                        <span className="material-symbols-outlined text-[14px]">tune</span>
                        <span>Permissions</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setManagePropsManager(mgr)}
                        className="px-4 py-1.5 rounded-full bg-primary text-on-primary font-label text-xs font-bold shadow-sm hover:opacity-95 transition-opacity inline-flex items-center gap-1"
                      >
                        <span className="material-symbols-outlined text-[14px]">domain</span>
                        <span>Manage Properties</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ---------------------------------------------------------------------- */}
      {/* VIEW 2: BY PROPERTY */}
      {/* ---------------------------------------------------------------------- */}
      {view === 'property' && (
        <div className="flex flex-col gap-3">
          {filteredProperties.length === 0 ? (
            <div className="bg-surface border border-line rounded-2xl p-8 text-center flex flex-col items-center gap-3">
              <span className="material-symbols-outlined text-ink-2 text-[44px]">apartment</span>
              <div>
                <p className="font-bold text-ink text-sm">No properties found</p>
                <p className="text-xs text-ink-2 mt-0.5">Create your first PG property to assign managers.</p>
              </div>
              <button
                type="button"
                onClick={() => setAddPropertyModalOpen(true)}
                className="mt-1 inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-primary text-on-primary font-label text-xs font-bold shadow-sm hover:opacity-95"
              >
                <span className="material-symbols-outlined text-[18px]">domain_add</span>
                <span>+ Add PG Property</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {filteredProperties.map((prop) => {
                // Find primary & supporting managers for this property
                const propManagers = managers.filter((m) =>
                  m.assignedProperties.some((ap) => String(ap.id) === String(prop.id))
                );
                const primaryMgr = propManagers.find((m) =>
                  m.assignedProperties.some((ap) => String(ap.id) === String(prop.id) && ap.isPrimary)
                );
                const supportingMgrs = propManagers.filter((m) => m.id !== primaryMgr?.id);

                return (
                  <div
                    key={prop.id}
                    className="bg-surface border border-line rounded-2xl p-4 shadow-sm flex flex-col gap-3.5 hover:border-line/80 transition-colors"
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-surface-2 text-primary flex items-center justify-center shrink-0">
                          <span className="material-symbols-outlined text-[24px]">apartment</span>
                        </div>
                        <div>
                          <h3 className="font-title text-base font-bold text-ink">{prop.name}</h3>
                          <p className="text-xs text-ink-2">
                            {prop.address ? `${prop.address}, ${prop.city || ''}` : 'Primary Property'}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                          propManagers.length > 0
                            ? 'bg-success-soft text-on-success-soft'
                            : 'bg-warning-soft text-on-warning-soft'
                        }`}
                      >
                        {propManagers.length > 0 ? `${propManagers.length} Staff` : 'Self-Managed'}
                      </span>
                    </div>

                    {/* Manager Status Card */}
                    <div className="p-3 rounded-2xl bg-surface-2 border border-line flex flex-col gap-2">
                      {primaryMgr ? (
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2">
                            <span className="text-amber-500 text-sm">⭐</span>
                            <div className="flex flex-col">
                              <span className="text-xs font-bold text-ink">Primary: {primaryMgr.name}</span>
                              <span className="text-[11px] text-ink-2">+91 {primaryMgr.phone}</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setReplaceTargetProperty(prop)}
                            className="px-2.5 py-1 rounded-full bg-surface border border-line text-ink font-label text-[11px] font-semibold hover:bg-surface-2"
                          >
                            Replace
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-ink-2">You're currently managing this property yourself.</span>
                          <button
                            type="button"
                            onClick={() => setAddModalOpen(true)}
                            className="px-2.5 py-1 rounded-full bg-primary-soft text-primary font-label text-[11px] font-bold hover:opacity-90"
                          >
                            + Assign Manager
                          </button>
                        </div>
                      )}

                      {/* Supporting managers list */}
                      {supportingMgrs.length > 0 && (
                        <div className="flex items-center gap-1.5 pt-1 border-t border-line/60 flex-wrap text-xs">
                          <span className="text-ink-2 text-[11px]">Supporting:</span>
                          {supportingMgrs.map((sm) => (
                            <span
                              key={sm.id}
                              className="px-2 py-0.5 rounded-lg bg-surface border border-line text-ink text-[11px] font-medium"
                            >
                              {sm.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-2 pt-1 border-t border-line flex-wrap">
                      <button
                        type="button"
                        onClick={() => setAddModalOpen(true)}
                        className="px-3.5 py-1.5 rounded-full border border-line bg-surface text-ink hover:bg-surface-2 font-label text-xs font-semibold inline-flex items-center gap-1"
                      >
                        <span className="material-symbols-outlined text-[14px]">person_add</span>
                        <span>Add Another Manager</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setReplaceTargetProperty(prop)}
                        className="px-4 py-1.5 rounded-full bg-primary text-on-primary font-label text-xs font-bold shadow-sm hover:opacity-95 inline-flex items-center gap-1"
                      >
                        <span className="material-symbols-outlined text-[14px]">swap_horiz</span>
                        <span>Manage Staff</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ---------------------------------------------------------------------- */}
      {/* MODAL 1: SMART ADD MANAGER MODAL (Single screen, minimum clicks)        */}
      {/* ---------------------------------------------------------------------- */}
      <SmartAddManagerModal
        isOpen={addModalOpen}
        properties={properties}
        onClose={() => setAddModalOpen(false)}
        onSuccess={(text) => {
          setMsg({ text, bad: false });
          reload();
        }}
      />

      {/* ---------------------------------------------------------------------- */}
      {/* MODAL 2: MANAGE PROPERTIES MODAL (Target 3-click workflow)             */}
      {/* ---------------------------------------------------------------------- */}
      <ManagePropertiesModal
        manager={managePropsManager}
        allProperties={properties}
        isOpen={!!managePropsManager}
        onClose={() => setManagePropsManager(null)}
        onSuccess={(text) => {
          setMsg({ text, bad: false });
          reload();
        }}
      />

      {/* ---------------------------------------------------------------------- */}
      {/* MODAL 3: PERMISSIONS MODAL                                             */}
      {/* ---------------------------------------------------------------------- */}
      <EditPermissionsModal
        manager={permissionsManager}
        isOpen={!!permissionsManager}
        onClose={() => setPermissionsManager(null)}
        onSuccess={(text) => {
          setMsg({ text, bad: false });
          reload();
        }}
      />

      {/* ---------------------------------------------------------------------- */}
      {/* MODAL 4: REPLACE MANAGER MODAL                                         */}
      {/* ---------------------------------------------------------------------- */}
      <ReplaceManagerModal
        property={replaceTargetProperty}
        managers={managers}
        isOpen={!!replaceTargetProperty}
        onClose={() => setReplaceTargetProperty(null)}
        onSuccess={(text) => {
          setMsg({ text, bad: false });
          reload();
        }}
      />

      {/* ---------------------------------------------------------------------- */}
      {/* MODAL 5: ACTIVITY AUDIT LOG MODAL                                      */}
      {/* ---------------------------------------------------------------------- */}
      <ManagerActivityModal
        manager={activityManager}
        isOpen={!!activityManager}
        onClose={() => setActivityManager(null)}
      />

      {/* ---------------------------------------------------------------------- */}
      {/* MODAL 6: ADD PROPERTY MODAL                                            */}
      {/* ---------------------------------------------------------------------- */}
      <AddPropertyModal
        managers={managers}
        isOpen={addPropertyModalOpen}
        onClose={() => setAddPropertyModalOpen(false)}
        onSuccess={(text) => {
          setMsg({ text, bad: false });
          reload();
        }}
      />
    </div>
  );
}

// =============================================================================
// SUB-COMPONENT: SmartAddManagerModal (Single Screen, Minimum Clicks)
// =============================================================================
function SmartAddManagerModal({ isOpen, properties = [], onClose, onSuccess }) {
  if (!isOpen) return null;

  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [lookupBusy, setLookupBusy] = useState(false);
  const [existingUser, setExistingUser] = useState(null);

  // Property multi-select
  const [selectedProps, setSelectedProps] = useState(() =>
    properties.length === 1 ? [properties[0].id] : []
  );
  const [propSearch, setPropSearch] = useState('');

  // Permissions & Primary
  const [permissionPreset, setPermissionPreset] = useState('full'); // 'full' | 'caretaker' | 'custom'
  const [isPrimary, setIsPrimary] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [customPerms, setCustomPerms] = useState({
    finances: { viewFinancials: true, recordPayments: true, sendReminders: true, viewPaymentHistory: true, recordElectricity: true },
    roomsAndBeds: { viewOccupancy: true, manageRooms: true, manageBeds: true, allotBeds: true },
    tenants: { viewTenants: true, onboardTenants: true, manageVerification: true, issueNotices: true, initiateCheckout: true },
    dailyOperations: { approveOutpasses: true, manageMaintenance: true, sendAnnouncements: true },
  });

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Auto-lookup phone number
  const handlePhoneChange = async (val) => {
    const cleaned = val.replace(/\D/g, '').slice(0, 10);
    setPhone(cleaned);
    if (cleaned.length === 10) {
      setLookupBusy(true);
      try {
        const res = await api(`/owner/managers/lookup?phone=${cleaned}`);
        if (res.exists) {
          setExistingUser(res);
          if (res.name && !name) setName(res.name);
          if (res.email && !email) setEmail(res.email);
          if (res.currentPropertyIds?.length) {
            setSelectedProps((prev) => Array.from(new Set([...prev, ...res.currentPropertyIds])));
          }
        } else {
          setExistingUser(null);
        }
      } catch {
        // ignore lookup error
      } finally {
        setLookupBusy(false);
      }
    } else {
      setExistingUser(null);
    }
  };

  const toggleProp = (pid) => {
    setSelectedProps((prev) =>
      prev.includes(pid) ? prev.filter((id) => id !== pid) : [...prev, pid]
    );
  };

  const handleSelectAll = () => setSelectedProps(properties.map((p) => p.id));
  const handleDeselectAll = () => setSelectedProps([]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (phone.length !== 10) {
      setError('Please enter a valid 10-digit mobile number');
      return;
    }
    if (!name.trim()) {
      setError('Manager full name is required');
      return;
    }
    if (selectedProps.length === 0) {
      setError('Please select at least one property to assign');
      return;
    }

    setBusy(true);
    setError('');

    try {
      const payload = {
        phone,
        name: name.trim(),
        email: email.trim(),
        propertyAssignments: selectedProps.map((pid) => ({
          propertyId: pid,
          isPrimary,
          permissionPreset,
          customPermissions: permissionPreset === 'custom' ? customPerms : undefined,
        })),
        permissionPreset,
        isPrimary,
      };

      const res = await api('/owner/managers', {
        method: 'POST',
        body: payload,
      });

      onSuccess(res.message || `Manager ${name.trim()} assigned to ${selectedProps.length} properties ✓`);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save manager assignment');
    } finally {
      setBusy(false);
    }
  };

  const filteredPropsList = properties.filter((p) =>
    !propSearch || p.name.toLowerCase().includes(propSearch.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div
        className="w-full max-w-2xl bg-surface rounded-3xl shadow-2xl border border-line flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-line flex items-center justify-between bg-surface-2/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-primary-soft text-primary flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[22px]">person_add</span>
            </div>
            <div>
              <h2 className="font-title text-base font-bold text-ink">
                {existingUser ? `Add ${existingUser.name || 'Manager'} to PGs` : 'Add or Invite Manager'}
              </h2>
              <p className="font-body text-xs text-ink-2">One Account · Multiple Property Assignments · Role Presets</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-surface-2 flex items-center justify-center text-ink-2 hover:text-ink text-sm transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Form */}
        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 p-5 sm:p-6 flex flex-col gap-5">
          {error && (
            <div className="p-3.5 rounded-2xl bg-danger-soft text-on-danger-soft text-xs font-semibold flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]">error</span>
              <span>{error}</span>
            </div>
          )}

          {/* 1. Manager Details */}
          <div className="flex flex-col gap-3">
            <span className="font-label text-xs font-bold text-primary uppercase tracking-wider">
              1. Manager Information
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="font-label text-xs font-semibold text-ink-2">Mobile Number (WhatsApp)</span>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-ink-2">+91</span>
                  <input
                    type="tel"
                    required
                    maxLength={10}
                    value={phone}
                    onChange={(e) => handlePhoneChange(e.target.value)}
                    placeholder="10-digit number"
                    className="w-full pl-11 pr-8 py-2.5 rounded-xl bg-surface border border-line text-ink font-bold text-sm tabular-nums focus:border-primary focus:outline-none"
                  />
                  {lookupBusy && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-primary animate-spin">⌛</span>
                  )}
                </div>
              </label>

              <label className="flex flex-col gap-1">
                <span className="font-label text-xs font-semibold text-ink-2">Full Name</span>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Rahul Sharma"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface border border-line text-ink font-bold text-sm focus:border-primary focus:outline-none"
                />
              </label>
            </div>

            {existingUser && (
              <div className="p-3 rounded-2xl bg-primary-soft/40 border border-primary-soft text-xs text-primary flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]">account_circle</span>
                <span>
                  <strong>Existing Manager Recognized:</strong> This account will be linked to selected PGs without duplicating credentials.
                </span>
              </div>
            )}
          </div>

          {/* 2. Property Multi-Select */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="font-label text-xs font-bold text-primary uppercase tracking-wider">
                2. Property Assignments ({selectedProps.length} selected)
              </span>
              <div className="flex items-center gap-2 text-xs font-semibold">
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="text-primary hover:underline"
                >
                  Select All
                </button>
                <span className="text-line">·</span>
                <button
                  type="button"
                  onClick={handleDeselectAll}
                  className="text-ink-2 hover:underline"
                >
                  Deselect All
                </button>
              </div>
            </div>

            {/* Properties List */}
            <div className="border border-line rounded-2xl overflow-hidden divide-y divide-line max-h-52 overflow-y-auto bg-surface">
              {filteredPropsList.map((p) => {
                const isChecked = selectedProps.includes(p.id);
                return (
                  <label
                    key={p.id}
                    className={`flex items-center justify-between p-3 cursor-pointer hover:bg-surface-2 transition-colors ${
                      isChecked ? 'bg-primary-soft/20' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleProp(p.id)}
                        className="w-4 h-4 rounded text-primary focus:ring-primary accent-primary"
                      />
                      <div className="flex flex-col">
                        <span className="font-bold text-xs text-ink">{p.name}</span>
                        <span className="text-[11px] text-ink-2">{p.address || 'Campus Location'}</span>
                      </div>
                    </div>
                    <span className="text-[10px] text-ink-2 font-medium bg-surface-2 px-2 py-0.5 rounded-full border border-line">
                      {p.isManaged ? 'Has staff' : 'Unassigned'}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* 3. Permission Presets */}
          <div className="flex flex-col gap-3">
            <span className="font-label text-xs font-bold text-primary uppercase tracking-wider">
              3. Permission Preset
            </span>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'full', label: 'Full Manager', desc: 'Rent, onboarding, outpasses, meter & beds' },
                { id: 'caretaker', label: 'Caretaker', desc: 'Outpasses, meter & occupancy (No finance)' },
                { id: 'custom', label: 'Custom Access', desc: 'Granular switches per department' },
              ].map((pst) => (
                <button
                  key={pst.id}
                  type="button"
                  onClick={() => {
                    setPermissionPreset(pst.id);
                    if (pst.id === 'custom') setShowCustom(true);
                  }}
                  className={`p-3 rounded-2xl border text-left flex flex-col gap-1 transition-all ${
                    permissionPreset === pst.id
                      ? 'border-primary bg-primary-soft/30 text-ink ring-2 ring-primary/20'
                      : 'border-line bg-surface text-ink-2 hover:text-ink'
                  }`}
                >
                  <span className="font-bold text-xs text-ink">{pst.label}</span>
                  <span className="text-[10px] opacity-80 leading-tight">{pst.desc}</span>
                </button>
              ))}
            </div>

            {/* Custom permissions toggles */}
            {permissionPreset === 'custom' && (
              <div className="p-4 rounded-2xl bg-surface-2 border border-line flex flex-col gap-3 animate-in fade-in duration-150">
                <span className="font-bold text-xs text-ink">Customize Permissions</span>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="flex flex-col gap-1.5">
                    <strong className="text-[11px] text-primary uppercase">Finances</strong>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={customPerms.finances.viewFinancials}
                        onChange={(e) => setCustomPerms({ ...customPerms, finances: { ...customPerms.finances, viewFinancials: e.target.checked } })}
                      />
                      <span>View Financials</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={customPerms.finances.recordPayments}
                        onChange={(e) => setCustomPerms({ ...customPerms, finances: { ...customPerms.finances, recordPayments: e.target.checked } })}
                      />
                      <span>Collect & Record Rent</span>
                    </label>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <strong className="text-[11px] text-primary uppercase">Tenants & Rooms</strong>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={customPerms.tenants.onboardTenants}
                        onChange={(e) => setCustomPerms({ ...customPerms, tenants: { ...customPerms.tenants, onboardTenants: e.target.checked } })}
                      />
                      <span>Onboard Tenants</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={customPerms.dailyOperations.approveOutpasses}
                        onChange={(e) => setCustomPerms({ ...customPerms, dailyOperations: { ...customPerms.dailyOperations, approveOutpasses: e.target.checked } })}
                      />
                      <span>Approve Outpasses</span>
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 4. Primary Manager Toggle */}
          <div className="p-3.5 rounded-2xl bg-surface-2 border border-line flex items-center justify-between gap-3">
            <div className="flex flex-col">
              <span className="font-bold text-xs text-ink">Designate as Primary Manager</span>
              <span className="text-[11px] text-ink-2">Primary manager receives escalation notices and daily alerts.</span>
            </div>
            <input
              type="checkbox"
              checked={isPrimary}
              onChange={(e) => setIsPrimary(e.target.checked)}
              className="w-5 h-5 rounded text-primary focus:ring-primary accent-primary"
            />
          </div>

          {/* Sticky Modal Footer CTA */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-line sticky bottom-0 bg-surface">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="px-5 py-2.5 rounded-full border border-line text-ink font-label text-xs font-semibold hover:bg-surface-2 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || phone.length !== 10 || !name.trim() || selectedProps.length === 0}
              className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-full bg-primary text-on-primary font-label text-xs font-bold shadow-sm hover:opacity-95 transition-opacity disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[16px]">check_circle</span>
              <span>
                {busy
                  ? 'Saving...'
                  : existingUser
                  ? `Save Assignments · ${selectedProps.length} Properties`
                  : `Invite Manager · ${selectedProps.length} Properties`}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// =============================================================================
// SUB-COMPONENT: ManagePropertiesModal (Target 3 Clicks Workflow)
// =============================================================================
function ManagePropertiesModal({ manager, allProperties = [], isOpen, onClose, onSuccess }) {
  if (!isOpen || !manager) return null;

  const currentAssIds = useMemo(() =>
    manager.assignedProperties?.map((p) => String(p.id)) || [],
    [manager]
  );

  const [selectedIds, setSelectedIds] = useState(currentAssIds);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const toggle = (pid) => {
    setSelectedIds((prev) =>
      prev.includes(pid) ? prev.filter((id) => id !== pid) : [...prev, pid]
    );
  };

  const handleSelectAll = () => setSelectedIds(allProperties.map((p) => String(p.id)));
  const handleDeselectAll = () => setSelectedIds([]);

  // Live change summary
  const adding = allProperties.filter((p) => selectedIds.includes(String(p.id)) && !currentAssIds.includes(String(p.id)));
  const removing = allProperties.filter((p) => !selectedIds.includes(String(p.id)) && currentAssIds.includes(String(p.id)));
  const retaining = allProperties.filter((p) => selectedIds.includes(String(p.id)) && currentAssIds.includes(String(p.id)));

  const handleSave = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');

    try {
      const res = await api(`/owner/managers/${manager.id}/properties`, {
        method: 'PUT',
        body: {
          properties: selectedIds.map((pid) => ({
            propertyId: pid,
            permissionPreset: manager.permissionRole === 'Caretaker' ? 'caretaker' : 'full',
          })),
        },
      });

      onSuccess(res.message || `Updated property assignments for ${manager.name} ✓`);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to update assignments');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div
        className="w-full max-w-lg bg-surface rounded-3xl shadow-2xl border border-line flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-line flex items-center justify-between bg-surface-2/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-primary-soft text-primary flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[22px]">domain</span>
            </div>
            <div>
              <h2 className="font-title text-base font-bold text-ink">Manage Properties</h2>
              <p className="font-body text-xs text-ink-2">Manager: {manager.name} (+91 {manager.phone})</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-full bg-surface-2 flex items-center justify-center text-ink-2 hover:text-ink text-sm">✕</button>
        </div>

        <form onSubmit={handleSave} className="overflow-y-auto flex-1 p-5 sm:p-6 flex flex-col gap-4">
          {error && (
            <div className="p-3.5 rounded-2xl bg-danger-soft text-on-danger-soft text-xs font-semibold">{error}</div>
          )}

          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-ink">Select Properties:</span>
            <div className="flex items-center gap-2 font-semibold">
              <button type="button" onClick={handleSelectAll} className="text-primary hover:underline">Select All</button>
              <span className="text-line">·</span>
              <button type="button" onClick={handleDeselectAll} className="text-ink-2 hover:underline">Deselect All</button>
            </div>
          </div>

          {/* Properties Checklist */}
          <div className="border border-line rounded-2xl divide-y divide-line max-h-56 overflow-y-auto bg-surface">
            {allProperties.map((p) => {
              const checked = selectedIds.includes(String(p.id));
              return (
                <label key={p.id} className={`flex items-center justify-between p-3 cursor-pointer hover:bg-surface-2 ${checked ? 'bg-primary-soft/15' : ''}`}>
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(String(p.id))}
                      className="w-4 h-4 rounded text-primary focus:ring-primary accent-primary"
                    />
                    <div className="flex flex-col">
                      <span className="font-bold text-xs text-ink">{p.name}</span>
                      <span className="text-[11px] text-ink-2">{p.address || 'Property'}</span>
                    </div>
                  </div>
                </label>
              );
            })}
          </div>

          {/* Live Change Summary */}
          <div className="p-3.5 rounded-2xl bg-surface-2 border border-line flex flex-col gap-1.5 text-xs">
            <span className="font-bold text-ink">Change Preview:</span>
            {adding.length > 0 && (
              <span className="text-success font-semibold">
                + Adding: {adding.map((p) => p.name).join(', ')}
              </span>
            )}
            {removing.length > 0 && (
              <span className="text-danger font-semibold">
                - Removing: {removing.map((p) => p.name).join(', ')}
              </span>
            )}
            <span className="text-ink-2">
              Retaining: {retaining.length} properties · Total after save: {selectedIds.length} properties
            </span>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-line">
            <button type="button" onClick={onClose} disabled={busy} className="px-5 py-2.5 rounded-full border border-line text-ink font-label text-xs font-semibold hover:bg-surface-2">
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="px-6 py-2.5 rounded-full bg-primary text-on-primary font-label text-xs font-bold shadow-sm hover:opacity-95 disabled:opacity-50"
            >
              {busy ? 'Saving...' : `Save Assignments (${selectedIds.length} PGs)`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// =============================================================================
// SUB-COMPONENT: EditPermissionsModal
// =============================================================================
function EditPermissionsModal({ manager, isOpen, onClose, onSuccess }) {
  if (!isOpen || !manager) return null;

  const [preset, setPreset] = useState(
    manager.permissionRole === 'Caretaker' ? 'caretaker' : manager.permissionRole === 'Custom Access' ? 'custom' : 'full'
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');

    try {
      await api(`/owner/managers/${manager.id}/permissions`, {
        method: 'PATCH',
        body: { permissionPreset: preset },
      });
      onSuccess(`Permissions updated to ${preset} for ${manager.name} ✓`);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to update permissions');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="w-full max-w-md bg-surface rounded-3xl shadow-2xl border border-line p-5 sm:p-6 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-200">
        <h3 className="font-title text-base font-bold text-ink">Change Permissions for {manager.name}</h3>
        {error && <div className="p-3 rounded-xl bg-danger-soft text-on-danger-soft text-xs font-semibold">{error}</div>}

        <div className="flex flex-col gap-2">
          {[
            { id: 'full', label: 'Full Manager', desc: 'Can manage rent, meter, outpasses, rooms, beds and tenants' },
            { id: 'caretaker', label: 'Caretaker', desc: 'Can record meter and approve outpasses (Financials restricted)' },
          ].map((p) => (
            <label
              key={p.id}
              className={`p-3 rounded-2xl border cursor-pointer flex items-start gap-3 ${
                preset === p.id ? 'border-primary bg-primary-soft/20 text-ink' : 'border-line bg-surface text-ink-2'
              }`}
            >
              <input
                type="radio"
                name="preset"
                checked={preset === p.id}
                onChange={() => setPreset(p.id)}
                className="mt-1 text-primary accent-primary"
              />
              <div className="flex flex-col">
                <span className="font-bold text-xs text-ink">{p.label}</span>
                <span className="text-[11px] opacity-80">{p.desc}</span>
              </div>
            </label>
          ))}
        </div>

        <div className="flex items-center justify-end gap-3 pt-2 border-t border-line">
          <button type="button" onClick={onClose} disabled={busy} className="px-4 py-2 rounded-full border border-line text-xs font-semibold text-ink">Cancel</button>
          <button type="button" onClick={handleSave} disabled={busy} className="px-5 py-2 rounded-full bg-primary text-on-primary text-xs font-bold shadow-sm hover:opacity-95">
            {busy ? 'Saving...' : 'Save Preset'}
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// SUB-COMPONENT: ReplaceManagerModal
// =============================================================================
function ReplaceManagerModal({ property, managers = [], isOpen, onClose, onSuccess }) {
  if (!isOpen || !property) return null;

  const currentPrimary = managers.find((m) =>
    m.assignedProperties.some((ap) => String(ap.id) === String(property.id) && ap.isPrimary)
  );
  const otherManagers = managers.filter((m) => m.id !== currentPrimary?.id);

  const [newManagerId, setNewManagerId] = useState(otherManagers[0]?.id || '');
  const [action, setAction] = useState('demote_to_supporting'); // 'demote_to_supporting' | 'remove_old'
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleReplace = async (e) => {
    e.preventDefault();
    if (!newManagerId) {
      setError('Please select a replacement manager');
      return;
    }
    setBusy(true);
    setError('');

    try {
      const res = await api('/owner/managers/replace', {
        method: 'POST',
        body: {
          propertyId: property.id,
          oldManagerId: currentPrimary?.id,
          newManagerId,
          action,
        },
      });
      onSuccess(res.message || 'Primary manager replaced successfully ✓');
      onClose();
    } catch (err) {
      setError(err.message || 'Replacement failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="w-full max-w-md bg-surface rounded-3xl shadow-2xl border border-line p-5 sm:p-6 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-200">
        <h3 className="font-title text-base font-bold text-ink">Replace Manager for {property.name}</h3>
        {error && <div className="p-3 rounded-xl bg-danger-soft text-on-danger-soft text-xs font-semibold">{error}</div>}

        {currentPrimary && (
          <div className="p-3 rounded-2xl bg-surface-2 border border-line text-xs flex flex-col gap-0.5">
            <span className="font-semibold text-ink-2">Current Primary Manager:</span>
            <span className="font-bold text-ink">{currentPrimary.name} (+91 {currentPrimary.phone})</span>
          </div>
        )}

        <label className="flex flex-col gap-1 text-xs">
          <span className="font-semibold text-ink-2">Select Replacement Manager:</span>
          <select
            value={newManagerId}
            onChange={(e) => setNewManagerId(e.target.value)}
            className="px-3.5 py-2.5 rounded-xl bg-surface border border-line text-ink font-semibold focus:border-primary focus:outline-none"
          >
            {otherManagers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} (+91 {m.phone})
              </option>
            ))}
          </select>
        </label>

        {currentPrimary && (
          <div className="flex flex-col gap-1.5 text-xs">
            <span className="font-semibold text-ink-2">What to do with {currentPrimary.name}?</span>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="oldAction"
                checked={action === 'demote_to_supporting'}
                onChange={() => setAction('demote_to_supporting')}
                className="accent-primary"
              />
              <span>Keep as Supporting Manager on {property.name}</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="oldAction"
                checked={action === 'remove_old'}
                onChange={() => setAction('remove_old')}
                className="accent-primary"
              />
              <span className="text-danger font-medium">Remove access from {property.name}</span>
            </label>
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-2 border-t border-line">
          <button type="button" onClick={onClose} disabled={busy} className="px-4 py-2 rounded-full border border-line text-xs font-semibold text-ink">Cancel</button>
          <button type="button" onClick={handleReplace} disabled={busy || !newManagerId} className="px-5 py-2 rounded-full bg-primary text-on-primary text-xs font-bold shadow-sm hover:opacity-95">
            {busy ? 'Replacing...' : 'Confirm Replacement'}
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// SUB-COMPONENT: ManagerActivityModal (Audit Logs)
// =============================================================================
function ManagerActivityModal({ manager, isOpen, onClose }) {
  if (!isOpen || !manager) return null;
  const { data, error } = useLoad(() => api(`/owner/managers/${manager.id}/activity`), [manager.id]);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="w-full max-w-lg bg-surface rounded-3xl shadow-2xl border border-line flex flex-col max-h-[85vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="px-6 py-4 border-b border-line flex items-center justify-between bg-surface-2/60 shrink-0">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-primary text-[22px]">history</span>
            <div>
              <h3 className="font-title text-base font-bold text-ink">Activity Timeline</h3>
              <p className="text-xs text-ink-2">{manager.name} · Audit History</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-full bg-surface-2 flex items-center justify-center text-ink-2 hover:text-ink text-sm">✕</button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 flex flex-col gap-3">
          {error && <ErrorBox text={error} />}
          {!data && <Loading />}
          {data && data.logs?.length === 0 && (
            <p className="text-xs text-ink-2 text-center py-6">No activity records logged yet for this manager.</p>
          )}
          {data?.logs?.map((log) => (
            <div key={log._id} className="p-3 rounded-2xl bg-surface-2 border border-line flex flex-col gap-1 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-ink capitalize">{log.actionType.replace(/_/g, ' ')}</span>
                <span className="text-[10px] text-ink-2 tabular-nums">{fmtDate(log.timestamp)} · {fmtTime(log.timestamp)}</span>
              </div>
              <p className="text-ink-2">{log.description}</p>
              {log.property && (
                <span className="text-[10px] font-semibold text-primary">PG: {log.property.name}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// SUB-COMPONENT: AddPropertyModal (Inline Manager Allotment)
// =============================================================================
function AddPropertyModal({ managers = [], isOpen, onClose, onSuccess }) {
  if (!isOpen) return null;

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [managerChoice, setManagerChoice] = useState('existing'); // 'existing' | 'new' | 'none'
  const [selectedManagerId, setSelectedManagerId] = useState(managers[0]?.id || '');
  const [newMgrName, setNewMgrName] = useState('');
  const [newMgrPhone, setNewMgrPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Property name is required');
      return;
    }

    setBusy(true);
    setError('');

    try {
      const payload = {
        name: name.trim(),
        address: address.trim(),
        city: city.trim(),
        managerId: managerChoice === 'existing' ? selectedManagerId : undefined,
        managerName: managerChoice === 'new' ? newMgrName.trim() : undefined,
        managerPhone: managerChoice === 'new' ? newMgrPhone.trim() : undefined,
      };

      const res = await api('/owner/properties', { method: 'POST', body: payload });
      onSuccess(`PG Property "${res.property.name}" created successfully ✓`);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to create property');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="w-full max-w-lg bg-surface rounded-3xl shadow-2xl border border-line flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="px-6 py-4 border-b border-line flex items-center justify-between bg-surface-2/60 shrink-0">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-primary text-[22px]">domain_add</span>
            <h2 className="font-title text-base font-bold text-ink">Add New PG Property</h2>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-full bg-surface-2 flex items-center justify-center text-ink-2 hover:text-ink text-sm">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 p-5 sm:p-6 flex flex-col gap-4">
          {error && <div className="p-3 rounded-2xl bg-danger-soft text-on-danger-soft text-xs font-semibold">{error}</div>}

          <label className="flex flex-col gap-1">
            <span className="font-label text-xs font-semibold text-ink-2">Property / PG Name</span>
            <input
              type="text"
              required
              placeholder="e.g. Green View Residency (Girls Wing)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="px-3.5 py-2.5 rounded-xl bg-surface border border-line text-ink font-bold text-sm focus:border-primary focus:outline-none"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="font-label text-xs font-semibold text-ink-2">Address / Landmark</span>
              <input
                type="text"
                placeholder="e.g. Near North Campus"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="px-3.5 py-2 rounded-xl bg-surface border border-line text-ink text-xs focus:border-primary focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-label text-xs font-semibold text-ink-2">City</span>
              <input
                type="text"
                placeholder="e.g. Delhi"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="px-3.5 py-2 rounded-xl bg-surface border border-line text-ink text-xs focus:border-primary focus:outline-none"
              />
            </label>
          </div>

          {/* Section: Assign Manager during creation */}
          <div className="flex flex-col gap-2 pt-1 border-t border-line">
            <span className="font-label text-xs font-bold text-primary uppercase">Assign Manager</span>
            <div className="flex flex-col gap-1.5 text-xs">
              {managers.length > 0 && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="mgrChoice"
                    checked={managerChoice === 'existing'}
                    onChange={() => setManagerChoice('existing')}
                    className="accent-primary"
                  />
                  <span>Select existing manager</span>
                </label>
              )}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="mgrChoice"
                  checked={managerChoice === 'new'}
                  onChange={() => setManagerChoice('new')}
                  className="accent-primary"
                />
                <span>Invite new manager</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="mgrChoice"
                  checked={managerChoice === 'none'}
                  onChange={() => setManagerChoice('none')}
                  className="accent-primary"
                />
                <span>I'll manage this property myself</span>
              </label>
            </div>

            {managerChoice === 'existing' && managers.length > 0 && (
              <select
                value={selectedManagerId}
                onChange={(e) => setSelectedManagerId(e.target.value)}
                className="mt-1 px-3.5 py-2 rounded-xl bg-surface border border-line text-xs font-semibold text-ink focus:border-primary focus:outline-none"
              >
                {managers.map((m) => (
                  <option key={m.id} value={m.id}>{m.name} (+91 {m.phone})</option>
                ))}
              </select>
            )}

            {managerChoice === 'new' && (
              <div className="grid grid-cols-2 gap-2 mt-1">
                <input
                  type="text"
                  placeholder="Manager Name"
                  value={newMgrName}
                  onChange={(e) => setNewMgrName(e.target.value)}
                  className="px-3 py-2 rounded-xl bg-surface border border-line text-xs focus:border-primary focus:outline-none"
                />
                <input
                  type="tel"
                  placeholder="10-digit Phone"
                  value={newMgrPhone}
                  onChange={(e) => setNewMgrPhone(e.target.value)}
                  className="px-3 py-2 rounded-xl bg-surface border border-line text-xs focus:border-primary focus:outline-none"
                />
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-line">
            <button type="button" onClick={onClose} disabled={busy} className="px-5 py-2.5 rounded-full border border-line text-xs font-semibold text-ink">Cancel</button>
            <button type="submit" disabled={busy || !name.trim()} className="px-6 py-2.5 rounded-full bg-primary text-on-primary text-xs font-bold shadow-sm hover:opacity-95 disabled:opacity-50">
              {busy ? 'Creating...' : 'Create PG Property'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
