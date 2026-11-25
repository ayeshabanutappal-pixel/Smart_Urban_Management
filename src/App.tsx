import { useCallback, useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { TopHeader } from './components/TopHeader';
import { DEFAULT_SETTINGS } from './data/seedData';
import { AdminComplaintsPage } from './pages/AdminComplaintsPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { AssignWorkersPage } from './pages/AssignWorkersPage';
import { AuthPage } from './pages/AuthPage';
import { DashboardPage } from './pages/DashboardPage';
import { DetectWastePage } from './pages/DetectWastePage';
import { ManageWorkersPage } from './pages/ManageWorkersPage';
import { MyComplaintsPage } from './pages/MyComplaintsPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { ProfilePage } from './pages/ProfilePage';
import { ReportGarbagePage } from './pages/ReportGarbagePage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';
import { TrackComplaintsPage } from './pages/TrackComplaintsPage';
import { WorkerDashboardPage } from './pages/WorkerDashboardPage';
import {
  checkFlaskHealth,
  clearStoredAuthToken,
  createWorkerOnFlask,
  type CreateComplaintDraft,
  type CreateWorkerDraft,
  fetchComplaints,
  fetchCurrentUser,
  fetchDashboardSummary,
  fetchNotifications,
  fetchWorkersFromFlask,
  getStoredAuthToken,
  logoutFromFlask,
  markAllNotificationsRead,
  markNotificationRead,
  resolveApiBaseUrl,
  setStoredAuthToken,
  submitComplaintToFlask,
  toggleWorkerActiveOnFlask,
  updateComplaintOnFlask,
  updateWorkerOnFlask,
  verifyComplaintOnFlask,
} from './services/flaskApi';
import type {
  AppSettings,
  BackendStatus,
  Complaint,
  ComplaintStatus,
  DashboardSummary,
  NotificationItem,
  PageRoute,
  UserProfile,
  WasteCategory,
  Worker,
} from './types/waste';

const STORAGE_KEYS = {
  rememberedEmail: 'wastesmart_remember_email_v1',
  settings: 'wastesmart_settings_v1',
};

const ADMIN_ONLY_PAGES: ReadonlySet<PageRoute> = new Set([
  'all-complaints',
  'assign-workers',
  'manage-workers',
  'analytics',
  'reports',
]);

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function loadNormalizedSettings(): AppSettings {
  const saved = readStorage<Partial<AppSettings>>(STORAGE_KEYS.settings, {});
  const merged: AppSettings = {
    ...DEFAULT_SETTINGS,
    ...(saved && typeof saved === 'object' ? saved : {}),
  };

  merged.flaskApiBaseUrl = resolveApiBaseUrl(merged.flaskApiBaseUrl);
  return merged;
}

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [authChecking, setAuthChecking] = useState<boolean>(() => Boolean(getStoredAuthToken()));

  const [rememberedEmail, setRememberedEmail] = useState<string>(() =>
    readStorage<string>(STORAGE_KEYS.rememberedEmail, '')
  );

  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [complaintsLoading, setComplaintsLoading] = useState(false);
  const [complaintsError, setComplaintsError] = useState<string | null>(null);

  const [workers, setWorkers] = useState<Worker[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [settings, setSettings] = useState<AppSettings>(() => loadNormalizedSettings());

  const [activePage, setActivePage] = useState<PageRoute>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');
  const [trackedComplaintId, setTrackedComplaintId] = useState<string | null>(null);
  const [reportPrefill, setReportPrefill] = useState<{
    imageUrl?: string;
    imageFile?: File | null;
    aiDetected?: boolean;
    category?: WasteCategory;
    confidence?: number;
    title?: string;
  } | null>(null);

  const [backendStatus, setBackendStatus] = useState<BackendStatus>({
    connected: false,
    mode: 'offline-local',
    lastCheckedAt: '--',
    message: 'Checking Flask API...',
  });

  // Live dashboard data from Flask /api/dashboard/summary
  const [dashboardSummary, setDashboardSummary] = useState<DashboardSummary | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  const resetUserWorkspaceState = useCallback(() => {
    setComplaints([]);
    setComplaintsLoading(false);
    setComplaintsError(null);
    setWorkers([]);
    setNotifications([]);
    setDashboardSummary(null);
    setDashboardLoading(false);
    setDashboardError(null);
    setTrackedComplaintId(null);
    setReportPrefill(null);
  }, []);

  const handleSessionExpired = useCallback(() => {
    clearStoredAuthToken();
    setUser(null);
    resetUserWorkspaceState();
    setActivePage('dashboard');
    setMobileMenuOpen(false);
  }, [resetUserWorkspaceState]);

  const loadWorkspaceData = useCallback(
    async (role: UserProfile['role'], showBlockingLoader = true) => {
      if (role === 'worker') {
        return;
      }
      if (showBlockingLoader) {
        setDashboardLoading(true);
        setComplaintsLoading(true);
      }
      setDashboardError(null);
      setComplaintsError(null);

      const summaryPromise = fetchDashboardSummary(
        settings.flaskApiBaseUrl,
        handleSessionExpired
      )
        .then((summary) => {
          setDashboardSummary(summary);
          setDashboardError(null);
        })
        .catch((err) => {
          setDashboardSummary(null);
          setDashboardError(
            err instanceof Error ? err.message : 'Unable to load dashboard summary.'
          );
        })
        .finally(() => {
          setDashboardLoading(false);
        });

      const complaintsPromise = fetchComplaints(
        settings.flaskApiBaseUrl,
        undefined,
        handleSessionExpired
      )
        .then((liveComplaints) => {
          setComplaints(liveComplaints);
          setComplaintsError(null);
        })
        .catch((err) => {
          setComplaintsError(
            err instanceof Error ? err.message : 'Unable to load complaints from server.'
          );
        })
        .finally(() => {
          setComplaintsLoading(false);
        });

      const notificationsPromise = fetchNotifications(
        settings.flaskApiBaseUrl,
        handleSessionExpired
      )
        .then(({ notifications: liveNotifs }) => {
          setNotifications(liveNotifs);
        })
        .catch(() => {
          // Notification failure does not block complaints or dashboard
        });

      const workersPromise =
        role === 'admin'
          ? fetchWorkersFromFlask(settings.flaskApiBaseUrl, handleSessionExpired, false)
              .then((liveWorkers) => {
                setWorkers(liveWorkers);
              })
              .catch(() => {
                setWorkers([]);
              })
          : Promise.resolve();

      await Promise.all([
        summaryPromise,
        complaintsPromise,
        notificationsPromise,
        workersPromise,
      ]);
    },
    [settings.flaskApiBaseUrl, handleSessionExpired]
  );

  // Verify stored JWT on mount by fetching authoritative user profile from /api/auth/me
  useEffect(() => {
    const token = getStoredAuthToken();
    if (!token) {
      setAuthChecking(false);
      return;
    }

    let active = true;
    void fetchCurrentUser(settings.flaskApiBaseUrl, token)
      .then((profile) => {
        if (active) setUser(profile);
      })
      .catch(() => {
        clearStoredAuthToken();
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setAuthChecking(false);
      });

    return () => {
      active = false;
    };
  }, [settings.flaskApiBaseUrl]);

  // Fetch live complaints, dashboard summary, notifications, and admin workers on login/refresh
  const currentUserId = user?.id ?? null;
  const currentUserRole = user?.role ?? null;
  useEffect(() => {
    if (!currentUserId || !currentUserRole) {
      resetUserWorkspaceState();
      return;
    }

    void loadWorkspaceData(currentUserRole, true);
  }, [currentUserId, currentUserRole, loadWorkspaceData, resetUserWorkspaceState]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
    } catch {
      // ignore
    }
  }, [settings]);

  // Check Flask backend health whenever the configured API URL changes
  useEffect(() => {
    let active = true;
    void checkFlaskHealth(settings.flaskApiBaseUrl).then((st) => {
      if (active) setBackendStatus(st);
    });
    return () => {
      active = false;
    };
  }, [settings.flaskApiBaseUrl, settings.useLiveFlaskApi]);

  const handleAuthenticated = (
    authenticatedUser: UserProfile,
    token: string,
    remember: boolean
  ) => {
    setStoredAuthToken(token, remember);
    setUser(authenticatedUser);
    setActivePage('dashboard');
    try {
      if (remember) {
        setRememberedEmail(authenticatedUser.email);
        window.localStorage.setItem(
          STORAGE_KEYS.rememberedEmail,
          JSON.stringify(authenticatedUser.email)
        );
      } else {
        setRememberedEmail('');
        window.localStorage.removeItem(STORAGE_KEYS.rememberedEmail);
      }
    } catch {
      // ignore
    }
  };

  const handleLogout = () => {
    const token = getStoredAuthToken();
    clearStoredAuthToken();
    void logoutFromFlask(settings.flaskApiBaseUrl, token);
    setUser(null);
    resetUserWorkspaceState();
    setActivePage('dashboard');
    setMobileMenuOpen(false);
  };

  const navigateWithRoleGuard = (page: PageRoute) => {
    if (user && ADMIN_ONLY_PAGES.has(page) && user.role !== 'admin') {
      setActivePage('dashboard');
      return;
    }
    setActivePage(page);
    if (user) {
      void loadWorkspaceData(user.role, false);
    }
  };

  const handleTrackComplaint = (complaintId: string) => {
    setTrackedComplaintId(complaintId);
    navigateWithRoleGuard('track-complaints');
  };

  const handleSubmitComplaint = async (draft: CreateComplaintDraft) => {
    const { savedToFlask, complaint } = await submitComplaintToFlask(
      settings.flaskApiBaseUrl,
      draft,
      handleSessionExpired
    );

    setComplaints((prev) => [complaint, ...prev.filter((c) => c.id !== complaint.id)]);
    setTrackedComplaintId(complaint.id);
    setReportPrefill(null);

    if (user) {
      void loadWorkspaceData(user.role, false);
    }

    return { complaint, savedToFlask };
  };

  const handleUpdateComplaint = async (
    complaintId: string,
    patch: {
      status?: ComplaintStatus;
      assignedWorkerId?: string | null;
      assignedWorkerName?: string | null;
    }
  ) => {
    const updatedComplaint = await updateComplaintOnFlask(
      settings.flaskApiBaseUrl,
      complaintId,
      patch,
      handleSessionExpired
    );

    setComplaints((prev) =>
      prev.map((c) => (c.id === updatedComplaint.id ? updatedComplaint : c))
    );

    if (user) {
      void loadWorkspaceData(user.role, false);
    }
  };

  const handleVerifyComplaint = async (
    complaintId: string,
    payload: { decision: 'approve' | 'reject'; note?: string; rejectionReason?: string }
  ) => {
    const updatedComplaint = await verifyComplaintOnFlask(
      settings.flaskApiBaseUrl,
      complaintId,
      payload,
      handleSessionExpired
    );

    setComplaints((prev) =>
      prev.map((c) => (c.id === updatedComplaint.id ? updatedComplaint : c))
    );

    if (user) {
      void loadWorkspaceData(user.role, false);
    }
  };

  const handleMarkNotificationRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
    void markNotificationRead(settings.flaskApiBaseUrl, id, handleSessionExpired).catch(() => {});
  };

  const handleMarkAllNotificationsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    void markAllNotificationsRead(settings.flaskApiBaseUrl, handleSessionExpired).catch(() => {});
  };

  /**
   * Refresh the full worker list from Flask (all workers, active + inactive)
   * so the Manage Workers page always shows the latest state.
   */
  const refreshAllWorkers = useCallback(() => {
    if (user?.role !== 'admin') return;
    void fetchWorkersFromFlask(settings.flaskApiBaseUrl, handleSessionExpired, false)
      .then((w) => setWorkers(w))
      .catch(() => {});
  }, [settings.flaskApiBaseUrl, handleSessionExpired, user?.role]);

  const handleCreateWorker = async (draft: CreateWorkerDraft) => {
    const newWorker = await createWorkerOnFlask(
      settings.flaskApiBaseUrl,
      draft,
      handleSessionExpired
    );
    setWorkers((prev) => [...prev, newWorker]);
    return newWorker;
  };

  const handleUpdateWorkerDetails = async (
    workerId: string,
    patch: Partial<CreateWorkerDraft>
  ) => {
    const updated = await updateWorkerOnFlask(
      settings.flaskApiBaseUrl,
      workerId,
      patch,
      handleSessionExpired
    );
    setWorkers((prev) => prev.map((w) => (w.id === updated.id ? updated : w)));
    return updated;
  };

  const handleToggleWorkerActive = async (workerId: string, isActive: boolean) => {
    const updated = await toggleWorkerActiveOnFlask(
      settings.flaskApiBaseUrl,
      workerId,
      isActive,
      handleSessionExpired
    );
    setWorkers((prev) => prev.map((w) => (w.id === updated.id ? updated : w)));
    return updated;
  };

  const handleUpdateProfile = (patch: Partial<UserProfile>) => {
    setUser((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const handleUpdateSettings = (patch: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      if (patch.flaskApiBaseUrl !== undefined) {
        next.flaskApiBaseUrl = resolveApiBaseUrl(patch.flaskApiBaseUrl);
      }
      return next;
    });
  };

  const handleTestBackend = async (url: string) => {
    const st = await checkFlaskHealth(resolveApiBaseUrl(url));
    setBackendStatus(st);
    return st;
  };

  const handleResetDemoData = () => {
    if (user) {
      void loadWorkspaceData(user.role, true);
    }
  };

  if (authChecking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F5F8F6] px-4">
        <div className="flex items-center gap-3 rounded-2xl border border-[#DCE6E0] bg-white px-6 py-4 shadow-xs">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#064E3B] border-t-transparent" />
          <span className="text-sm font-semibold text-[#022C22]">
            Verifying WasteSmart session...
          </span>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <AuthPage
        flaskApiBaseUrl={settings.flaskApiBaseUrl}
        onAuthenticated={handleAuthenticated}
        initialRememberedEmail={rememberedEmail}
      />
    );
  }

  if (user.role === 'worker') {
    return (
      <WorkerDashboardPage
        user={user}
        flaskApiBaseUrl={settings.flaskApiBaseUrl}
        onUserUpdated={setUser}
        onSessionExpired={handleSessionExpired}
        onLogout={handleLogout}
      />
    );
  }

  const visibleNotifications = notifications.filter(
    (n) => n.audience === 'all' || n.audience === user.role
  );
  const unreadNotificationsCount = visibleNotifications.filter((n) => !n.read).length;

  return (
    <div className="min-h-screen bg-[#F5F8F6] text-[#1F2937]">
      <Sidebar
        role={user.role}
        activePage={activePage}
        unreadNotifications={unreadNotificationsCount}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
        onNavigate={navigateWithRoleGuard}
        onLogout={handleLogout}
      />

      <div className="flex min-h-screen flex-col lg:pl-64">
        <TopHeader
          user={user}
          activePage={activePage}
          searchQuery={globalSearch}
          onSearchChange={setGlobalSearch}
          onSearchSubmit={() => {
            navigateWithRoleGuard(user.role === 'admin' ? 'all-complaints' : 'my-complaints');
          }}
          notifications={visibleNotifications}
          backendStatus={backendStatus}
          onMarkNotificationRead={handleMarkNotificationRead}
          onNavigate={navigateWithRoleGuard}
          onLogout={handleLogout}
          onToggleMobileMenu={() => setMobileMenuOpen((o) => !o)}
        />

        <main className="mx-auto w-full max-w-[1360px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {activePage === 'dashboard' && (
            <DashboardPage
              user={user}
              complaints={complaints}
              dashboardSummary={dashboardSummary}
              dashboardLoading={dashboardLoading}
              dashboardError={dashboardError}
              onRetryDashboard={() => void loadWorkspaceData(user.role, true)}
              onNavigate={navigateWithRoleGuard}
              onTrackComplaint={handleTrackComplaint}
            />
          )}

          {activePage === 'report-garbage' && (
            <ReportGarbagePage
              user={user}
              flaskApiBaseUrl={settings.flaskApiBaseUrl}
              useLiveFlaskApi={settings.useLiveFlaskApi}
              onSessionExpired={handleSessionExpired}
              prefillData={reportPrefill}
              onSubmitComplaint={handleSubmitComplaint}
              onTrackComplaint={handleTrackComplaint}
            />
          )}

          {activePage === 'detect-waste' && (
            <DetectWastePage
              flaskApiBaseUrl={settings.flaskApiBaseUrl}
              onSessionExpired={handleSessionExpired}
              onReportWithDetection={(payload) => {
                setReportPrefill(payload);
                navigateWithRoleGuard('report-garbage');
              }}
            />
          )}

          {activePage === 'my-complaints' && (
            <MyComplaintsPage
              user={user}
              complaints={complaints}
              globalSearch={globalSearch}
              loading={complaintsLoading}
              error={complaintsError}
              onRetry={() => void loadWorkspaceData(user.role, true)}
              onTrackComplaint={handleTrackComplaint}
              onNavigate={navigateWithRoleGuard}
            />
          )}

          {activePage === 'all-complaints' && user.role === 'admin' && (
            <AdminComplaintsPage
              complaints={complaints}
              workers={workers}
              globalSearch={globalSearch}
              compactTables={settings.compactTables}
              flaskApiBaseUrl={settings.flaskApiBaseUrl}
              loading={complaintsLoading}
              error={complaintsError}
              onRetry={() => void loadWorkspaceData(user.role, true)}
              onUpdateComplaint={handleUpdateComplaint}
              onVerifyComplaint={handleVerifyComplaint}
              onTrackComplaint={handleTrackComplaint}
            />
          )}

          {activePage === 'track-complaints' && (
            <TrackComplaintsPage
              complaints={complaints}
              selectedComplaintId={trackedComplaintId}
              onSelectComplaintId={setTrackedComplaintId}
              backendStatus={backendStatus}
              loading={complaintsLoading}
              error={complaintsError}
              onRetry={() => void loadWorkspaceData(user.role, true)}
              flaskApiBaseUrl={settings.flaskApiBaseUrl}
              onSessionExpired={handleSessionExpired}
            />
          )}

          {activePage === 'assign-workers' && user.role === 'admin' && (
            <AssignWorkersPage
              workers={workers.filter((w) => w.isActive)}
              complaints={complaints}
              onAssignWorker={(complaintId, workerId, workerName, status) =>
                handleUpdateComplaint(complaintId, {
                  assignedWorkerId: workerId,
                  assignedWorkerName: workerName,
                  status,
                })
              }
            />
          )}

          {activePage === 'analytics' && user.role === 'admin' && (
            <AnalyticsPage complaints={complaints} />
          )}

          {activePage === 'manage-workers' && user.role === 'admin' && (
            <ManageWorkersPage
              workers={workers}
              flaskApiBaseUrl={settings.flaskApiBaseUrl}
              onCreateWorker={handleCreateWorker}
              onUpdateWorker={handleUpdateWorkerDetails}
              onToggleActive={handleToggleWorkerActive}
              onWorkerListChanged={refreshAllWorkers}
            />
          )}

          {activePage === 'reports' && user.role === 'admin' && (
            <ReportsPage complaints={complaints} />
          )}

          {activePage === 'notifications' && (
            <NotificationsPage
              notifications={visibleNotifications}
              onMarkRead={handleMarkNotificationRead}
              onMarkAllRead={handleMarkAllNotificationsRead}
              onTrackComplaint={handleTrackComplaint}
            />
          )}

          {activePage === 'profile' && (
            <ProfilePage
              user={user}
              complaints={complaints}
              onUpdateProfile={handleUpdateProfile}
              onNavigate={setActivePage}
            />
          )}

          {activePage === 'settings' && (
            <SettingsPage
              user={user}
              settings={settings}
              backendStatus={backendStatus}
              onUpdateProfile={handleUpdateProfile}
              onUpdateSettings={handleUpdateSettings}
              onTestBackend={handleTestBackend}
              onResetDemoData={handleResetDemoData}
              onLogout={handleLogout}
            />
          )}
        </main>
      </div>
    </div>
  );
}
