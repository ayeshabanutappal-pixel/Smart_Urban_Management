import { useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, MapPin, Phone, Truck, UserCheck } from 'lucide-react';
import { ComplaintStatusLabel, WasteCategoryText } from '../components/StatusText';
import type { Complaint, ComplaintStatus, Worker } from '../types/waste';

interface AssignWorkersPageProps {
  workers: Worker[];
  complaints: Complaint[];
  onAssignWorker: (
    complaintId: string,
    workerId: string,
    workerName: string,
    status: ComplaintStatus
  ) => Promise<void>;
}

export function AssignWorkersPage({
  workers,
  complaints,
  onAssignWorker,
}: AssignWorkersPageProps) {
  const [selectedWorkerByComplaint, setSelectedWorkerByComplaint] = useState<
    Record<string, string>
  >({});
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dispatchingId, setDispatchingId] = useState<string | null>(null);

  const openQueue = useMemo(
    () =>
      complaints.filter(
        (c) => c.status !== 'Resolved' && c.status !== 'Pending Verification'
      ),
    [complaints]
  );

  // Calculate live active task count per worker from actual complaints
  const workerLoadMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of complaints) {
      if (c.assignedWorkerId && c.status !== 'Resolved') {
        map.set(c.assignedWorkerId, (map.get(c.assignedWorkerId) ?? 0) + 1);
      }
    }
    return map;
  }, [complaints]);

  const handleDispatch = async (complaint: Complaint) => {
    const chosenId =
      selectedWorkerByComplaint[complaint.id] ||
      complaint.assignedWorkerId ||
      workers[0]?.id;
    const worker = workers.find((w) => w.id === chosenId);
    if (!worker) return;
    setError(null);
    setDispatchingId(complaint.id);
    try {
      await onAssignWorker(complaint.id, worker.id, worker.name, 'Assigned');
      setFeedback(`Dispatched ${worker.name} (${worker.vehicleCode}) to ${complaint.id}.`);
      window.setTimeout(() => setFeedback(null), 3500);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : `Unable to assign worker to ${complaint.id}.`
      );
    } finally {
      setDispatchingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h2 className="font-display text-2xl font-extrabold text-[#022C22]">
            Assign Municipal Workers
          </h2>
          <p className="mt-1 text-sm text-[#4B5563]">
            Monitor sanitation crew availability, vehicle codes, and dispatch pending complaints.
          </p>
        </div>
        {feedback && (
          <div
            role="status"
            className="inline-flex items-center gap-2 rounded-xl border border-[#A7F3D0] bg-[#ECFDF5] px-4 py-2 text-xs font-semibold text-[#064E3B]"
          >
            <CheckCircle2 className="h-4 w-4 text-[#059669]" />
            <span>{feedback}</span>
          </div>
        )}
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-700"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Worker Cards Grid */}
      <section aria-label="Sanitation Crews" className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {workers.map((worker) => {
          const activeCount = workerLoadMap.get(worker.id) ?? 0;
          const initials = worker.name
            .split(' ')
            .map((p) => p[0])
            .slice(0, 2)
            .join('');
          const availColor =
            worker.availability === 'Available'
              ? 'text-[#059669]'
              : worker.availability === 'On Duty'
              ? 'text-[#0284C7]'
              : 'text-[#6B7280]';

          return (
            <div
              key={worker.id}
              className="rounded-2xl border border-[#E2EAE5] bg-white p-5 transition-colors hover:border-[#059669]/40"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#064E3B] font-display text-sm font-bold text-[#A7F3D0]">
                    {initials}
                  </div>
                  <div>
                    <h3 className="font-display text-sm font-bold text-[#022C22]">
                      {worker.name}
                    </h3>
                    <p className="text-xs text-[#6B7280]">{worker.roleTitle}</p>
                  </div>
                </div>
                <span className={`text-xs font-semibold whitespace-nowrap ${availColor}`}>
                  {worker.availability}
                </span>
              </div>

              <div className="mt-4 space-y-1.5 border-t border-[#EEF3F0] pt-3.5 text-xs text-[#4B5563]">
                <p className="flex items-center gap-2">
                  <MapPin className="h-3.5 w-3.5 text-[#059669]" />
                  <span>{worker.ward}</span>
                </p>
                <p className="flex items-center gap-2">
                  <Truck className="h-3.5 w-3.5 text-[#059669]" />
                  <span>
                    Vehicle: <span className="font-mono font-semibold">{worker.vehicleCode}</span>
                  </span>
                </p>
                <p className="flex items-center gap-2">
                  <Phone className="h-3.5 w-3.5 text-[#059669]" />
                  <span className="font-mono tabular-nums">{worker.phone}</span>
                </p>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-[#F5F8F6] p-3 text-center text-xs">
                <div>
                  <p className="font-mono text-base font-extrabold text-[#022C22] tabular-nums">
                    {activeCount}
                  </p>
                  <p className="text-[11px] text-[#6B7280]">Active Tickets</p>
                </div>
                <div>
                  <p className="font-mono text-base font-extrabold text-[#059669] tabular-nums">
                    {worker.completedCount}
                  </p>
                  <p className="text-[11px] text-[#6B7280]">Total Resolved</p>
                </div>
              </div>
            </div>
          );
        })}
        {workers.length === 0 && (
          <div className="rounded-2xl border border-dashed border-[#C7DBD0] bg-white px-6 py-10 text-center md:col-span-2 xl:col-span-3">
            <p className="font-display text-sm font-bold text-[#022C22]">
              No active sanitation workers registered in database
            </p>
            <p className="mt-1 text-xs text-[#6B7280]">
              Workers added to the MySQL <code className="font-mono">workers</code> table will
              appear here for assignment.
            </p>
          </div>
        )}
      </section>

      {/* Live Dispatch Queue */}
      <section className="rounded-2xl border border-[#E2EAE5] bg-white p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-display text-base font-bold text-[#022C22]">
              Active Dispatch Queue ({openQueue.length})
            </h3>
            <p className="mt-0.5 text-xs text-[#6B7280]">
              Assign or reassign workers to pending and active roadside waste reports
            </p>
          </div>
        </div>

        <div className="mt-5 divide-y divide-[#EEF3F0]">
          {openQueue.map((c) => {
            const selectedVal =
              selectedWorkerByComplaint[c.id] ?? c.assignedWorkerId ?? workers[0]?.id ?? '';
            return (
              <div
                key={c.id}
                className="flex flex-col justify-between gap-4 py-4 md:flex-row md:items-center"
              >
                <div className="flex items-start gap-3.5 min-w-0">
                  <img
                    src={c.imageUrl}
                    alt={c.title}
                    referrerPolicy="no-referrer"
                    className="h-14 w-16 shrink-0 rounded-xl border border-[#DCE6E0] object-cover"
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                      <span className="font-mono font-bold text-[#064E3B]">{c.id}</span>
                      <span aria-hidden="true">·</span>
                      <WasteCategoryText category={c.category} />
                      <span aria-hidden="true">·</span>
                      <ComplaintStatusLabel status={c.status} />
                    </div>
                    <p className="mt-1 text-sm font-semibold text-[#1F2937] truncate">
                      {c.title}
                    </p>
                    <p className="text-xs text-[#6B7280]">
                      {c.locationName} ({c.ward})
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                  <select
                    aria-label={`Choose worker for ${c.id}`}
                    value={selectedVal}
                    disabled={workers.length === 0 || dispatchingId === c.id}
                    onChange={(e) =>
                      setSelectedWorkerByComplaint((prev) => ({
                        ...prev,
                        [c.id]: e.target.value,
                      }))
                    }
                    className="rounded-xl border border-[#DCE6E0] bg-[#F9FBFA] px-3 py-2 text-xs font-medium text-[#1F2937] focus:border-[#059669] disabled:opacity-60"
                  >
                    {workers.length === 0 ? (
                      <option value="">No workers available</option>
                    ) : (
                      workers.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name} — {w.ward.split(' - ')[0]}
                        </option>
                      ))
                    )}
                  </select>
                  <button
                    type="button"
                    disabled={workers.length === 0 || dispatchingId === c.id}
                    onClick={() => void handleDispatch(c)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#064E3B] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#022C22] disabled:opacity-60 whitespace-nowrap"
                  >
                    <UserCheck className="h-3.5 w-3.5" />
                    <span>{c.assignedWorkerId ? 'Reassign' : 'Dispatch'}</span>
                  </button>
                </div>
              </div>
            );
          })}
          {openQueue.length === 0 && (
            <p className="py-10 text-center text-sm text-[#6B7280]">
              All reported complaints have been resolved.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

