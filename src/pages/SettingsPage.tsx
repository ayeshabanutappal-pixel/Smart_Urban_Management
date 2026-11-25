import { useState } from 'react';
import {
  Bell,
  CheckCircle2,
  Loader2,
  Lock,
  Palette,
  RefreshCw,
  Server,
  User,
} from 'lucide-react';
import type { AppSettings, BackendStatus, UserProfile } from '../types/waste';

interface SettingsPageProps {
  user: UserProfile;
  settings: AppSettings;
  backendStatus: BackendStatus;
  onUpdateProfile: (patch: Partial<UserProfile>) => void;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  onTestBackend: (url: string) => Promise<BackendStatus>;
  onResetDemoData: () => void;
  onLogout: () => void;
}

type SettingsTab = 'profile' | 'api' | 'notifications' | 'security' | 'appearance';

export function SettingsPage({
  user,
  settings,
  backendStatus,
  onUpdateProfile,
  onUpdateSettings,
  onTestBackend,
  onResetDemoData,
  onLogout,
}: SettingsPageProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Profile fields
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone);
  const [ward, setWard] = useState(user.ward);

  // Flask API fields
  const [apiUrl, setApiUrl] = useState(settings.flaskApiBaseUrl);
  const [testingApi, setTestingApi] = useState(false);

  // Security fields (never persisted to localStorage)
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [pwdError, setPwdError] = useState<string | null>(null);

  const flashNotice = (msg: string) => {
    setStatusMessage(msg);
    window.setTimeout(() => setStatusMessage(null), 3500);
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onUpdateProfile({ name: name.trim(), phone: phone.trim(), ward: ward.trim() });
    flashNotice('Profile information saved.');
  };

  const handleSaveAndTestApi = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = apiUrl.trim().replace(/\/+$/, '') || 'http://127.0.0.1:5000';
    const normalized =
      cleaned === 'http://localhost:5000' ? 'http://127.0.0.1:5000' : cleaned;
    setApiUrl(normalized);
    onUpdateSettings({ flaskApiBaseUrl: normalized });
    setTestingApi(true);
    try {
      const res = await onTestBackend(normalized);
      flashNotice(res.message);
    } finally {
      setTestingApi(false);
    }
  };

  const handlePasswordChange = (e: React.FormEvent) => {
    e.preventDefault();
    setPwdError(null);
    if (!currentPwd || newPwd.length < 6) {
      setPwdError('Enter your current password and a new password of at least 6 characters.');
      return;
    }
    if (newPwd !== confirmPwd) {
      setPwdError('New password and confirmation do not match.');
      return;
    }
    setCurrentPwd('');
    setNewPwd('');
    setConfirmPwd('');
    flashNotice('Password update request validated (session-only — backend endpoint required for persistence).');
  };

  const tabs: Array<{
    id: SettingsTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'api', label: 'Flask API Integration', icon: Server },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'security', label: 'Security', icon: Lock },
    { id: 'appearance', label: 'Appearance & Account', icon: Palette },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h2 className="font-display text-2xl font-extrabold text-[#022C22]">Settings</h2>
          <p className="mt-1 text-sm text-[#4B5563]">
            Configure your account profile, Flask &amp; YOLO backend URL, alerts, and display
            preferences.
          </p>
        </div>
        {statusMessage && (
          <div
            role="status"
            className="inline-flex items-center gap-2 rounded-xl border border-[#A7F3D0] bg-[#ECFDF5] px-4 py-2 text-xs font-semibold text-[#064E3B]"
          >
            <CheckCircle2 className="h-4 w-4 text-[#059669]" />
            <span>{statusMessage}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Settings Navigation Column */}
        <aside className="rounded-2xl border border-[#E2EAE5] bg-white p-3 lg:col-span-3 self-start">
          <nav aria-label="Settings sections" className="space-y-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-left text-xs font-semibold transition-colors ${
                    active
                      ? 'bg-[#064E3B] text-white'
                      : 'text-[#374151] hover:bg-[#F5F8F6] hover:text-[#022C22]'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Active Settings Content Panel */}
        <section className="rounded-2xl border border-[#E2EAE5] bg-white p-6 lg:col-span-9">
          {activeTab === 'profile' && (
            <form onSubmit={handleSaveProfile} className="space-y-5">
              <div>
                <h3 className="font-display text-base font-bold text-[#022C22]">
                  Profile Details
                </h3>
                <p className="text-xs text-[#6B7280]">
                  Updates apply immediately across your sidebar, header, and newly submitted
                  complaints.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="set-name" className="block text-xs font-semibold text-[#374151]">
                    Full Name
                  </label>
                  <input
                    id="set-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-[#DCE6E0] bg-[#F9FBFA] px-4 py-2.5 text-sm text-[#1F2937]"
                  />
                </div>
                <div>
                  <label
                    htmlFor="set-phone"
                    className="block text-xs font-semibold text-[#374151]"
                  >
                    Phone Number
                  </label>
                  <input
                    id="set-phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-[#DCE6E0] bg-[#F9FBFA] px-4 py-2.5 text-sm text-[#1F2937]"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="set-ward" className="block text-xs font-semibold text-[#374151]">
                  Assigned Ward / Neighborhood
                </label>
                <input
                  id="set-ward"
                  type="text"
                  value={ward}
                  onChange={(e) => setWard(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-[#DCE6E0] bg-[#F9FBFA] px-4 py-2.5 text-sm text-[#1F2937]"
                />
              </div>
              <button
                type="submit"
                className="rounded-xl bg-[#064E3B] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#022C22]"
              >
                Save Profile
              </button>
            </form>
          )}

          {activeTab === 'api' && (
            <form onSubmit={handleSaveAndTestApi} className="space-y-5">
              <div>
                <h3 className="font-display text-base font-bold text-[#022C22]">
                  Flask Backend &amp; YOLO AI API Connection
                </h3>
                <p className="mt-1 text-xs text-[#6B7280]">
                   Point WasteSmart to your team&apos;s Flask server (with MySQL + YOLO/OpenCV
                  endpoints). When unreachable, WasteSmart automatically runs in clearly labelled
                  Offline Mode.
                </p>
              </div>

              <div className="rounded-xl border border-[#DCE6E0] bg-[#F5F8F6] p-4 text-xs">
                <p className="font-semibold text-[#022C22]">
                  Current Mode:{' '}
                  <span
                    className={
                      backendStatus.connected ? 'text-[#059669]' : 'text-[#D97706]'
                    }
                  >
                    {backendStatus.connected ? 'Live Flask API' : 'Offline Mode (Local Fallback)'}
                  </span>
                </p>
                <p className="mt-1 text-[#4B5563]">{backendStatus.message}</p>
              </div>

              <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-[#E2EAE5] p-4">
                <div>
                  <p className="text-sm font-semibold text-[#1F2937]">
                    Enable Live Flask Backend Calls
                  </p>
                  <p className="text-xs text-[#6B7280]">
                    Turn on when your Flask + MySQL + YOLO server is running to send live requests.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.useLiveFlaskApi}
                  onChange={(e) => {
                    onUpdateSettings({ useLiveFlaskApi: e.target.checked });
                    flashNotice(
                      e.target.checked
                        ? 'Live Flask API mode enabled.'
                        : 'Switched to Offline Mode (Flask API disabled).'
                    );
                  }}
                  className="h-5 w-5 rounded accent-[#064E3B]"
                />
              </label>

              <div>
                <label htmlFor="flask-url" className="block text-xs font-semibold text-[#374151]">
                  Flask Server Base URL
                </label>
                <input
                  id="flask-url"
                  type="url"
                  value={apiUrl}
                  onChange={(e) => setApiUrl(e.target.value)}
                  placeholder="http://127.0.0.1:5000"
                  className="mt-1.5 w-full rounded-xl border border-[#DCE6E0] bg-[#F9FBFA] px-4 py-2.5 font-mono text-sm text-[#1F2937]"
                />
                <p className="mt-1.5 text-[11px] text-[#6B7280]">
                  Expected endpoints: <code className="font-mono">/api/health</code>,{' '}
                  <code className="font-mono">/api/auth/login</code>,{' '}
                  <code className="font-mono">/api/complaints</code>,{' '}
                  <code className="font-mono">/api/detect</code>
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={testingApi}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#064E3B] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#022C22] disabled:opacity-60"
                >
                  {testingApi && <Loader2 className="h-4 w-4 animate-spin" />}
                  <span>Save &amp; Test Connection</span>
                </button>
              </div>
            </form>
          )}

          {activeTab === 'notifications' && (
            <div className="space-y-5">
              <div>
                <h3 className="font-display text-base font-bold text-[#022C22]">
                  Notification Preferences
                </h3>
                <p className="text-xs text-[#6B7280]">
                  Control how you receive complaint status updates and municipal digests.
                </p>
              </div>

              <div className="divide-y divide-[#EEF3F0]">
                {[
                  {
                    key: 'emailAlerts' as const,
                    title: 'Email Complaint Confirmations',
                    desc: 'Receive ticket ID and confirmation whenever a new garbage report is filed.',
                  },
                  {
                    key: 'statusPushAlerts' as const,
                    title: 'Worker Dispatch & Resolution Alerts',
                    desc: 'Notify when an admin assigns a sanitation crew or resolves your complaint.',
                  },
                  {
                    key: 'weeklyDigest' as const,
                    title: 'Weekly Ward Cleanliness Summary',
                    desc: 'Receive a weekly sustainability summary of waste recycled in your ward.',
                  },
                ].map((pref) => (
                  <label
                    key={pref.key}
                    className="flex cursor-pointer items-center justify-between gap-4 py-4"
                  >
                    <div>
                      <p className="text-sm font-semibold text-[#1F2937]">{pref.title}</p>
                      <p className="text-xs text-[#6B7280]">{pref.desc}</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings[pref.key]}
                      onChange={(e) => {
                        onUpdateSettings({ [pref.key]: e.target.checked });
                        flashNotice('Notification preferences updated.');
                      }}
                      className="h-5 w-5 rounded accent-[#064E3B]"
                    />
                  </label>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <form onSubmit={handlePasswordChange} className="space-y-4 max-w-md">
              <div>
                <h3 className="font-display text-base font-bold text-[#022C22]">
                  Password &amp; Account Security
                </h3>
                <p className="text-xs text-[#6B7280]">
                  Passwords are never stored in browser localStorage.
                </p>
              </div>

              {pwdError && (
                <p
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700"
                >
                  {pwdError}
                </p>
              )}

              <div>
                <label htmlFor="cur-pwd" className="block text-xs font-semibold text-[#374151]">
                  Current Password
                </label>
                <input
                  id="cur-pwd"
                  type="password"
                  value={currentPwd}
                  onChange={(e) => setCurrentPwd(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-[#DCE6E0] bg-[#F9FBFA] px-4 py-2.5 text-sm"
                />
              </div>
              <div>
                <label htmlFor="new-pwd" className="block text-xs font-semibold text-[#374151]">
                  New Password
                </label>
                <input
                  id="new-pwd"
                  type="password"
                  value={newPwd}
                  onChange={(e) => setNewPwd(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-[#DCE6E0] bg-[#F9FBFA] px-4 py-2.5 text-sm"
                />
              </div>
              <div>
                <label htmlFor="conf-pwd" className="block text-xs font-semibold text-[#374151]">
                  Confirm New Password
                </label>
                <input
                  id="conf-pwd"
                  type="password"
                  value={confirmPwd}
                  onChange={(e) => setConfirmPwd(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-[#DCE6E0] bg-[#F9FBFA] px-4 py-2.5 text-sm"
                />
              </div>
              <button
                type="submit"
                className="rounded-xl bg-[#064E3B] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#022C22]"
              >
                Update Password
              </button>
            </form>
          )}

          {activeTab === 'appearance' && (
            <div className="space-y-6">
              <div>
                <h3 className="font-display text-base font-bold text-[#022C22]">
                  Appearance &amp; Account Management
                </h3>
                <p className="text-xs text-[#6B7280]">
                  Customize table density or manage your local preview dataset and session.
                </p>
              </div>

              <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-[#E2EAE5] p-4">
                <div>
                  <p className="text-sm font-semibold text-[#1F2937]">Compact Data Tables</p>
                  <p className="text-xs text-[#6B7280]">
                    Reduce vertical padding in Admin Complaint Management rows to view more tickets
                    at once.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.compactTables}
                  onChange={(e) => {
                    onUpdateSettings({ compactTables: e.target.checked });
                    flashNotice('Table density preference saved.');
                  }}
                  className="h-5 w-5 rounded accent-[#064E3B]"
                />
              </label>

              <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#E2EAE5] bg-[#F9FBFA] p-4">
                <div>
                  <p className="text-sm font-semibold text-[#022C22]">Reload Local Defaults</p>
                  <p className="text-xs text-[#6B7280]">
                    Restore default sample municipal complaints and notifications in localStorage.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onResetDemoData();
                    flashNotice('Local defaults restored.');
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[#DCE6E0] bg-white px-4 py-2 text-xs font-semibold text-[#064E3B] hover:bg-[#ECFDF5]"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Reload Defaults</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-red-200 bg-red-50/50 p-4">
                <div>
                  <p className="text-sm font-semibold text-red-900">Sign Out of WasteSmart</p>
                  <p className="text-xs text-red-700">
                    End your current session and return to the Login screen.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onLogout}
                  className="rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700"
                >
                  Logout Now
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
