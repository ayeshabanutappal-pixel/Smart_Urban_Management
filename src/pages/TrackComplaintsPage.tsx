import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Circle,
  Clock,
  Info,
  Loader2,
  MapPin,
  Search,
  UserCheck,
} from 'lucide-react';
import { InteractiveCityMap } from '../components/InteractiveCityMap';
import { ComplaintStatusLabel, WasteCategoryText } from '../components/StatusText';
import { fetchComplaintDetail } from '../services/flaskApi';
import type { BackendStatus, Complaint, ComplaintStatusLogItem } from '../types/waste';
import {
  filterComplaints,
  formatDisplayTimestamp,
  getComplaintTimeline,
} from '../utils/wasteLogic';

interface TrackComplaintsPageProps {
  complaints: Complaint[];
  selectedComplaintId: string | null;
  onSelectComplaintId: (id: string) => void;
  backendStatus: BackendStatus;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  flaskApiBaseUrl?: string;
  onSessionExpired?: () => void;
}

export function TrackComplaintsPage({
  complaints,
  selectedComplaintId,
  onSelectComplaintId,
  backendStatus,
  loading = false,
  error = null,
  onRetry,
  flaskApiBaseUrl,
  onSessionExpired,
}: TrackComplaintsPageProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [detailState, setDetailState] = useState<{
    complaintId: string;
    complaint?: Complaint;
    statusLogs: ComplaintStatusLogItem[];
    loading: boolean;
    error: string | null;
  } | null>(null);

  const filtered = useMemo(
    () => filterComplaints(complaints, { search: searchTerm }),
    [complaints, searchTerm]
  );

  const activeComplaintBase = useMemo(() => {
    if (selectedComplaintId) {
      const exact = complaints.find((c) => c.id === selectedComplaintId);
      if (exact) return exact;
    }
    return filtered[0] ?? complaints[0] ?? null;
  }, [complaints, filtered, selectedComplaintId]);

  const activeComplaintId = activeComplaintBase?.id ?? null;

  useEffect(() => {
    if (!activeComplaintId || !flaskApiBaseUrl) {
      setDetailState(null);
      return;
    }

    let active = true;
    setDetailState({
      complaintId: activeComplaintId,
      statusLogs: [],
      loading: true,
      error: null,
    });

    void fetchComplaintDetail(flaskApiBaseUrl, activeComplaintId, onSessionExpired)
      .then((res) => {
        if (active) {
          setDetailState({
            complaintId: activeComplaintId,
            complaint: res.complaint,
            statusLogs: res.statusLogs,
            loading: false,
            error: null,
          });
        }
      })
      .catch((err) => {
        if (active) {
          setDetailState({
            complaintId: activeComplaintId,
            statusLogs: [],
            loading: false,
            error:
              err instanceof Error ? err.message : 'Unable to load complaint timeline details.',
          });
        }
      });

    return () => {
      active = false;
    };
  }, [activeComplaintId, activeComplaintBase?.updatedAt, flaskApiBaseUrl, onSessionExpired]);

  const activeComplaint =
    detailState?.complaintId === activeComplaintBase?.id && detailState?.complaint
      ? detailState.complaint
      : activeComplaintBase;

  const activeStatusLogs =
    detailState?.complaintId === activeComplaint?.id ? detailState?.statusLogs : undefined;

  const timeline = useMemo(
    () => (activeComplaint ? getComplaintTimeline(activeComplaint, activeStatusLogs) : []),
    [activeComplaint, activeStatusLogs]
  );

  // Complaint status counts derived strictly from real complaint records (no invented IoT bin metrics)
  const statusSummary = useMemo(() => {
    return {
      pending: complaints.filter((c) => c.status === 'Pending').length,
      active: complaints.filter(
        (c) => c.status === 'Assigned' || c.status === 'In Progress'
      ).length,
      resolved: complaints.filter((c) => c.status === 'Resolved').length,
    };
  }, [complaints]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h2 className="font-display text-2xl font-extrabold text-[#022C22]">
            Track Complaints
          </h2>
          <p className="mt-1 text-sm text-[#4B5563]">
            Select any garbage pin on the municipal map or search by Complaint ID to inspect its
            location, assigned worker, and resolution timeline.
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7280]" />
          <input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Lookup Complaint ID (e.g. 1001)..."
            aria-label="Search complaints to track"
            className="w-full rounded-xl border border-[#DCE6E0] bg-white py-2.5 pl-9 pr-3 text-xs text-[#1F2937] focus:border-[#059669]"
          />
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-700"
        >
          <span className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </span>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {/* Top Row: Interactive Map + Recorded Complaint Status Panel */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <InteractiveCityMap
            complaints={filtered.length > 0 ? filtered : complaints}
            selectedComplaintId={activeComplaint?.id ?? null}
            onSelectComplaint={(c) => onSelectComplaintId(c.id)}
            heightClass="h-[360px]"
          />
        </div>

        {/* Right Side Panel: Recorded Complaint Queue & Status Summary */}
        <aside className="flex flex-col rounded-2xl border border-[#E2EAE5] bg-white p-5 lg:col-span-4">
          <h3 className="font-display text-base font-bold text-[#022C22]">
            Complaint Status Panel
          </h3>
          <p className="mt-0.5 text-xs text-[#6B7280]">
            {backendStatus.connected
              ? 'Live records from Flask / MySQL database'
              : 'Live API sync status (checking Flask connection)'}
          </p>

          {/* Summary Strip */}
          <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-[#F5F8F6] p-3 text-center">
            <div>
              <p className="font-mono text-lg font-extrabold text-[#D97706] tabular-nums">
                {statusSummary.pending}
              </p>
              <p className="text-[11px] font-medium text-[#4B5563]">Pending</p>
            </div>
            <div>
              <p className="font-mono text-lg font-extrabold text-[#0284C7] tabular-nums">
                {statusSummary.active}
              </p>
              <p className="text-[11px] font-medium text-[#4B5563]">Dispatched</p>
            </div>
            <div>
              <p className="font-mono text-lg font-extrabold text-[#059669] tabular-nums">
                {statusSummary.resolved}
              </p>
              <p className="text-[11px] font-medium text-[#4B5563]">Resolved</p>
            </div>
          </div>

          {/* Selectable Complaint List */}
          <div className="mt-4 flex-1 space-y-1.5 overflow-y-auto max-h-[210px] pr-1">
            {loading && complaints.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-8 text-xs text-[#6B7280]">
                <Loader2 className="h-4 w-4 animate-spin text-[#059669]" />
                <span>Loading complaints...</span>
              </div>
            ) : (
              <>
                {filtered.map((item) => {
                  const isSelected = activeComplaint?.id === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onSelectComplaintId(item.id)}
                      className={`flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                        isSelected
                          ? 'border-[#064E3B] bg-[#ECFDF5]/80'
                          : 'border-[#EEF3F0] bg-white hover:bg-[#F5F8F6]'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="font-mono text-xs font-bold text-[#064E3B]">{item.id}</p>
                        <p className="truncate text-xs text-[#374151]">{item.locationName}</p>
                      </div>
                      <ComplaintStatusLabel status={item.status} />
                    </button>
                  );
                })}
                {complaints.length === 0 && !loading && (
                  <p className="py-6 text-center text-xs text-[#6B7280]">
                    No complaints submitted yet.
                  </p>
                )}
                {complaints.length > 0 && filtered.length === 0 && (
                  <p className="py-6 text-center text-xs text-[#6B7280]">
                    No complaints match &ldquo;{searchTerm}&rdquo;.
                  </p>
                )}
              </>
            )}
          </div>
        </aside>
      </div>

      {/* Bottom Section: Selected Complaint Full Metadata + 4-Step Progress Timeline */}
      {activeComplaint && (
        <section className="rounded-2xl border border-[#E2EAE5] bg-white p-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Photo + Core Metadata */}
            <div className="lg:col-span-5 space-y-4">
              <div className="flex items-start gap-4">
                <img
                  src={activeComplaint.imageUrl}
                  alt={activeComplaint.title}
                  referrerPolicy="no-referrer"
                  className="h-24 w-28 shrink-0 rounded-xl border border-[#DCE6E0] object-cover bg-[#EEF3F0]"
                />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-mono text-xs font-bold text-[#064E3B]">
                      {activeComplaint.id}
                    </span>
                    <span className="text-[#CBD5E1]" aria-hidden="true">
                      ·
                    </span>
                    <ComplaintStatusLabel status={activeComplaint.status} />
                  </div>
                  <h3 className="mt-1 font-display text-base font-bold text-[#022C22]">
                    {activeComplaint.title}
                  </h3>
                  <p className="mt-1 text-xs text-[#4B5563]">
                    {activeComplaint.description}
                  </p>
                </div>
              </div>

              <dl className="grid grid-cols-2 gap-3 rounded-xl bg-[#F5F8F6] p-4 text-xs">
                <div>
                  <dt className="text-[#6B7280]">Location</dt>
                  <dd className="mt-0.5 flex items-start gap-1 font-semibold text-[#1F2937]">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#059669]" />
                    <span>{activeComplaint.locationName}</span>
                  </dd>
                </div>
                <div>
                  <dt className="text-[#6B7280]">Waste Category</dt>
                  <dd className="mt-1">
                    <WasteCategoryText category={activeComplaint.category} />
                  </dd>
                </div>
                <div>
                  <dt className="text-[#6B7280]">Reported Date</dt>
                  <dd className="mt-0.5 flex items-center gap-1 font-mono font-medium text-[#1F2937] tabular-nums">
                    <Calendar className="h-3.5 w-3.5 text-[#059669]" />
                    <span>{formatDisplayTimestamp(activeComplaint.reportedAt)}</span>
                  </dd>
                </div>
                <div>
                  <dt className="text-[#6B7280]">Assigned Worker</dt>
                  <dd className="mt-0.5 flex items-center gap-1 font-semibold text-[#1F2937]">
                    <UserCheck className="h-3.5 w-3.5 text-[#059669]" />
                    <span>{activeComplaint.assignedWorkerName ?? 'Not yet assigned'}</span>
                  </dd>
                </div>
              </dl>
            </div>

            {/* Complaint Progress Timeline */}
            <div className="lg:col-span-7">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h4 className="font-display text-sm font-bold text-[#022C22]">
                    Complaint Progress Timeline
                  </h4>
                  {detailState?.loading && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-[#059669]" aria-label="Loading timeline" />
                  )}
                </div>
                <span className="inline-flex items-center gap-1 text-xs text-[#6B7280]">
                  <Info className="h-3.5 w-3.5 text-[#059669]" />
                  <span>{activeComplaint.ward}</span>
                </span>
              </div>
              {detailState?.error && (
                <p role="alert" className="mt-2 text-xs text-red-600">
                  {detailState.error}
                </p>
              )}

              <ol className="mt-5 space-y-5">
                {timeline.map((step, idx) => {
                  const isLast = idx === timeline.length - 1;
                  return (
                    <li key={step.key} className="relative flex gap-4">
                      {!isLast && (
                        <span
                          aria-hidden="true"
                          className={`absolute left-[13px] top-7 h-[calc(100%+4px)] w-0.5 ${
                            step.completed ? 'bg-[#059669]' : 'bg-[#DCE6E0]'
                          }`}
                        />
                      )}
                      <div className="relative z-10 mt-0.5 shrink-0">
                        {step.completed ? (
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#059669] text-white">
                            <CheckCircle2 className="h-4 w-4" />
                          </div>
                        ) : step.active ? (
                          <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#059669] bg-[#ECFDF5] text-[#059669]">
                            <Clock className="h-3.5 w-3.5" />
                          </div>
                        ) : (
                          <div className="flex h-7 w-7 items-center justify-center rounded-full border border-[#CBD5E1] bg-white text-[#9CA3AF]">
                            <Circle className="h-3.5 w-3.5" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 pb-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p
                            className={`text-sm font-bold ${
                              step.completed || step.active
                                ? 'text-[#022C22]'
                                : 'text-[#6B7280]'
                            }`}
                          >
                            {step.label}
                          </p>
                          <span className="font-mono text-[11px] text-[#6B7280] tabular-nums">
                            {step.timestamp}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-[#4B5563]">{step.description}</p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
