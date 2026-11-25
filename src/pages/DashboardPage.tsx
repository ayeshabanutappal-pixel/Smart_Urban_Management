import { useMemo } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Clock,
  Leaf,
  Loader2,
  MapPin,
  PlusCircle,
  ScanSearch,
  Sparkles,
  Users,
} from 'lucide-react';
import type { ChartConfiguration } from 'chart.js';
import { ChartCanvas } from '../components/ChartCanvas';
import { ComplaintStatusLabel, WasteCategoryText } from '../components/StatusText';
import type {
  Complaint,
  DashboardMetrics,
  DashboardSummary,
  PageRoute,
  UserProfile,
  WasteCategory,
} from '../types/waste';
import {
  CATEGORY_COLORS,
  formatDisplayTimestamp,
} from '../utils/wasteLogic';

const EMPTY_METRICS: DashboardMetrics = {
  totalComplaints: 0,
  wasteDetectedCount: 0,
  resolvedIssues: 0,
  pendingComplaints: 0,
  inProgressCount: 0,
  resolutionRate: 0,
  totalEstimatedKg: 0,
};

const EMPTY_CATEGORIES: WasteCategory[] = ['Organic', 'Plastic', 'Metal', 'Others'];

interface DashboardPageProps {
  user: UserProfile;
  complaints?: Complaint[];
  /** Live summary from Flask /api/dashboard/summary — null while loading or on error */
  dashboardSummary?: DashboardSummary | null;
  /** True while the initial fetch is in flight */
  dashboardLoading?: boolean;
  /** Error message when /api/dashboard/summary fails */
  dashboardError?: string | null;
  /** Callback to retry loading dashboard data */
  onRetryDashboard?: () => void;
  onNavigate: (page: PageRoute) => void;
  onTrackComplaint: (complaintId: string) => void;
}

