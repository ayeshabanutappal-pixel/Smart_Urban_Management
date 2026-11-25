import { useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  Loader2,
  MapPin,
  Search,
  ShieldCheck,
  Sparkles,
  X,
  XCircle,
} from 'lucide-react';
import { ComplaintStatusLabel, WasteCategoryText } from '../components/StatusText';
import { checkCleanupWithAi } from '../services/flaskApi';
import type {
  Complaint,
  ComplaintStatus,
  WasteCategory,
  Worker,
} from '../types/waste';
import { filterComplaints, formatDisplayTimestamp } from '../utils/wasteLogic';

interface AdminComplaintsPageProps {
  complaints: Complaint[];
  workers: Worker[];
  globalSearch: string;
  compactTables: boolean;
  flaskApiBaseUrl?: string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onUpdateComplaint: (
    complaintId: string,
    patch: {
      status?: ComplaintStatus;
      assignedWorkerId?: string | null;
      assignedWorkerName?: string | null;
    }
  ) => Promise<void>;
  onVerifyComplaint?: (
    complaintId: string,
    payload: { decision: 'approve' | 'reject'; note?: string; rejectionReason?: string }
  ) => Promise<void>;
  onTrackComplaint: (complaintId: string) => void;
}

export function AdminComplaintsPage({
  complaints,
  workers,
  globalSearch,
  compactTables,
  flaskApiBaseUrl = 'http://127.0.0.1:5000',
  loading = false,
  error = null,
  onRetry,
  onUpdateComplaint,
  onVerifyComplaint,
  onTrackComplaint,
}: AdminComplaintsPageProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ComplaintStatus | 'All'>('All');
  const [categoryFilter, setCategoryFilter] = useState<WasteCategory | 'All'>('All');
  const [previewComplaint, setPreviewComplaint] = useState<Complaint | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Admin verification state
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [verifyNote, setVerifyNote] = useState('');
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifyingDecision, setVerifyingDecision] = useState<'approve' | 'reject' | null>(null);
  const [aiCheckLoading, setAiCheckLoading] = useState(false);
  const [aiCheckMessage, setAiCheckMessage] = useState<string | null>(null);

  const pendingVerificationCount = useMemo(
    () => complaints.filter((c) => c.status === 'Pending Verification').length,
    [complaints]
  );

  const openModal = (c: Complaint) => {
    setPreviewComplaint(c);
    setRejectOpen(false);
    setRejectionReason('');
    setVerifyNote('');
    setVerifyError(null);
    setAiCheckMessage(null);
  };

  const filtered = useMemo(() => {
    return filterComplaints(complaints, {
      search: search.trim() || globalSearch,
      status: statusFilter,
      category: categoryFilter,
    });
  }, [complaints, search, globalSearch, statusFilter, categoryFilter]);

  const showFeedback = (msg: string) => {
    setActionError(null);
    setToastMessage(msg);
    window.setTimeout(() => setToastMessage(null), 3200);
  };

  const handleWorkerChange = async (complaintId: string, workerId: string) => {
    setActionError(null);
    setUpdatingId(complaintId);
    try {
      if (!workerId) {
        await onUpdateComplaint(complaintId, {
          assignedWorkerId: null,
          assignedWorkerName: null,
          status: 'Pending',
        });
        showFeedback(`Unassigned worker from ${complaintId}.`);
        return;
      }
      const found = workers.find((w) => w.id === workerId);
      if (!found) return;
      await onUpdateComplaint(complaintId, {
        assignedWorkerId: found.id,
        assignedWorkerName: found.name,
        status: 'Assigned',
      });
      showFeedback(`Assigned ${found.name} to ${complaintId}.`);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : `Unable to update worker for ${complaintId}.`
      );
    } finally {
      setUpdatingId(null);
    }
  };

  const handleStatusChange = async (complaintId: string, status: ComplaintStatus) => {
    setActionError(null);
    setUpdatingId(complaintId);
    try {
      await onUpdateComplaint(complaintId, { status });
      showFeedback(`Updated ${complaintId} status to ${status}.`);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : `Unable to update status for ${complaintId}.`
      );
    } finally {
      setUpdatingId(null);
    }
  };

  const handleVerifyDecision = async (decision: 'approve' | 'reject') => {
    if (!previewComplaint || !onVerifyComplaint) return;
    setVerifyError(null);
    if (decision === 'reject' && rejectionReason.trim().length < 3) {
      setVerifyError('Please enter a rejection reason (at least 3 characters).');
      return;
    }
    setVerifyingDecision(decision);
    try {
      await onVerifyComplaint(previewComplaint.id, {
        decision,
        note: decision === 'approve' ? verifyNote.trim() || undefined : undefined,
        rejectionReason: decision === 'reject' ? rejectionReason.trim() : undefined,
      });
      const ticket = previewComplaint.id;
      setPreviewComplaint(null);
      showFeedback(
        decision === 'approve'
          ? `${ticket} approved and marked as Resolved.`
          : `${ticket} rejected and returned to assigned worker.`
      );
    } catch (err) {
      setVerifyError(
        err instanceof Error ? err.message : 'Unable to save verification decision.'
      );
    } finally {
      setVerifyingDecision(null);
    }
  };

  const handleRunAdvisoryAiCheck = async () => {
    if (!previewComplaint) return;
    setAiCheckLoading(true);
    setAiCheckMessage(null);
    try {
      const res = await checkCleanupWithAi(flaskApiBaseUrl, previewComplaint.id);
      setAiCheckMessage(res.message);
    } catch (err) {
      setAiCheckMessage(
        err instanceof Error ? err.message : 'Unable to query AI verification service.'
      );
    } finally {
      setAiCheckLoading(false);
    }
  };

  const rowPad = compactTables ? 'py-2' : 'py-3.5';

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h2 className="font-display text-2xl font-extrabold text-[#022C22]">
            All Complaints
          </h2>
          <p className="mt-1 text-sm text-[#4B5563]">
            Review citizen garbage photos, assign municipal field workers, and verify worker cleanup
            before final resolution.
          </p>
        </div>
        {toastMessage && (
          <div
            role="status"
            className="rounded-xl border border-[#A7F3D0] bg-[#ECFDF5] px-4 py-2 text-xs font-semibold text-[#064E3B]"
          >
            {toastMessage}
          </div>
        )}
      </div>

      {pendingVerificationCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#DDD6FE] bg-[#F5F3FF] px-5 py-3.5 text-xs">
          <div className="flex items-center gap-2.5 text-[#5B21B6]">
            <ShieldCheck className="h-5 w-5 shrink-0" />
            <div>
              <p className="font-bold">
                {pendingVerificationCount} cleanup{pendingVerificationCount === 1 ? '' : 's'} awaiting
                Admin Verification
              </p>
              <p className="text-[11px] text-[#6D28D9]">
                Compare before and after photographs to Approve or Reject worker submissions.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setStatusFilter('Pending Verification')}
            className="rounded-xl bg-[#5B21B6] px-4 py-2 text-xs font-bold text-white hover:bg-[#4C1D95]"
          >
            Review Pending ({pendingVerificationCount})
          </button>
        </div>
      )}

      {(error || actionError) && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-700"
        >
          <span className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{actionError || error}</span>
          </span>
          {error && onRetry && (
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

      {/* Filter Bar */}
      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-[#E2EAE5] bg-white p-4 md:grid-cols-12">
        <div className="relative md:col-span-5">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7280]" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by ID, citizen, street, or worker..."
            aria-label="Search all complaints"
            className="w-full rounded-xl border border-[#DCE6E0] bg-[#F9FBFA] py-2 pl-9 pr-3 text-xs text-[#1F2937] focus:border-[#059669] focus:bg-white"
          />
        </div>

        <div className="md:col-span-4">
          <select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as ComplaintStatus | 'All')}
            className="w-full rounded-xl border border-[#DCE6E0] bg-[#F9FBFA] px-3 py-2 text-xs font-medium text-[#1F2937] focus:border-[#059669]"
          >
            <option value="All">All Statuses</option>
            <option value="Pending">Pending</option>
            <option value="Assigned">Assigned</option>
            <option value="In Progress">In Progress</option>
            <option value="Pending Verification">Pending Verification</option>
            <option value="Resolved">Resolved</option>
          </select>
        </div>

        <div className="md:col-span-3">
          <select
            aria-label="Filter by waste category"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as WasteCategory | 'All')}
            className="w-full rounded-xl border border-[#DCE6E0] bg-[#F9FBFA] px-3 py-2 text-xs font-medium text-[#1F2937] focus:border-[#059669]"
          >
            <option value="All">All Categories</option>
            <option value="Organic">Organic</option>
            <option value="Plastic">Plastic</option>
            <option value="Metal">Metal</option>
            <option value="Others">Others</option>
          </select>
        </div>
      </div>

      {/* Management Table */}
      <div className="overflow-hidden rounded-2xl border border-[#E2EAE5] bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#EEF3F0] bg-[#F8FAF9] font-semibold text-[#4B5563]">
                <th className="px-5 py-3">Photo &amp; ID</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Location &amp; Citizen</th>
                <th className="px-4 py-3">Assign Worker</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEF3F0]">
              {loading && complaints.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-sm text-[#6B7280]">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-[#059669]" />
                      <span>Loading complaints...</span>
                    </span>
                  </td>
                </tr>
              ) : (
                <>
                  {filtered.map((c) => {
                    const rowDisabled = updatingId === c.id;
                    const needsVerify = c.status === 'Pending Verification';
                    return (
                      <tr key={c.id} className="hover:bg-[#F9FBFA]">
                        <td className={`px-5 ${rowPad}`}>
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => openModal(c)}
                              aria-label={`Preview photo for ${c.id}`}
                              className="group relative h-11 w-14 shrink-0 overflow-hidden rounded-lg border border-[#DCE6E0] bg-[#EEF3F0]"
                            >
                              <img
                                src={c.imageUrl}
                                alt={c.title}
                                referrerPolicy="no-referrer"
                                className="h-full w-full object-cover transition-transform group-hover:scale-105"
                              />
                            </button>
                            <div className="min-w-0">
                              <p className="font-mono font-bold text-[#064E3B]">{c.id}</p>
                              <p className="max-w-[200px] truncate font-medium text-[#1F2937]">
                                {c.title}
                              </p>
                              <p className="font-mono text-[11px] text-[#6B7280] tabular-nums">
                                {formatDisplayTimestamp(c.reportedAt)}
                              </p>
                            </div>
                          </div>
                        </td>

                        <td className={`px-4 ${rowPad}`}>
                          <WasteCategoryText category={c.category} />
                          {c.aiDetected && (
                            <p className="mt-0.5 font-mono text-[11px] text-[#6B7280] tabular-nums">
                              AI {c.aiConfidence}%
                            </p>
                          )}
                        </td>

                        <td className={`px-4 ${rowPad}`}>
                          <p className="max-w-[210px] truncate font-medium text-[#1F2937]">
                            {c.locationName}
                          </p>
                          <p className="text-[11px] text-[#6B7280]">
                            {c.ward} · {c.citizenName}
                          </p>
                        </td>

                        <td className={`px-4 ${rowPad}`}>
                          <select
                            aria-label={`Assign worker for ${c.id}`}
                            value={c.assignedWorkerId ?? ''}
                            disabled={rowDisabled}
                            onChange={(e) => void handleWorkerChange(c.id, e.target.value)}
                            className="w-44 rounded-lg border border-[#DCE6E0] bg-white px-2.5 py-1.5 text-xs font-medium text-[#1F2937] focus:border-[#059669] disabled:opacity-60"
                          >
                            <option value="">Unassigned</option>
                            {workers.map((w) => (
                              <option key={w.id} value={w.id}>
                                {w.name} ({w.availability})
                              </option>
                            ))}
                          </select>
                        </td>

                        <td className={`px-4 ${rowPad}`}>
                          <select
                            aria-label={`Update status for ${c.id}`}
                            value={c.status}
                            disabled={rowDisabled}
                            onChange={(e) =>
                              void handleStatusChange(c.id, e.target.value as ComplaintStatus)
                            }
                            className="w-40 rounded-lg border border-[#DCE6E0] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#022C22] focus:border-[#059669] disabled:opacity-60"
                          >
                            <option value="Pending">Pending</option>
                            <option value="Assigned">Assigned</option>
                            <option value="In Progress">In Progress</option>
                            <option value="Pending Verification">Pending Verification</option>
                            <option value="Resolved">Resolved</option>
                          </select>
                        </td>

                        <td className={`px-5 ${rowPad} text-right`}>
                          <div className="inline-flex items-center gap-1.5">
                            {needsVerify && (
                              <button
                                type="button"
                                onClick={() => openModal(c)}
                                className="inline-flex items-center gap-1 rounded-lg bg-[#5B21B6] px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-[#4C1D95]"
                              >
                                <ShieldCheck className="h-3.5 w-3.5" />
                                <span>Verify</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => openModal(c)}
                              aria-label={`Inspect ${c.id}`}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#DCE6E0] text-[#064E3B] hover:bg-[#ECFDF5]"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onTrackComplaint(c.id)}
                              aria-label={`View ${c.id} on map`}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#DCE6E0] text-[#064E3B] hover:bg-[#ECFDF5]"
                            >
                              <MapPin className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-sm text-[#6B7280]">
                        {complaints.length === 0
                          ? 'No citizen complaints have been submitted yet.'
                          : 'No complaints match your current search and filter criteria.'}
                      </td>
                    </tr>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Image & Verification Inspection Modal */}
      {previewComplaint && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Complaint ${previewComplaint.id} details`}
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[#022C22]/65 p-4 backdrop-blur-xs"
          onClick={() => setPreviewComplaint(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="my-auto w-full max-w-2xl overflow-hidden rounded-2xl border border-[#DCE6E0] bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-[#EEF3F0] px-5 py-4">
              <div>
                <p className="font-mono text-xs font-bold text-[#064E3B]">
                  {previewComplaint.id}
                </p>
                <h3 className="font-display text-base font-bold text-[#022C22]">
                  {previewComplaint.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPreviewComplaint(null)}
                aria-label="Close complaint preview"
                className="rounded-lg p-1.5 text-[#6B7280] hover:bg-[#F5F8F6] hover:text-[#022C22]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Side-by-side Before & After Photographs */}
            <div
              className={`grid gap-3 bg-[#F5F8F6] p-4 ${
                previewComplaint.afterImageUrl ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'
              }`}
            >
              <div className="overflow-hidden rounded-xl border border-[#DCE6E0] bg-white">
                <p className="border-b border-[#EEF3F0] px-3 py-1.5 text-[11px] font-bold text-[#4B5563]">
                  Before Cleaning (Citizen Report)
                </p>
                <img
                  src={previewComplaint.imageUrl}
                  alt={previewComplaint.title}
                  referrerPolicy="no-referrer"
                  className="h-56 w-full object-cover"
                />
              </div>
              {previewComplaint.afterImageUrl && (
                <div className="overflow-hidden rounded-xl border border-[#A7F3D0] bg-white">
                  <p className="border-b border-[#A7F3D0] bg-[#ECFDF5] px-3 py-1.5 text-[11px] font-bold text-[#064E3B]">
                    After Cleaning (Worker Upload)
                  </p>
                  <img
                    src={previewComplaint.afterImageUrl}
                    alt={`${previewComplaint.id} after cleaning`}
                    referrerPolicy="no-referrer"
                    className="h-56 w-full object-cover"
                  />
                </div>
              )}
            </div>

            <div className="space-y-3 p-5 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <WasteCategoryText category={previewComplaint.category} />
                  {previewComplaint.aiDetected && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-[#E0F2FE] px-2 py-0.5 text-[11px] font-semibold text-[#0369A1]">
                      <Sparkles className="h-3 w-3" />
                      AI: {previewComplaint.category} ({previewComplaint.aiConfidence}%)
                    </span>
                  )}
                </div>
                <ComplaintStatusLabel status={previewComplaint.status} />
              </div>

              <p className="leading-relaxed text-[#374151]">{previewComplaint.description}</p>

              {previewComplaint.completionNotes && (
                <div className="rounded-xl border border-[#A7F3D0] bg-[#ECFDF5]/60 p-3">
                  <span className="font-bold text-[#064E3B]">Worker Completion Notes</span>
                  <p className="mt-0.5 text-[#1F2937]">{previewComplaint.completionNotes}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 rounded-xl bg-[#F5F8F6] p-3.5">
                <div>
                  <span className="text-[#6B7280]">Location</span>
                  <p className="mt-0.5 font-semibold text-[#1F2937]">
                    {previewComplaint.locationName} ({previewComplaint.ward})
                  </p>
                </div>
                <div>
                  <span className="text-[#6B7280]">Assigned Worker</span>
                  <p className="mt-0.5 font-semibold text-[#1F2937]">
                    {previewComplaint.assignedWorkerName || 'Unassigned'}
                  </p>
                </div>
              </div>

              {/* Admin Verification Panel (Approve or Reject when Pending Verification) */}
              {previewComplaint.status === 'Pending Verification' && onVerifyComplaint && (
                <div className="space-y-3 rounded-2xl border border-[#DDD6FE] bg-[#F5F3FF]/70 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-[#5B21B6]">
                      <ShieldCheck className="h-4 w-4" />
                      <span className="font-bold">Admin Cleanup Verification</span>
                    </div>
                    <button
                      type="button"
                      disabled={aiCheckLoading}
                      onClick={() => void handleRunAdvisoryAiCheck()}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#C4B5FD] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#5B21B6] hover:bg-[#EDE9FE] disabled:opacity-60"
                    >
                      {aiCheckLoading ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Sparkles className="h-3 w-3" />
                      )}
                      <span>Optional AI Pre-Check</span>
                    </button>
                  </div>

                  {aiCheckMessage && (
                    <p className="rounded-lg border border-[#C4B5FD] bg-white px-3 py-2 text-[11px] text-[#4C1D95]">
                      {aiCheckMessage}
                    </p>
                  )}

                  {verifyError && (
                    <p
                      role="alert"
                      className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-semibold text-red-700"
                    >
                      {verifyError}
                    </p>
                  )}

                  {!rejectOpen ? (
                    <>
                      <div>
                        <label
                          htmlFor="verify-note"
                          className="block text-[11px] font-semibold text-[#374151]"
                        >
                          Approval Note (optional)
                        </label>
                        <input
                          id="verify-note"
                          type="text"
                          value={verifyNote}
                          onChange={(e) => setVerifyNote(e.target.value)}
                          placeholder="e.g. Site verified clean from after-photo"
                          className="mt-1 w-full rounded-xl border border-[#DCE6E0] bg-white px-3 py-2 text-xs text-[#1F2937]"
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-2.5 pt-1">
                        <button
                          type="button"
                          disabled={verifyingDecision !== null}
                          onClick={() => void handleVerifyDecision('approve')}
                          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#059669] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#064E3B] disabled:opacity-60"
                        >
                          {verifyingDecision === 'approve' ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4" />
                          )}
                          <span>Approve &amp; Resolve</span>
                        </button>
                        <button
                          type="button"
                          disabled={verifyingDecision !== null}
                          onClick={() => {
                            setVerifyError(null);
                            setRejectOpen(true);
                          }}
                          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-red-300 bg-white px-4 py-2.5 text-xs font-bold text-red-700 hover:bg-red-50 disabled:opacity-60"
                        >
                          <XCircle className="h-4 w-4" />
                          <span>Reject Cleanup</span>
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="space-y-2.5">
                      <label
                        htmlFor="reject-reason"
                        className="block text-[11px] font-bold text-red-800"
                      >
                        Rejection Reason (required) *
                      </label>
                      <textarea
                        id="reject-reason"
                        rows={2}
                        required
                        value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.target.value)}
                        placeholder="Explain what needs re-cleaning before returning task to worker..."
                        className="w-full rounded-xl border border-red-200 bg-white px-3 py-2 text-xs text-[#1F2937] focus:border-red-500 focus:outline-none"
                      />
                      <div className="flex items-center gap-2.5">
                        <button
                          type="button"
                          onClick={() => {
                            setRejectOpen(false);
                            setVerifyError(null);
                          }}
                          className="rounded-xl border border-[#DCE6E0] bg-white px-3.5 py-2 text-xs font-semibold text-[#374151]"
                        >
                          Back
                        </button>
                        <button
                          type="button"
                          disabled={verifyingDecision !== null}
                          onClick={() => void handleVerifyDecision('reject')}
                          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-60"
                        >
                          {verifyingDecision === 'reject' && (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          )}
                          <span>Confirm Rejection &amp; Return Task</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    const id = previewComplaint.id;
                    setPreviewComplaint(null);
                    onTrackComplaint(id);
                  }}
                  className="rounded-xl bg-[#064E3B] px-4 py-2 text-xs font-semibold text-white hover:bg-[#022C22]"
                >
                  Open on Map &amp; Timeline
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
