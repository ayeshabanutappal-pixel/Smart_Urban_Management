import { useMemo, useState } from 'react';
import { CheckCircle2, Download, Printer } from 'lucide-react';
import { ComplaintStatusLabel, WasteCategoryText } from '../components/StatusText';
import type { Complaint, ComplaintStatus, WasteCategory } from '../types/waste';
import { complaintsToCsv, filterComplaints, formatDisplayTimestamp } from '../utils/wasteLogic';

interface ReportsPageProps {
  complaints: Complaint[];
}

export function ReportsPage({ complaints }: ReportsPageProps) {
  const [statusFilter, setStatusFilter] = useState<ComplaintStatus | 'All'>('All');
  const [categoryFilter, setCategoryFilter] = useState<WasteCategory | 'All'>('All');
  const [wardFilter, setWardFilter] = useState<string>('All');
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const wards = useMemo(
    () => Array.from(new Set(complaints.map((c) => c.ward))).sort(),
    [complaints]
  );

  const rows = useMemo(
    () =>
      filterComplaints(complaints, {
        status: statusFilter,
        category: categoryFilter,
        ward: wardFilter,
      }),
    [complaints, statusFilter, categoryFilter, wardFilter]
  );

  const totalWeightKg = useMemo(
    () => rows.reduce((sum, item) => sum + item.estimatedWeightKg, 0),
    [rows]
  );
  const resolvedCount = useMemo(
    () => rows.filter((item) => item.status === 'Resolved').length,
    [rows]
  );

  const handleDownloadCsv = () => {
    const csvContent = complaintsToCsv(rows);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `wastesmart-complaints-report-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setExportNotice(`Exported ${rows.length} complaint records to CSV.`);
    window.setTimeout(() => setExportNotice(null), 3500);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="font-display text-2xl font-extrabold text-[#022C22]">
            Municipal Reports
          </h2>
          <p className="mt-1 text-sm text-[#4B5563]">
            Filter operational waste records, export audit-ready CSV spreadsheets, or print
            summary tables.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 no-print">
          <button
            type="button"
            onClick={handleDownloadCsv}
            disabled={rows.length === 0}
            className="inline-flex items-center gap-2 rounded-xl bg-[#064E3B] px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#022C22] disabled:opacity-50 whitespace-nowrap"
          >
            <Download className="h-4 w-4" />
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-xl border border-[#DCE6E0] bg-white px-4 py-2.5 text-xs font-semibold text-[#064E3B] transition-colors hover:bg-[#F5F8F6] whitespace-nowrap"
          >
            <Printer className="h-4 w-4" />
            <span>Print Report</span>
          </button>
        </div>
      </div>

      {exportNotice && (
        <div
          role="status"
          className="inline-flex items-center gap-2 rounded-xl border border-[#A7F3D0] bg-[#ECFDF5] px-4 py-2.5 text-xs font-semibold text-[#064E3B]"
        >
          <CheckCircle2 className="h-4 w-4 text-[#059669]" />
          <span>{exportNotice}</span>
        </div>
      )}

      {/* Filter Controls */}
      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-[#E2EAE5] bg-white p-4 sm:grid-cols-3 no-print">
        <div>
          <label htmlFor="rep-status" className="block text-[11px] font-semibold text-[#4B5563]">
            Status
          </label>
          <select
            id="rep-status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as ComplaintStatus | 'All')}
            className="mt-1 w-full rounded-xl border border-[#DCE6E0] bg-[#F9FBFA] px-3 py-2 text-xs text-[#1F2937]"
          >
            <option value="All">All Statuses</option>
            <option value="Pending">Pending</option>
            <option value="Assigned">Assigned</option>
            <option value="In Progress">In Progress</option>
            <option value="Pending Verification">Pending Verification</option>
            <option value="Resolved">Resolved</option>
          </select>
        </div>

        <div>
          <label
            htmlFor="rep-category"
            className="block text-[11px] font-semibold text-[#4B5563]"
          >
            Waste Category
          </label>
          <select
            id="rep-category"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as WasteCategory | 'All')}
            className="mt-1 w-full rounded-xl border border-[#DCE6E0] bg-[#F9FBFA] px-3 py-2 text-xs text-[#1F2937]"
          >
            <option value="All">All Categories</option>
            <option value="Organic">Organic</option>
            <option value="Plastic">Plastic</option>
            <option value="Metal">Metal</option>
            <option value="Others">Others</option>
          </select>
        </div>

        <div>
          <label htmlFor="rep-ward" className="block text-[11px] font-semibold text-[#4B5563]">
            Municipal Ward
          </label>
          <select
            id="rep-ward"
            value={wardFilter}
            onChange={(e) => setWardFilter(e.target.value)}
            className="mt-1 w-full rounded-xl border border-[#DCE6E0] bg-[#F9FBFA] px-3 py-2 text-xs text-[#1F2937]"
          >
            <option value="All">All Wards</option>
            {wards.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Summary Strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-[#E2EAE5] bg-white p-4">
          <p className="text-xs font-medium text-[#6B7280]">Matching Records</p>
          <p className="mt-1 font-display text-2xl font-extrabold text-[#022C22] tabular-nums">
            {rows.length}
          </p>
        </div>
        <div className="rounded-2xl border border-[#E2EAE5] bg-white p-4">
          <p className="text-xs font-medium text-[#6B7280]">Resolved in Selection</p>
          <p className="mt-1 font-display text-2xl font-extrabold text-[#059669] tabular-nums">
            {resolvedCount}
          </p>
        </div>
        <div className="rounded-2xl border border-[#E2EAE5] bg-white p-4">
          <p className="text-xs font-medium text-[#6B7280]">Estimated Volume</p>
          <p className="mt-1 font-display text-2xl font-extrabold text-[#022C22] tabular-nums">
            {totalWeightKg} kg
          </p>
        </div>
      </div>

      {/* Audit Report Table */}
      <div className="overflow-hidden rounded-2xl border border-[#E2EAE5] bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#EEF3F0] bg-[#F8FAF9] font-semibold text-[#4B5563]">
                <th className="px-5 py-3">ID</th>
                <th className="px-4 py-3">Location &amp; Ward</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Citizen</th>
                <th className="px-4 py-3">Assigned Worker</th>
                <th className="px-4 py-3 text-right">Est. Weight</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-5 py-3 text-right">Reported</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEF3F0]">
              {rows.map((c) => (
                <tr key={c.id} className="hover:bg-[#F9FBFA]">
                  <td className="px-5 py-3 font-mono font-bold text-[#064E3B] whitespace-nowrap">
                    {c.id}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-[#1F2937]">{c.locationName}</p>
                    <p className="text-[11px] text-[#6B7280]">{c.ward}</p>
                  </td>
                  <td className="px-4 py-3">
                    <WasteCategoryText category={c.category} />
                  </td>
                  <td className="px-4 py-3 text-[#374151]">{c.citizenName}</td>
                  <td className="px-4 py-3 text-[#374151]">
                    {c.assignedWorkerName ?? 'Unassigned'}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-[#1F2937]">
                    {c.estimatedWeightKg} kg
                  </td>
                  <td className="px-4 py-3">
                    <ComplaintStatusLabel status={c.status} />
                  </td>
                  <td className="px-5 py-3 text-right font-mono tabular-nums text-[#6B7280] whitespace-nowrap">
                    {formatDisplayTimestamp(c.reportedAt)}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-sm text-[#6B7280]">
                    No report records match the selected filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
