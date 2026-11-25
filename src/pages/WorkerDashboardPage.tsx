import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  ClipboardList,
  Clock,
  ExternalLink,
  Globe,
  Loader2,
  LogOut,
  MapPin,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Truck,
  Upload,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { WasteSmartLogo } from '../components/WasteSmartLogo';
import {
  getLanguageMeta,
  getWorkerStrings,
  isSpeechSupported,
  speakWorkerText,
  stopWorkerSpeech,
  WORKER_LANGUAGES,
} from '../i18n/workerLanguages';
import {
  completeWorkerTask,
  fetchWorkerTasks,
  saveLanguagePreferenceOnFlask,
  startWorkerTask,
} from '../services/flaskApi';
import type { Complaint, UserProfile, Worker } from '../types/waste';
import { formatDisplayTimestamp } from '../utils/wasteLogic';

type WorkerTab = 'assigned' | 'in-progress' | 'pending-verification' | 'completed';

const LANG_STORAGE_KEY = 'wastesmart_worker_lang_v1';
const VOICE_STORAGE_KEY = 'wastesmart_worker_voice_v1';

interface WorkerDashboardPageProps {
  user: UserProfile;
  flaskApiBaseUrl: string;
  onUserUpdated: (user: UserProfile) => void;
  onSessionExpired: () => void;
  onLogout: () => void;
}