export function DashboardPage({
  user,
  dashboardSummary,
  dashboardLoading = false,
  dashboardError = null,
  onRetryDashboard,
  onNavigate,
  onTrackComplaint,
}: DashboardPageProps) {
  const metrics = useMemo(
    () => dashboardSummary?.metrics ?? EMPTY_METRICS,
    [dashboardSummary]
  );

  const distribution = useMemo(() => {
    if (dashboardSummary?.categoryDistribution) {
      const total = dashboardSummary.categoryDistribution.reduce((s, d) => s + d.count, 0);
      return dashboardSummary.categoryDistribution.map((d) => ({
        category: d.category,
        count: d.count,
        percentage: total === 0 ? 0 : Math.round((d.count / total) * 100),
        color: CATEGORY_COLORS[d.category],
      }));
    }
    return EMPTY_CATEGORIES.map((category) => ({
      category,
      count: 0,
      percentage: 0,
      color: CATEGORY_COLORS[category],
    }));
  }, [dashboardSummary]);

  const doughnutConfig = useMemo<ChartConfiguration<'doughnut'>>(
    () => ({
      type: 'doughnut',
      data: {
        labels: distribution.map((d) => d.category),
        datasets: [
          {
            data: distribution.map((d) => d.count),
            backgroundColor: distribution.map((d) => d.color),
            borderColor: '#FFFFFF',
            borderWidth: 3,
            hoverOffset: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '68%',
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#022C22',
            padding: 10,
            cornerRadius: 8,
            callbacks: {
              label: (ctx) => {
                const idx = ctx.dataIndex;
                const item = distribution[idx];
                return ` ${item.category}: ${item.count} reports (${item.percentage}%)`;
              },
            },
          },
        },
      },
    }),
    [distribution]
  );

  const recentActivity = useMemo(() => {
    if (!dashboardSummary) return [];
    return (dashboardSummary.recentActivity ?? []).map((log) => {
      let actionLabel = 'Status updated';
      if (log.status === 'Resolved') actionLabel = 'Resolved complaint';
      else if (log.status === 'Pending Verification') actionLabel = 'Cleanup awaiting verification';
      else if (log.status === 'In Progress') actionLabel = 'Sanitation crew on site';
      else if (log.status === 'Assigned') actionLabel = 'Worker assigned';
      else if (log.status === 'Pending') actionLabel = 'Newly reported garbage';
      return {
        logKey: log.id,
        id: log.complaintId ?? log.id,
        canTrack: Boolean(log.complaintId),
        actionLabel,
        title: log.note ?? `Complaint ${log.complaintId ?? log.id}`,
        location: '',
        status: log.status,
        time: formatDisplayTimestamp(log.changedAt),
      };
    });
  }, [dashboardSummary]);

  const recentComplaints = useMemo(
    () => dashboardSummary?.recentComplaints ?? [],
    [dashboardSummary]
  );

  const statCards = [
    {
      label: 'Total Complaints',
      value: metrics.totalComplaints,
      subtext: `${metrics.totalEstimatedKg} kg estimated volume`,
      icon: ClipboardList,
      accentBg: 'bg-[#ECFDF5] text-[#064E3B]',
    },
    {
      label: 'Waste Detected',
      value: metrics.wasteDetectedCount,
      subtext: 'Classified via YOLO / OpenCV',
      icon: ScanSearch,
      accentBg: 'bg-[#E0F2FE] text-[#0369A1]',
    },
    {
      label: 'Resolved Issues',
      value: metrics.resolvedIssues,
      subtext: `${metrics.resolutionRate}% city resolution rate`,
      icon: CheckCircle2,
      accentBg: 'bg-[#D1FAE5] text-[#059669]',
    },
    {
      label: 'Pending Complaints',
      value: metrics.pendingComplaints,
      subtext: `${metrics.inProgressCount} active in dispatch`,
      icon: Clock,
      accentBg: 'bg-[#FEF3C7] text-[#B45309]',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Welcome Hero Banner with Eco City Skyline Illustration */}
      <section className="relative overflow-hidden rounded-2xl bg-[#064E3B] text-white shadow-sm">
        <img
          src="/assets/images/welcome-banner-city.svg"
          alt="Eco-friendly green city skyline"
          referrerPolicy="no-referrer"
          className="pointer-events-none absolute inset-0 h-full w-full object-cover object-right"
        />
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#022C22]/95 via-[#064E3B]/80 to-transparent"
          aria-hidden="true"
        />
        <div className="relative z-10 flex flex-col justify-between gap-5 px-6 py-7 sm:flex-row sm:items-center sm:px-8 sm:py-8">
          <div className="max-w-xl">
            <p className="text-xs font-semibold tracking-wide text-[#A7F3D0]">
              {user.role === 'admin'
                ? 'Municipal Operations Overview'
                : `Welcome back, ${user.name}`}
            </p>
            <h2 className="mt-1.5 font-display text-2xl font-extrabold tracking-tight text-white [text-wrap:balance] sm:text-3xl">
              Hello, Welcome to WasteSmart!
            </h2>
            <p className="mt-2 text-sm text-[#D1FAE5]/90 sm:text-base">
              Let&apos;s build a cleaner and greener city together.
            </p>
          </div>
          <div className="shrink-0">
            {user.role === 'citizen' ? (
              <button
                type="button"
                onClick={() => onNavigate('report-garbage')}
                className="inline-flex items-center gap-2 rounded-xl bg-[#A7F3D0] px-5 py-3 text-sm font-bold text-[#022C22] shadow-sm transition-colors hover:bg-white whitespace-nowrap"
              >
                <PlusCircle className="h-4.5 w-4.5" />
                <span>Report Garbage</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onNavigate('all-complaints')}
                className="inline-flex items-center gap-2 rounded-xl bg-[#A7F3D0] px-5 py-3 text-sm font-bold text-[#022C22] shadow-sm transition-colors hover:bg-white whitespace-nowrap"
              >
                <ClipboardList className="h-4.5 w-4.5" />
                <span>Manage All Complaints</span>
              </button>
            )}
          </div>
        </div>
      </section>

      {dashboardError && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-700"
        >
          <span className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{dashboardError}</span>
          </span>
          {onRetryDashboard && (
            <button
              type="button"
              onClick={onRetryDashboard}
              className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {/* 4 KPI Statistics Cards */}
      <section aria-label="Key Waste Statistics" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {dashboardLoading
          ? statCards.map((card) => {
              const Icon = card.icon;
              return (
                <div
                  key={card.label}
                  className="flex items-start justify-between rounded-2xl border border-[#E2EAE5] bg-white p-5"
                >
                  <div>
                    <p className="text-xs font-semibold text-[#4B5563]">{card.label}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <Loader2 className="h-6 w-6 animate-spin text-[#059669]" aria-hidden="true" />
                    </div>
                    <p className="mt-1.5 text-xs text-[#E2EAE5]">Loading…</p>
                  </div>
                  <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${card.accentBg}`}>
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                </div>
              );
            })
          : statCards.map((card) => {
              const Icon = card.icon;
              return (
                <div
                  key={card.label}
                  className="flex items-start justify-between rounded-2xl border border-[#E2EAE5] bg-white p-5 transition-colors hover:border-[#059669]/35"
                >
                  <div>
                    <p className="text-xs font-semibold text-[#4B5563]">{card.label}</p>
                    <p className="mt-2 font-display text-3xl font-extrabold text-[#022C22] tabular-nums">
                      {card.value}
                    </p>
                    <p className="mt-1.5 text-xs text-[#6B7280]">{card.subtext}</p>
                  </div>
                  <div
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${card.accentBg}`}
                  >
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                </div>
              );
            })}
      </section>

      {/* Core 2-Column Section: Waste Overview (Doughnut) + Recent Activity */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* LEFT: Waste Overview Doughnut Chart */}
        <div className="flex flex-col justify-between rounded-2xl border border-[#E2EAE5] bg-white p-6 lg:col-span-5">
          <div>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display text-base font-bold text-[#022C22]">
                  Waste Overview
                </h3>
                <p className="mt-0.5 text-xs text-[#6B7280]">
                  Detected distribution across municipal waste streams
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('detect-waste')}
                className="text-xs font-semibold text-[#059669] hover:text-[#064E3B] whitespace-nowrap"
              >
                Run AI scan
              </button>
            </div>

            <div className="mt-6 grid grid-cols-1 items-center gap-6 sm:grid-cols-2">
              <div className="relative mx-auto w-full max-w-[200px]">
                <ChartCanvas
                  config={doughnutConfig}
                  heightClass="h-48"
                  ariaLabel="Waste distribution doughnut chart showing Organic, Plastic, Metal, and Others"
                  testId="dashboard-waste-doughnut"
                />
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="font-display text-2xl font-extrabold text-[#022C22] tabular-nums">
                    {metrics.totalComplaints}
                  </span>
                  <span className="text-[11px] font-medium text-[#6B7280]">Total Reports</span>
                </div>
              </div>

              <div className="space-y-3.5">
                {distribution.map((item) => (
                  <div key={item.category} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-2 font-semibold text-[#1F2937]">
                        <span
                          className="h-2.5 w-2.5 rounded-xs shrink-0"
                          style={{ backgroundColor: item.color }}
                          aria-hidden="true"
                        />
                        {item.category}
                      </span>
                      <span className="font-mono font-semibold text-[#022C22] tabular-nums">
                        {item.percentage}%
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#EEF3F0]">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${item.percentage}%`,
                          backgroundColor: item.color,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-3 border-t border-[#EEF3F0] pt-4 text-xs">
            <div>
              <p className="text-[#6B7280]">AI Verified</p>
              <p className="mt-0.5 font-mono font-bold text-[#022C22] tabular-nums">
                {metrics.totalComplaints > 0
                  ? Math.round((metrics.wasteDetectedCount / metrics.totalComplaints) * 100)
                  : 0}
                %
              </p>
            </div>
            <div>
              <p className="text-[#6B7280]">Total Volume</p>
              <p className="mt-0.5 font-mono font-bold text-[#022C22] tabular-nums">
                {metrics.totalEstimatedKg} kg
              </p>
            </div>
            <div>
              <p className="text-[#6B7280]">Cleared Rate</p>
              <p className="mt-0.5 font-mono font-bold text-[#059669] tabular-nums">
                {metrics.resolutionRate}%
              </p>
            </div>
          </div>
        </div>

        {/* RIGHT: Recent Activity */}
        <div className="rounded-2xl border border-[#E2EAE5] bg-white p-6 lg:col-span-7">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-display text-base font-bold text-[#022C22]">
                Recent Activity
              </h3>
              <p className="mt-0.5 text-xs text-[#6B7280]">
                Live updates on newly reported garbage, worker dispatch, and resolutions
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('track-complaints')}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#059669] hover:text-[#064E3B] whitespace-nowrap"
            >
              <span>Track map</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="mt-5 divide-y divide-[#EEF3F0]">
            {recentActivity.map((act) => (
              <button
                key={act.logKey}
                type="button"
                onClick={() => act.canTrack && onTrackComplaint(act.id)}
                className="flex w-full items-start justify-between gap-4 py-3 text-left transition-colors hover:bg-[#F5F8F6] rounded-lg px-2 -mx-2"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[#6B7280]">
                    <span className="font-mono font-semibold text-[#064E3B]">{act.id}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-medium text-[#374151]">{act.actionLabel}</span>
                  </div>
                  <p className="mt-1 text-sm font-semibold text-[#1F2937] truncate">
                    {act.title}
                  </p>
                  {act.location && (
                    <p className="mt-0.5 text-xs text-[#6B7280] truncate">{act.location}</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <ComplaintStatusLabel status={act.status} />
                  <span className="font-mono text-[11px] text-[#6B7280] tabular-nums">
                    {act.time}
                  </span>
                </div>
              </button>
            ))}
            {recentActivity.length === 0 && (
              <p className="py-8 text-center text-sm text-[#6B7280]">
                {dashboardLoading
                  ? 'Loading activity…'
                  : dashboardError
                  ? 'Unable to load recent activity.'
                  : 'No recent activity yet. Status updates and assignments will appear here.'}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Quick Action Cards Row */}
      <section aria-label="Quick Actions" className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <button
          type="button"
          onClick={() => onNavigate(user.role === 'admin' ? 'assign-workers' : 'report-garbage')}
          className="group flex items-center justify-between rounded-2xl border border-[#E2EAE5] bg-white p-5 text-left transition-colors hover:border-[#059669]"
        >
          <div className="flex items-center gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#064E3B] text-[#A7F3D0]">
              {user.role === 'admin' ? (
                <Users className="h-5 w-5" />
              ) : (
                <PlusCircle className="h-5 w-5" />
              )}
            </div>
            <div>
              <h4 className="font-display text-sm font-bold text-[#022C22]">
                {user.role === 'admin' ? 'Assign Municipal Crew' : 'Report Roadside Garbage'}
              </h4>
              <p className="mt-0.5 text-xs text-[#6B7280]">
                {user.role === 'admin'
                  ? 'Dispatch available sanitation trucks'
                  : 'Upload photo & tag exact GPS spot'}
              </p>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-[#059669] transition-transform group-hover:translate-x-1 shrink-0" />
        </button>

        <button
          type="button"
          onClick={() => onNavigate('detect-waste')}
          className="group flex items-center justify-between rounded-2xl border border-[#E2EAE5] bg-white p-5 text-left transition-colors hover:border-[#059669]"
        >
          <div className="flex items-center gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#ECFDF5] text-[#059669]">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h4 className="font-display text-sm font-bold text-[#022C22]">
                AI Waste Detection
              </h4>
              <p className="mt-0.5 text-xs text-[#6B7280]">
                Classify plastic, organic &amp; metal photos
              </p>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-[#059669] transition-transform group-hover:translate-x-1 shrink-0" />
        </button>

        <button
          type="button"
          onClick={() => onNavigate(user.role === 'admin' ? 'analytics' : 'track-complaints')}
          className="group flex items-center justify-between rounded-2xl border border-[#E2EAE5] bg-white p-5 text-left transition-colors hover:border-[#059669]"
        >
          <div className="flex items-center gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#ECFDF5] text-[#064E3B]">
              <MapPin className="h-5 w-5" />
            </div>
            <div>
              <h4 className="font-display text-sm font-bold text-[#022C22]">
                {user.role === 'admin' ? 'Waste Analytics' : 'Track Complaint Map'}
              </h4>
              <p className="mt-0.5 text-xs text-[#6B7280]">
                {user.role === 'admin'
                  ? '7-day, 30-day & 6-month city trends'
                  : 'Inspect pins & 4-stage resolution timeline'}
              </p>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-[#059669] transition-transform group-hover:translate-x-1 shrink-0" />
        </button>
      </section>

      {/* Recent Complaints Table */}
      <section className="overflow-hidden rounded-2xl border border-[#E2EAE5] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EEF3F0] px-6 py-4">
          <div>
            <h3 className="font-display text-base font-bold text-[#022C22]">
              Recent Complaints
            </h3>
            <p className="text-xs text-[#6B7280]">
              Click any record to view its interactive map pin and progress timeline
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              onNavigate(user.role === 'admin' ? 'all-complaints' : 'my-complaints')
            }
            className="rounded-lg border border-[#DCE6E0] px-3.5 py-2 text-xs font-semibold text-[#064E3B] hover:bg-[#F5F8F6] whitespace-nowrap"
          >
            View all records
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#EEF3F0] bg-[#F8FAF9] text-xs font-semibold text-[#4B5563]">
                <th className="px-6 py-3">Complaint</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Location</th>
                <th className="px-4 py-3">Assigned Worker</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-6 py-3 text-right">Reported</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEF3F0]">
              {recentComplaints.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => onTrackComplaint(c.id)}
                  className="cursor-pointer transition-colors hover:bg-[#F5F8F6]"
                >
                  <td className="px-6 py-3.5">
                    <div className="flex items-center gap-3">
                      <img
                        src={c.imageUrl}
                        alt={c.title}
                        referrerPolicy="no-referrer"
                        className="h-10 w-12 rounded-lg border border-[#E2EAE5] object-cover shrink-0 bg-[#EEF3F0]"
                      />
                      <div className="min-w-0">
                        <p className="font-mono text-xs font-semibold text-[#064E3B]">
                          {c.id}
                        </p>
                        <p className="max-w-[240px] truncate text-xs font-medium text-[#1F2937]">
                          {c.title}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <WasteCategoryText category={c.category} />
                  </td>
                  <td className="px-4 py-3.5">
                    <p className="max-w-[200px] truncate text-xs font-medium text-[#1F2937]">
                      {c.locationName}
                    </p>
                    <p className="text-[11px] text-[#6B7280]">{c.ward}</p>
                  </td>
                  <td className="px-4 py-3.5 text-xs text-[#374151]">
                    {c.assignedWorkerName ?? 'Unassigned'}
                  </td>
                  <td className="px-4 py-3.5">
                    <ComplaintStatusLabel status={c.status} />
                  </td>
                  <td className="px-6 py-3.5 text-right font-mono text-xs text-[#6B7280] tabular-nums whitespace-nowrap">
                    {formatDisplayTimestamp(c.reportedAt)}
                  </td>
                </tr>
              ))}
              {recentComplaints.length === 0 && !dashboardLoading && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-10 text-center text-sm text-[#6B7280]"
                  >
                    {dashboardError
                      ? 'Unable to load complaints.'
                      : dashboardSummary
                      ? 'No complaints submitted yet. Use "Report Garbage" to file your first report.'
                      : 'Loading complaints…'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Environmental Awareness Banner */}
      <section className="flex flex-col justify-between gap-4 rounded-2xl border border-[#CDE7DA] bg-[#ECFDF5] px-6 py-5 sm:flex-row sm:items-center">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#064E3B] text-[#A7F3D0]">
            <Leaf className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h3 className="font-display text-sm font-bold text-[#022C22]">
              Segregate at Source, Accelerate Recycling
            </h3>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-[#1F4B3B]">
              Separating organic wet waste from dry plastics and scrap metal helps municipal crews
              divert up to 78% of reported roadside litter away from landfills into aerobic compost
              and material recovery plants.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('detect-waste')}
          className="shrink-0 rounded-xl bg-[#064E3B] px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#022C22] whitespace-nowrap"
        >
          Check Waste Category
        </button>
      </section>
    </div>
  );
}
