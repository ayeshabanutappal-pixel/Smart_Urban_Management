import { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Calendar,
  Loader2,
  MapPin,
  PlusCircle,
  Search,
  UserCheck,
} from 'lucide-react';
import { ComplaintStatusLabel, WasteCategoryText } from '../components/StatusText';
import type { Complaint, ComplaintStatus, PageRoute, UserProfile } from '../types/waste';
import { filterComplaints, formatDisplayTimestamp } from '../utils/wasteLogic';

interface MyComplaintsPageProps {
  user: UserProfile;
  complaints: Complaint[];
  globalSearch: string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onTrackComplaint: (id: string) => void;
  onNavigate: (page: PageRoute) => void;
}

export function MyComplaintsPage({
  user,
  complaints,
  globalSearch,
  loading = false,
  error = null,
  onRetry,
  onTrackComplaint,
  onNavigate,
}: MyComplaintsPageProps) {
  const [statusFilter, setStatusFilter] = useState<ComplaintStatus | 'All'>('All');
  const [localSearch, setLocalSearch] = useState('');

  const myList = useMemo(() => {
    const query = localSearch.trim() || globalSearch;
    const citizenOwned =
      user.role === 'citizen' ? complaints.filter((c) => c.citizenId === user.id) : complaints;
    return filterComplaints(citizenOwned, { search: query, status: statusFilter });
  }, [complaints, user.id, user.role, localSearch, globalSearch, statusFilter]);

  const statuses: Array<ComplaintStatus | 'All'> = [
    'All',
    'Pending',
    'Assigned',
    'In Progress',
    'Pending Verification',
    'Resolved',
  ];

  return (
    <div className="space-y-6">
      {/* Header Row */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="font-display text-2xl font-extrabold text-[#022C22]">
            My Complaints
          </h2>
          <p className="mt-1 text-sm text-[#4B5563]">
            Review every roadside waste report you submitted and check live resolution status.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('report-garbage')}
          className="inline-flex items-center gap-2 rounded-xl bg-[#064E3B] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#022C22] self-start whitespace-nowrap"
        >
          <PlusCircle className="h-4 w-4" />
          <span>New Report</span>
        </button>
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

      {/* Filters Bar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-[#E2EAE5] bg-white p-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-1 rounded-xl bg-[#F5F8F6] p-1">
          {statuses.map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                statusFilter === st
                  ? 'bg-white text-[#064E3B] shadow-xs'
                  : 'text-[#4B5563] hover:text-[#022C22]'
              }`}
            >
              {st}
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7280]" />
          <input
            type="search"
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            placeholder="Filter by ID or street..."
            aria-label="Filter my complaints"
            className="w-full rounded-xl border border-[#DCE6E0] bg-[#F9FBFA] py-2 pl-9 pr-3 text-xs text-[#1F2937] focus:border-[#059669] focus:bg-white"
          />
        </div>
      </div>

      {/* Cards Grid */}
      {loading && complaints.length === 0 ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-[#E2EAE5] bg-white px-6 py-16 text-sm text-[#6B7280]">
          <Loader2 className="h-5 w-5 animate-spin text-[#059669]" />
          <span>Loading your complaints...</span>
        </div>
      ) : myList.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#C7DBD0] bg-white px-6 py-16 text-center">
          <p className="font-display text-base font-bold text-[#022C22]">
            {complaints.length === 0 ? 'No complaints submitted yet' : 'No matching complaints found'}
          </p>
          <p className="mt-1 text-xs text-[#6B7280]">
            {complaints.length === 0
              ? 'File a roadside garbage report to begin tracking municipal cleanup.'
              : 'Adjust your status filter or file a new roadside garbage report.'}
          </p>
          <button
            type="button"
            onClick={() => onNavigate('report-garbage')}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#064E3B] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#022C22]"
          >
            <PlusCircle className="h-4 w-4" />
            <span>Report Garbage</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {myList.map((complaint) => (
            <article
              key={complaint.id}
              className="flex flex-col overflow-hidden rounded-2xl border border-[#E2EAE5] bg-white transition-colors hover:border-[#059669]/45"
            >
              <div className="relative h-44 w-full bg-[#EEF3F0]">
                <img
                  src={complaint.imageUrl}
                  alt={complaint.title}
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#022C22]/85 via-[#022C22]/40 to-transparent px-4 pb-3 pt-8">
                  <span className="font-mono text-xs font-bold text-[#A7F3D0]">
                    {complaint.id}
                  </span>
                </div>
              </div>

              <div className="flex flex-1 flex-col p-5">
                <div className="flex items-center justify-between gap-2">
                  <WasteCategoryText category={complaint.category} />
                  <ComplaintStatusLabel status={complaint.status} />
                </div>

                <h3 className="mt-2.5 font-display text-base font-bold text-[#022C22] line-clamp-2">
                  {complaint.title}
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-[#4B5563] line-clamp-2">
                  {complaint.description}
                </p>

                <div className="mt-4 space-y-1.5 border-t border-[#EEF3F0] pt-3.5 text-xs text-[#4B5563]">
                  <p className="flex items-center gap-2 truncate">
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-[#059669]" />
                    <span className="truncate">{complaint.locationName}</span>
                  </p>
                  <p className="flex items-center gap-2">
                    <Calendar className="h-3.5 w-3.5 shrink-0 text-[#059669]" />
                    <span className="font-mono text-[11px] tabular-nums">
                      {formatDisplayTimestamp(complaint.reportedAt)}
                    </span>
                  </p>
                  <p className="flex items-center gap-2">
                    <UserCheck className="h-3.5 w-3.5 shrink-0 text-[#059669]" />
                    <span>
                      {complaint.assignedWorkerName
                        ? `Worker: ${complaint.assignedWorkerName}`
                        : 'Awaiting worker assignment'}
                    </span>
                  </p>
                </div>

                <div className="mt-4 pt-2">
                  <button
                    type="button"
                    onClick={() => onTrackComplaint(complaint.id)}
                    className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-[#DCE6E0] bg-[#F5F8F6] py-2.5 text-xs font-semibold text-[#064E3B] transition-colors hover:border-[#059669] hover:bg-[#ECFDF5]"
                  >
                    <span>Track Progress</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