export function WorkerDashboardPage({
  user,
  flaskApiBaseUrl,
  onUserUpdated,
  onSessionExpired,
  onLogout,
}: WorkerDashboardPageProps) {
  const [language, setLanguage] = useState<string>(() => {
    try {
      return user.preferredLanguage || window.localStorage.getItem(LANG_STORAGE_KEY) || 'en';
    } catch {
      return user.preferredLanguage || 'en';
    }
  });
  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(VOICE_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [langModalOpen, setLangModalOpen] = useState(false);
  const [langSearch, setLangSearch] = useState('');

  const [workerProfile, setWorkerProfile] = useState<Worker | null>(null);
  const [tasks, setTasks] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<WorkerTab>('assigned');
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);

  // Per-task completion draft state
  const [afterFiles, setAfterFiles] = useState<Record<string, File | null>>({});
  const [afterPreviews, setAfterPreviews] = useState<Record<string, string>>({});
  const [notesByTask, setNotesByTask] = useState<Record<string, string>>({});

  const cameraInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const t = useMemo(() => getWorkerStrings(language), [language]);
  const currentLangMeta = useMemo(() => getLanguageMeta(language), [language]);

  const loadTasks = useCallback(
    async (showLoader = false) => {
      if (showLoader) setLoading(true);
      setError(null);
      try {
        const res = await fetchWorkerTasks(flaskApiBaseUrl, onSessionExpired);
        setWorkerProfile(res.worker);
        setTasks(res.tasks);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load assigned tasks.');
      } finally {
        setLoading(false);
      }
    },
    [flaskApiBaseUrl, onSessionExpired]
  );

  useEffect(() => {
    void loadTasks(true);
    return () => {
      stopWorkerSpeech();
    };
  }, [loadTasks]);

  useEffect(() => {
    if (user.preferredLanguage && user.preferredLanguage !== language) {
      setLanguage(user.preferredLanguage);
      try {
        window.localStorage.setItem(LANG_STORAGE_KEY, user.preferredLanguage);
      } catch {
        // ignore storage errors
      }
    }
  }, [user.preferredLanguage, language]);

  const filteredLanguages = useMemo(() => {
    const q = langSearch.trim().toLowerCase();
    if (!q) return WORKER_LANGUAGES;
    return WORKER_LANGUAGES.filter(
      (l) =>
        l.englishName.toLowerCase().includes(q) ||
        l.nativeName.toLowerCase().includes(q) ||
        l.code.toLowerCase().includes(q)
    );
  }, [langSearch]);

  const handleSelectLanguage = async (code: string) => {
    setLanguage(code);
    setLangModalOpen(false);
    setLangSearch('');
    try {
      window.localStorage.setItem(LANG_STORAGE_KEY, code);
    } catch {
      // ignore
    }
    try {
      const updatedUser = await saveLanguagePreferenceOnFlask(
        flaskApiBaseUrl,
        code,
        onSessionExpired
      );
      onUserUpdated(updatedUser);
    } catch {
      // Keep local preference even if background save fails temporarily
    }
  };

  const toggleVoiceMode = () => {
    const next = !voiceEnabled;
    setVoiceEnabled(next);
    if (!next) {
      stopWorkerSpeech();
      setSpeakingId(null);
    }
    try {
      window.localStorage.setItem(VOICE_STORAGE_KEY, String(next));
    } catch {
      // ignore
    }
  };

  const handleSpeakTask = (task: Complaint) => {
    if (speakingId === task.id) {
      stopWorkerSpeech();
      setSpeakingId(null);
      return;
    }

    const actionHint =
      task.status === 'Assigned'
        ? t.startTask
        : task.status === 'In Progress'
        ? `${t.uploadAfterPhoto}. ${t.submitCompletion}`
        : task.status === 'Pending Verification'
        ? t.awaitingAdminReview
        : t.completedBadge;

    const reworkPart = task.rejectionReason
      ? `${t.rejectedBannerTitle} ${task.rejectionReason}. `
      : '';

    const spokenText = `${task.id}. ${t.categoryLabel}: ${task.category}. ${t.locationLabel}: ${task.locationName}, ${task.ward}. ${reworkPart}${actionHint}`;
    setSpeakingId(task.id);
    speakWorkerText(spokenText, language, () => {
      setSpeakingId((prev) => (prev === task.id ? null : prev));
    });
  };

  const grouped = useMemo(
    () => ({
      assigned: tasks.filter((item) => item.status === 'Assigned'),
      inProgress: tasks.filter((item) => item.status === 'In Progress'),
      pendingVerification: tasks.filter((item) => item.status === 'Pending Verification'),
      completed: tasks.filter((item) => item.status === 'Resolved'),
    }),
    [tasks]
  );

  const visibleTasks = useMemo(() => {
    switch (activeTab) {
      case 'assigned':
        return grouped.assigned;
      case 'in-progress':
        return grouped.inProgress;
      case 'pending-verification':
        return grouped.pendingVerification;
      case 'completed':
        return grouped.completed;
    }
  }, [activeTab, grouped]);

  const showNotice = (msg: string) => {
    setFeedback(msg);
    window.setTimeout(() => setFeedback(null), 3500);
  };

  const handleStartTask = async (task: Complaint) => {
    setError(null);
    setBusyTaskId(task.id);
    try {
      const updated = await startWorkerTask(flaskApiBaseUrl, task.id, onSessionExpired);
      setTasks((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setActiveTab('in-progress');
      showNotice(`${task.id}: ${t.inProgress}`);
      if (voiceEnabled) {
        speakWorkerText(`${task.id}. ${t.inProgress}. ${t.uploadAfterPhoto}.`, language);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start task.');
    } finally {
      setBusyTaskId(null);
    }
  };

  const handleAfterPhotoSelected = (taskId: string, file: File | undefined) => {
    if (!file) return;
    setError(null);
    setAfterFiles((prev) => ({ ...prev, [taskId]: file }));
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setAfterPreviews((prev) => ({ ...prev, [taskId]: reader.result as string }));
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmitCompletion = async (task: Complaint) => {
    const file = afterFiles[task.id] ?? null;
    const preview = afterPreviews[task.id];
    if (!file && !preview) {
      setError(`${task.id}: ${t.uploadAfterPhoto} is required.`);
      return;
    }
    setError(null);
    setBusyTaskId(task.id);
    try {
      const updated = await completeWorkerTask(
        flaskApiBaseUrl,
        task.id,
        {
          afterImageFile: file,
          afterImageUrl: file ? undefined : preview,
          completionNotes: notesByTask[task.id] ?? '',
        },
        onSessionExpired
      );
      setTasks((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setAfterFiles((prev) => {
        const copy = { ...prev };
        delete copy[task.id];
        return copy;
      });
      setAfterPreviews((prev) => {
        const copy = { ...prev };
        delete copy[task.id];
        return copy;
      });
      setActiveTab('pending-verification');
      showNotice(`${task.id}: ${t.awaitingAdminReview}`);
      if (voiceEnabled) {
        speakWorkerText(`${task.id}. ${t.awaitingAdminReview}.`, language);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit completion.');
    } finally {
      setBusyTaskId(null);
    }
  };

  const tabItems: Array<{
    id: WorkerTab;
    label: string;
    count: number;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: 'assigned', label: t.myTasks, count: grouped.assigned.length, icon: ClipboardList },
    { id: 'in-progress', label: t.inProgress, count: grouped.inProgress.length, icon: Truck },
    {
      id: 'pending-verification',
      label: t.pendingVerification,
      count: grouped.pendingVerification.length,
      icon: ShieldCheck,
    },
    { id: 'completed', label: t.completedTasks, count: grouped.completed.length, icon: CheckCircle2 },
  ];

  return (
    <div className="min-h-screen bg-[#F5F8F6] text-[#1F2937]">
      {/* Mobile-First Sticky Top Bar */}
      <header className="sticky top-0 z-30 border-b border-[#064E3B]/15 bg-[#022C22] text-white shadow-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 px-4 py-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <WasteSmartLogo variant="dark-surface" size="sm" />
            <div className="hidden sm:block border-l border-white/15 pl-2.5 min-w-0">
              <p className="text-xs font-bold text-[#A7F3D0] truncate">
                {workerProfile?.name || user.name}
              </p>
              <p className="text-[11px] text-white/75 truncate">
                {workerProfile?.ward || user.ward}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isSpeechSupported() && (
              <button
                type="button"
                onClick={toggleVoiceMode}
                aria-label={voiceEnabled ? t.audioOff : t.audioOn}
                className={`inline-flex min-h-[42px] items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-colors ${
                  voiceEnabled
                    ? 'bg-[#A7F3D0] text-[#022C22]'
                    : 'border border-white/20 bg-white/10 text-white hover:bg-white/20'
                }`}
              >
                {voiceEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                <span className="hidden sm:inline">{voiceEnabled ? t.audioOn : t.audioOff}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setLangModalOpen(true)}
              aria-label={t.chooseLanguage}
              className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-xs font-bold text-white hover:bg-white/20"
            >
              <Globe className="h-4 w-4 text-[#A7F3D0]" />
              <span>{currentLangMeta.nativeName}</span>
            </button>

            <button
              type="button"
              onClick={onLogout}
              aria-label={t.logout}
              className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-red-300/30 bg-red-500/20 px-3 py-2 text-xs font-bold text-red-100 hover:bg-red-500/35"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">{t.logout}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Mobile-First Container */}
      <main className="mx-auto max-w-3xl space-y-5 px-4 py-5 pb-12">
        {/* Compact Worker Identity + Refresh Banner */}
        <section className="flex items-center justify-between gap-3 rounded-2xl border border-[#DCE6E0] bg-white px-4 py-3.5">
          <div className="min-w-0">
            <h1 className="font-display text-lg font-extrabold text-[#022C22] sm:text-xl">
              {t.portalTitle}
            </h1>
            <p className="text-xs text-[#4B5563] truncate">
              {workerProfile?.name || user.name}
              {workerProfile?.vehicleCode ? ` · ${workerProfile.vehicleCode}` : ''}
              {workerProfile?.ward ? ` · ${workerProfile.ward}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadTasks(true)}
            disabled={loading}
            className="inline-flex min-h-[42px] shrink-0 items-center gap-1.5 rounded-xl border border-[#DCE6E0] bg-[#F5F8F6] px-3.5 py-2 text-xs font-bold text-[#064E3B] hover:bg-[#ECFDF5] disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            <span>{t.refresh}</span>
          </button>
        </section>

        {/* Feedback & Error Alerts */}
        {feedback && (
          <div
            role="status"
            className="flex items-center gap-2 rounded-2xl border border-[#A7F3D0] bg-[#ECFDF5] px-4 py-3 text-sm font-semibold text-[#064E3B]"
          >
            <CheckCircle2 className="h-5 w-5 shrink-0 text-[#059669]" />
            <span>{feedback}</span>
          </div>
        )}
        {error && (
          <div
            role="alert"
            className="flex items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
          >
            <span className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <span>{error}</span>
            </span>
            <button
              type="button"
              onClick={() => void loadTasks(true)}
              className="rounded-xl border border-red-300 bg-white px-3 py-1.5 text-xs font-bold text-red-700"
            >
              {t.refresh}
            </button>
          </div>
        )}

        {/* 4 Thumb-Friendly Category Tabs */}
        <nav aria-label="Task status tabs" className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {tabItems.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex min-h-[68px] flex-col items-start justify-between rounded-2xl border p-3.5 text-left transition-all ${
                  active
                    ? 'border-[#064E3B] bg-[#064E3B] text-white shadow-sm'
                    : 'border-[#DCE6E0] bg-white text-[#1F2937] hover:border-[#059669]'
                }`}
              >
                <div className="flex w-full items-center justify-between">
                  <Icon
                    className={`h-5 w-5 ${active ? 'text-[#A7F3D0]' : 'text-[#059669]'}`}
                  />
                  <span
                    className={`font-mono text-lg font-extrabold tabular-nums ${
                      active ? 'text-white' : 'text-[#022C22]'
                    }`}
                  >
                    {tab.count}
                  </span>
                </div>
                <span className="mt-1.5 text-xs font-bold leading-tight">{tab.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Task Cards List */}
        {loading && tasks.length === 0 ? (
          <div className="flex items-center justify-center gap-2 rounded-2xl border border-[#DCE6E0] bg-white py-16 text-sm text-[#4B5563]">
            <Loader2 className="h-5 w-5 animate-spin text-[#059669]" />
            <span>Loading...</span>
          </div>
        ) : visibleTasks.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#C7DBD0] bg-white px-6 py-14 text-center">
            <ClipboardList className="mx-auto h-10 w-10 text-[#9CA3AF]" />
            <p className="mt-3 text-sm font-bold text-[#022C22]">{t.noTasksHere}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {visibleTasks.map((task) => {
              const busy = busyTaskId === task.id;
              const previewSrc = afterPreviews[task.id] || task.afterImageUrl || '';
              const mapHref = `https://www.google.com/maps/search/?api=1&query=${task.coordinates.lat},${task.coordinates.lng}`;

              return (
                <article
                  key={task.id}
                  className="overflow-hidden rounded-2xl border border-[#DCE6E0] bg-white shadow-xs"
                >
                  {/* Rejection Notice Banner if admin returned task */}
                  {task.rejectionReason && task.status === 'Assigned' && (
                    <div className="border-b border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800">
                      <p className="font-bold">{t.rejectedBannerTitle}</p>
                      <p className="mt-0.5 font-medium">{task.rejectionReason}</p>
                    </div>
                  )}

                  <div className="p-4 sm:p-5 space-y-4">
                    {/* Header: Ticket ID + Category + AI + Listen button */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-lg bg-[#ECFDF5] px-2.5 py-1 font-mono text-xs font-extrabold text-[#064E3B]">
                          {task.id}
                        </span>
                        <span className="rounded-lg border border-[#DCE6E0] bg-[#F8FAF9] px-2.5 py-1 text-xs font-bold text-[#022C22]">
                          {task.category}
                        </span>
                        {task.aiDetected && (
                          <span className="inline-flex items-center gap-1 rounded-lg bg-[#E0F2FE] px-2 py-1 text-[11px] font-bold text-[#0369A1]">
                            <Sparkles className="h-3 w-3" />
                            <span>
                              {t.aiConfidenceLabel}: {task.aiConfidence}%
                            </span>
                          </span>
                        )}
                      </div>

                      {isSpeechSupported() && (
                        <button
                          type="button"
                          onClick={() => handleSpeakTask(task)}
                          className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold ${
                            speakingId === task.id
                              ? 'border-[#059669] bg-[#059669] text-white'
                              : 'border-[#DCE6E0] bg-[#F5F8F6] text-[#064E3B]'
                          }`}
                        >
                          <Volume2 className="h-4 w-4" />
                          <span>{speakingId === task.id ? t.stopAudio : t.listen}</span>
                        </button>
                      )}
                    </div>

                    {/* Title & Location */}
                    <div>
                      <h2 className="font-display text-base font-extrabold text-[#022C22]">
                        {task.title}
                      </h2>
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#F5F8F6] p-3 text-xs">
                        <div className="flex items-start gap-2 min-w-0">
                          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#059669]" />
                          <div className="min-w-0">
                            <p className="font-bold text-[#1F2937]">{task.locationName}</p>
                            <p className="text-[#6B7280]">{task.ward}</p>
                          </div>
                        </div>
                        <a
                          href={mapHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex min-h-[38px] shrink-0 items-center gap-1.5 rounded-lg border border-[#DCE6E0] bg-white px-3 py-1.5 text-xs font-bold text-[#064E3B] hover:bg-[#ECFDF5]"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          <span>{t.openMap}</span>
                        </a>
                      </div>
                    </div>

                    {/* Photographs Grid (Before + After when applicable) */}
                    <div
                      className={`grid gap-3 ${
                        previewSrc ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'
                      }`}
                    >
                      <div className="overflow-hidden rounded-xl border border-[#DCE6E0] bg-[#F8FAF9]">
                        <p className="border-b border-[#EEF3F0] px-3 py-1.5 text-[11px] font-bold text-[#4B5563]">
                          {t.beforePhoto}
                        </p>
                        <img
                          src={task.imageUrl}
                          alt={task.title}
                          referrerPolicy="no-referrer"
                          className="h-44 w-full object-cover"
                        />
                      </div>

                      {previewSrc && (
                        <div className="overflow-hidden rounded-xl border border-[#A7F3D0] bg-[#ECFDF5]/40">
                          <p className="border-b border-[#A7F3D0] px-3 py-1.5 text-[11px] font-bold text-[#064E3B]">
                            {t.afterPhoto}
                          </p>
                          <img
                            src={previewSrc}
                            alt={`${task.id} after cleaning`}
                            referrerPolicy="no-referrer"
                            className="h-44 w-full object-cover"
                          />
                        </div>
                      )}
                    </div>

                    {/* ACTION: Start Task */}
                    {task.status === 'Assigned' && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleStartTask(task)}
                        className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[#064E3B] px-5 py-3 text-base font-extrabold text-white shadow-sm hover:bg-[#022C22] disabled:opacity-60"
                      >
                        {busy ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          <Play className="h-5 w-5" />
                        )}
                        <span>{busy ? t.starting : t.startTask}</span>
                      </button>
                    )}

                    {/* ACTION: In Progress -> After-photo upload + Notes + Submit Completion */}
                    {task.status === 'In Progress' && (
                      <div className="space-y-3 rounded-2xl border border-[#DCE6E0] bg-[#F9FBFA] p-3.5">
                        <p className="text-xs font-extrabold text-[#022C22]">
                          {t.uploadAfterPhoto}
                        </p>

                        <input
                          ref={(el) => {
                            cameraInputRefs.current[task.id] = el;
                          }}
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="hidden"
                          onChange={(e) =>
                            handleAfterPhotoSelected(task.id, e.target.files?.[0])
                          }
                        />
                        <input
                          ref={(el) => {
                            fileInputRefs.current[task.id] = el;
                          }}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) =>
                            handleAfterPhotoSelected(task.id, e.target.files?.[0])
                          }
                        />

                        <div className="grid grid-cols-2 gap-2.5">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => cameraInputRefs.current[task.id]?.click()}
                            className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-[#064E3B] bg-white px-3 py-2.5 text-xs font-extrabold text-[#064E3B] hover:bg-[#ECFDF5]"
                          >
                            <Camera className="h-4 w-4" />
                            <span>{t.takePhotoCamera}</span>
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => fileInputRefs.current[task.id]?.click()}
                            className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-[#DCE6E0] bg-white px-3 py-2.5 text-xs font-extrabold text-[#1F2937] hover:bg-[#F5F8F6]"
                          >
                            <Upload className="h-4 w-4" />
                            <span>{t.choosePhotoFile}</span>
                          </button>
                        </div>

                        <div>
                          <label
                            htmlFor={`notes-${task.id}`}
                            className="block text-xs font-bold text-[#374151]"
                          >
                            {t.completionNotesLabel}
                          </label>
                          <input
                            id={`notes-${task.id}`}
                            type="text"
                            maxLength={300}
                            value={notesByTask[task.id] ?? ''}
                            onChange={(e) =>
                              setNotesByTask((prev) => ({ ...prev, [task.id]: e.target.value }))
                            }
                            placeholder={t.completionNotesPlaceholder}
                            className="mt-1 w-full rounded-xl border border-[#DCE6E0] bg-white px-3.5 py-2.5 text-sm text-[#1F2937] focus:border-[#059669] focus:outline-none"
                          />
                        </div>

                        <button
                          type="button"
                          disabled={busy || (!afterFiles[task.id] && !afterPreviews[task.id])}
                          onClick={() => void handleSubmitCompletion(task)}
                          className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[#059669] px-5 py-3 text-base font-extrabold text-white shadow-sm hover:bg-[#064E3B] disabled:opacity-50"
                        >
                          {busy ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-5 w-5" />
                          )}
                          <span>{busy ? t.submitting : t.submitCompletion}</span>
                        </button>
                      </div>
                    )}

                    {/* STATUS: Pending Verification */}
                    {task.status === 'Pending Verification' && (
                      <div className="flex items-center justify-between gap-3 rounded-xl border border-[#DDD6FE] bg-[#F5F3FF] px-4 py-3 text-xs font-bold text-[#5B21B6]">
                        <span className="flex items-center gap-2">
                          <Clock className="h-4 w-4 shrink-0" />
                          <span>{t.awaitingAdminReview}</span>
                        </span>
                        {task.completedAt && (
                          <span className="font-mono text-[11px]">
                            {formatDisplayTimestamp(task.completedAt)}
                          </span>
                        )}
                      </div>
                    )}

                    {/* STATUS: Completed */}
                    {task.status === 'Resolved' && (
                      <div className="space-y-1 rounded-xl border border-[#A7F3D0] bg-[#ECFDF5] px-4 py-3 text-xs text-[#064E3B]">
                        <p className="flex items-center gap-2 font-extrabold">
                          <CheckCircle2 className="h-4 w-4 text-[#059669]" />
                          <span>{t.completedBadge}</span>
                        </p>
                        {task.resolutionNotes && (
                          <p className="text-[#1F4B3B]">{task.resolutionNotes}</p>
                        )}
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>

      {/* Searchable 23-Language Selector Modal */}
      {langModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t.chooseLanguage}
          className="fixed inset-0 z-50 flex items-end justify-center bg-[#022C22]/65 p-0 backdrop-blur-xs sm:items-center sm:p-4"
          onClick={() => setLangModalOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-[#DCE6E0] bg-white shadow-2xl sm:rounded-2xl"
          >
            <div className="flex items-center justify-between border-b border-[#EEF3F0] px-5 py-4">
              <div className="flex items-center gap-2">
                <Globe className="h-5 w-5 text-[#059669]" />
                <h2 className="font-display text-base font-extrabold text-[#022C22]">
                  {t.chooseLanguage} (22 Indian + English)
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setLangModalOpen(false)}
                aria-label="Close language selector"
                className="rounded-lg p-1.5 text-[#6B7280] hover:bg-[#F5F8F6]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="border-b border-[#EEF3F0] px-4 py-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7280]" />
                <input
                  type="search"
                  autoFocus
                  value={langSearch}
                  onChange={(e) => setLangSearch(e.target.value)}
                  placeholder={t.searchLanguage}
                  className="w-full rounded-xl border border-[#DCE6E0] bg-[#F9FBFA] py-2.5 pl-9 pr-3 text-sm text-[#1F2937] focus:border-[#059669] focus:outline-none"
                />
              </div>
            </div>

            <div className="flex-1 divide-y divide-[#EEF3F0] overflow-y-auto px-2 py-1">
              {filteredLanguages.map((lang) => {
                const selected = lang.code === language;
                return (
                  <button
                    key={lang.code}
                    type="button"
                    onClick={() => void handleSelectLanguage(lang.code)}
                    className={`flex w-full items-center justify-between rounded-xl px-4 py-3.5 text-left transition-colors ${
                      selected
                        ? 'bg-[#ECFDF5] font-bold text-[#064E3B]'
                        : 'hover:bg-[#F5F8F6] text-[#1F2937]'
                    }`}
                  >
                    <div>
                      <p className="text-sm font-bold">{lang.nativeName}</p>
                      <p className="text-xs text-[#6B7280]">
                        {lang.englishName} ({lang.code})
                      </p>
                    </div>
                    {selected && <CheckCircle2 className="h-5 w-5 text-[#059669]" />}
                  </button>
                );
              })}
              {filteredLanguages.length === 0 && (
                <p className="py-8 text-center text-xs text-[#6B7280]">
                  No matching language found.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
