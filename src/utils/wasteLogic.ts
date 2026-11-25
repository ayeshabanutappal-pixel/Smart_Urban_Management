import type {
  AnalyticsRange,
  AnalyticsSnapshot,
  CategoryDistributionItem,
  Complaint,
  ComplaintStatus,
  ComplaintStatusLogItem,
  DashboardMetrics,
  DetectionResult,
  WasteCategory,
} from '../types/waste';

export const CATEGORY_COLORS: Record<WasteCategory, string> = {
  Organic: '#059669',
  Plastic: '#0284C7',
  Metal: '#D97706',
  Others: '#64748B',
};

export const CATEGORY_GUIDANCE: Record<WasteCategory, string> = {
  Organic:
    'Dispatch wet-waste bio-compost collection truck within 12 hours to prevent leachate and odor.',
  Plastic:
    'Route to Dry Material Recovery Facility (MRF) for PET/HDPE sorting and bale recycling.',
  Metal:
    'Assign utility flatbed crew with safety gloves for scrap metal recovery and municipal recycling.',
  Others:
    'Schedule general municipal sanitation crew for safe inspection, segregation, and compliant disposal.',
};

export function computeDashboardMetrics(complaints: Complaint[]): DashboardMetrics {
  const totalComplaints = complaints.length;
  const wasteDetectedCount = complaints.filter((c) => c.aiDetected).length;
  const resolvedIssues = complaints.filter((c) => c.status === 'Resolved').length;
  const pendingComplaints = complaints.filter((c) => c.status === 'Pending').length;
  const inProgressCount = complaints.filter(
    (c) => c.status === 'Assigned' || c.status === 'In Progress'
  ).length;
  const resolutionRate =
    totalComplaints === 0 ? 0 : Math.round((resolvedIssues / totalComplaints) * 100);
  const totalEstimatedKg = complaints.reduce((sum, c) => sum + c.estimatedWeightKg, 0);

  return {
    totalComplaints,
    wasteDetectedCount,
    resolvedIssues,
    pendingComplaints,
    inProgressCount,
    resolutionRate,
    totalEstimatedKg,
  };
}

export function computeCategoryDistribution(
  complaints: Complaint[]
): CategoryDistributionItem[] {
  const categories: WasteCategory[] = ['Organic', 'Plastic', 'Metal', 'Others'];
  const total = complaints.length;

  return categories.map((category) => {
    const count = complaints.filter((c) => c.category === category).length;
    const percentage = total === 0 ? 0 : Math.round((count / total) * 100);
    return {
      category,
      count,
      percentage,
      color: CATEGORY_COLORS[category],
    };
  });
}

export interface ComplaintFilterOptions {
  search?: string;
  status?: ComplaintStatus | 'All';
  category?: WasteCategory | 'All';
  ward?: string | 'All';
  citizenId?: string;
}

export function filterComplaints(
  complaints: Complaint[],
  filters: ComplaintFilterOptions
): Complaint[] {
  const q = (filters.search ?? '').trim().toLowerCase();

  return complaints.filter((item) => {
    if (filters.citizenId && item.citizenId !== filters.citizenId) return false;
    if (filters.status && filters.status !== 'All' && item.status !== filters.status) {
      return false;
    }
    if (filters.category && filters.category !== 'All' && item.category !== filters.category) {
      return false;
    }
    if (filters.ward && filters.ward !== 'All' && item.ward !== filters.ward) {
      return false;
    }
    if (q) {
      const haystack = [
        item.id,
        item.title,
        item.locationName,
        item.ward,
        item.category,
        item.citizenName,
        item.assignedWorkerName ?? '',
        item.status,
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

export function computeAnalyticsForRange(
  complaints: Complaint[],
  range: AnalyticsRange
): AnalyticsSnapshot {
  const metrics = computeDashboardMetrics(complaints);

  // Aggregate live area-wise statistics from current complaints so updates reflect immediately
  const wardMap = new Map<
    string,
    { total: number; resolved: number; collectedKg: number }
  >();

  for (const c of complaints) {
    const existing = wardMap.get(c.ward) ?? { total: 0, resolved: 0, collectedKg: 0 };
    existing.total += 1;
    if (c.status === 'Resolved') existing.resolved += 1;
    existing.collectedKg += c.estimatedWeightKg;
    wardMap.set(c.ward, existing);
  }

  const multiplier = range === '7d' ? 1 : range === '30d' ? 3.8 : 19.5;
  const areaStats = Array.from(wardMap.entries())
    .map(([ward, stat]) => {
      const scaledTotal = Math.max(stat.total, Math.round(stat.total * multiplier));
      const scaledResolved = Math.min(
        scaledTotal,
        Math.max(stat.resolved, Math.round(stat.resolved * multiplier))
      );
      const collectedKg = Math.round(stat.collectedKg * multiplier);
      const resolutionRate =
        scaledTotal === 0 ? 0 : Math.round((scaledResolved / scaledTotal) * 100);
      return {
        ward,
        total: scaledTotal,
        resolved: scaledResolved,
        collectedKg,
        resolutionRate,
      };
    })
    .sort((a, b) => b.total - a.total);

  if (range === '7d') {
    const baseKg = Math.max(420, Math.round(metrics.totalEstimatedKg * 1.4));
    const weights = [0.11, 0.14, 0.13, 0.16, 0.15, 0.17, 0.14];
    const trendValuesKg = weights.map((w) => Math.round(baseKg * w));
    return {
      range,
      rangeLabel: 'Last 7 Days',
      wasteCollectedKg: trendValuesKg.reduce((a, b) => a + b, 0),
      growthPercentage: 11.4,
      trendLabels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      trendValuesKg,
      monthlyLabels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      monthlyReported: [4, 6, 5, 8, 7, 9, 6],
      monthlyResolved: [3, 5, 5, 6, 6, 7, 5],
      areaStats,
      totalComplaints: metrics.totalComplaints,
      resolvedComplaints: metrics.resolvedIssues,
      resolutionRate: metrics.resolutionRate,
    };
  }

  if (range === '30d') {
    const baseKg = Math.max(1850, Math.round(metrics.totalEstimatedKg * 4.8));
    const weights = [0.21, 0.24, 0.26, 0.29];
    const trendValuesKg = weights.map((w) => Math.round(baseKg * w));
    const totalComplaints = Math.round(metrics.totalComplaints * 3.8);
    const resolvedComplaints = Math.min(
      totalComplaints,
      Math.round(metrics.resolvedIssues * 4.1)
    );
    return {
      range,
      rangeLabel: 'Last 30 Days',
      wasteCollectedKg: trendValuesKg.reduce((a, b) => a + b, 0),
      growthPercentage: 16.8,
      trendLabels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
      trendValuesKg,
      monthlyLabels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
      monthlyReported: [18, 22, 26, 24],
      monthlyResolved: [15, 19, 22, 21],
      areaStats,
      totalComplaints,
      resolvedComplaints,
      resolutionRate:
        totalComplaints === 0 ? 0 : Math.round((resolvedComplaints / totalComplaints) * 100),
    };
  }

  // 6 Months
  const baseKg = Math.max(9800, Math.round(metrics.totalEstimatedKg * 24));
  const weights = [0.13, 0.15, 0.16, 0.17, 0.19, 0.2];
  const trendValuesKg = weights.map((w) => Math.round(baseKg * w));
  const totalComplaints = Math.round(metrics.totalComplaints * 19.5);
  const resolvedComplaints = Math.min(
    totalComplaints,
    Math.round(metrics.resolvedIssues * 21.2)
  );
  return {
    range,
    rangeLabel: 'Last 6 Months',
    wasteCollectedKg: trendValuesKg.reduce((a, b) => a + b, 0),
    growthPercentage: 24.3,
    trendLabels: ['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'],
    trendValuesKg,
    monthlyLabels: ['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'],
    monthlyReported: [54, 62, 71, 68, 79, 85],
    monthlyResolved: [46, 54, 63, 61, 72, 78],
    areaStats,
    totalComplaints,
    resolvedComplaints,
    resolutionRate:
      totalComplaints === 0 ? 0 : Math.round((resolvedComplaints / totalComplaints) * 100),
  };
}

export function formatDisplayTimestamp(value: string): string {
  if (!value || !value.includes('T')) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  const hours = String(parsed.getHours()).padStart(2, '0');
  const minutes = String(parsed.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

export interface TimelineStep {
  key: 'reported' | 'detected' | 'assigned' | 'resolved';
  label: string;
  description: string;
  completed: boolean;
  active: boolean;
  timestamp: string;
}

export function getComplaintTimeline(
  complaint: Complaint,
  statusLogs?: ComplaintStatusLogItem[]
): TimelineStep[] {
  const statusRank: Record<ComplaintStatus, number> = {
    Pending: 1,
    Assigned: 2,
    'In Progress': 2,
    'Pending Verification': 2,
    Resolved: 3,
  };
  const rank = statusRank[complaint.status];

  const pendingLog = statusLogs?.find((l) => l.status === 'Pending');
  const dispatchLog = [...(statusLogs ?? [])]
    .reverse()
    .find(
      (l) =>
        l.status === 'Assigned' ||
        l.status === 'In Progress' ||
        l.status === 'Pending Verification'
    );
  const resolvedLog = [...(statusLogs ?? [])].reverse().find((l) => l.status === 'Resolved');

  return [
    {
      key: 'reported',
      label: 'Complaint Submitted',
      description: `Reported by ${complaint.citizenName} at ${complaint.locationName}`,
      completed: true,
      active: rank === 0,
      timestamp: formatDisplayTimestamp(pendingLog?.createdAt || complaint.reportedAt),
    },
    {
      key: 'detected',
      label: complaint.aiDetected ? 'AI Waste Classification' : 'Category Verified',
      description: complaint.aiDetected
        ? `Classified as ${complaint.category} (${complaint.aiConfidence}% confidence)`
        : `Categorized under ${complaint.category} waste stream`,
      completed: true,
      active: rank === 1,
      timestamp: formatDisplayTimestamp(complaint.reportedAt),
    },
    {
      key: 'assigned',
      label: 'Municipal Worker Assigned',
      description:
        complaint.status === 'Pending Verification'
          ? `${complaint.assignedWorkerName ?? 'Worker'} uploaded after-cleaning photo for admin review`
          : complaint.assignedWorkerName
          ? `Dispatched to ${complaint.assignedWorkerName} (${complaint.ward})`
          : dispatchLog?.note || 'Awaiting dispatch assignment from municipal office',
      completed: rank >= 2,
      active: rank === 2,
      timestamp:
        rank >= 2
          ? formatDisplayTimestamp(dispatchLog?.createdAt || complaint.updatedAt)
          : 'Pending',
    },
    {
      key: 'resolved',
      label: 'Site Cleared & Resolved',
      description:
        complaint.status === 'Resolved'
          ? complaint.resolutionNotes ||
            resolvedLog?.note ||
            'Waste cleared and area verified clean.'
          : complaint.status === 'Pending Verification'
          ? 'After-cleaning photograph submitted — awaiting admin verification'
          : 'Completion verification pending field team sign-off',
      completed: rank >= 3,
      active: rank === 3,
      timestamp:
        rank >= 3
          ? formatDisplayTimestamp(resolvedLog?.createdAt || complaint.updatedAt)
          : 'Not yet resolved',
    },
  ];
}

export function validateAuthForm(input: {
  mode: 'login' | 'register';
  name?: string;
  email: string;
  password: string;
  allowPhoneIdentifier?: boolean;
}): string | null {
  if (input.mode === 'register' && (!input.name || input.name.trim().length < 2)) {
    return 'Please enter your full name (at least 2 characters).';
  }
  const emailTrimmed = input.email.trim();
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed);
  const isPhone =
    Boolean(input.allowPhoneIdentifier) && /^\+?[\d\s\-().]{7,20}$/.test(emailTrimmed);
  if (!emailTrimmed || (!isEmail && !isPhone)) {
    return input.allowPhoneIdentifier
      ? 'Please enter a valid worker phone number or email address.'
      : 'Please enter a valid email address.';
  }
  if (!input.password || input.password.length < 6) {
    return 'Password must be at least 6 characters long.';
  }
  return null;
}

export function validateReportForm(input: {
  title: string;
  locationName: string;
  imageUrl: string;
  description: string;
}): string | null {
  if (!input.imageUrl) {
    return 'Please upload or capture a photograph of the waste before submitting.';
  }
  if (!input.title.trim() || input.title.trim().length < 4) {
    return 'Please provide a short title describing the garbage report.';
  }
  if (!input.locationName.trim()) {
    return 'Please capture GPS coordinates or enter the roadside location.';
  }
  if (!input.description.trim() || input.description.trim().length < 8) {
    return 'Please add brief details about the waste accumulation (at least 8 characters).';
  }
  return null;
}

function escapeCsvCell(value: string | number | boolean | null | undefined): string {
  const str = String(value ?? '');
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function complaintsToCsv(complaints: Complaint[]): string {
  const headers = [
    'Complaint ID',
    'Title',
    'Category',
    'Status',
    'Severity',
    'Location',
    'Ward',
    'Latitude',
    'Longitude',
    'Citizen Name',
    'Assigned Worker',
    'AI Detected',
    'AI Confidence (%)',
    'Estimated Weight (kg)',
    'Reported Date',
    'Last Updated',
  ];

  const rows = complaints.map((c) =>
    [
      c.id,
      c.title,
      c.category,
      c.status,
      c.severity,
      c.locationName,
      c.ward,
      c.coordinates.lat.toFixed(5),
      c.coordinates.lng.toFixed(5),
      c.citizenName,
      c.assignedWorkerName ?? 'Unassigned',
      c.aiDetected ? 'Yes' : 'No',
      c.aiConfidence,
      c.estimatedWeightKg,
      c.reportedAt,
      c.updatedAt,
    ]
      .map(escapeCsvCell)
      .join(',')
  );

  return [headers.join(','), ...rows].join('\n');
}

export function generateNextComplaintId(existingComplaints: Complaint[]): string {
  const maxNum = existingComplaints.reduce((max, item) => {
    const match = item.id.match(/(\d+)$/);
    if (!match) return max;
    const n = parseInt(match[1], 10);
    return Number.isFinite(n) && n > max ? n : max;
  }, 1040);

  return `WS-2026-${maxNum + 1}`;
}

/**
 * Deterministic fallback waste detector used strictly when the Flask YOLO/OpenCV
 * backend is unavailable. Clearly marks isMockResult = true.
 */
export function buildSimulatedDetection(
  filenameOrHint: string,
  colorProfile?: { greenRatio: number; blueRatio: number; grayRatio: number }
): DetectionResult {
  const hint = filenameOrHint.toLowerCase();

  let category: WasteCategory = 'Plastic';
  let detectedLabel = 'PET Bottles & Plastic Packaging';
  let confidence = 93;
  let estimatedWeightKg = 14;

  if (hint.includes('organic') || hint.includes('food') || hint.includes('leaf') || hint.includes('market')) {
    category = 'Organic';
    detectedLabel = 'Organic Food Waste & Wet Cardboard';
    confidence = 95;
    estimatedWeightKg = 22;
  } else if (hint.includes('metal') || hint.includes('can') || hint.includes('scrap') || hint.includes('tin')) {
    category = 'Metal';
    detectedLabel = 'Aluminum Cans & Scrap Metal';
    confidence = 91;
    estimatedWeightKg = 28;
  } else if (hint.includes('ewaste') || hint.includes('e-waste') || hint.includes('elec') || hint.includes('other')) {
    category = 'Others';
    detectedLabel = 'Electronic & Mixed Curbside Debris';
    confidence = 89;
    estimatedWeightKg = 19;
  } else if (hint.includes('plastic') || hint.includes('bottle') || hint.includes('bag')) {
    category = 'Plastic';
    detectedLabel = 'PET Bottles & Plastic Bags';
    confidence = 94;
    estimatedWeightKg = 15;
  } else if (colorProfile) {
    if (colorProfile.greenRatio > 0.36) {
      category = 'Organic';
      detectedLabel = 'Organic Vegetative & Compostable Waste';
      confidence = 88;
      estimatedWeightKg = 18;
    } else if (colorProfile.blueRatio > 0.35) {
      category = 'Plastic';
      detectedLabel = 'Mixed Plastic Containers & Film';
      confidence = 91;
      estimatedWeightKg = 14;
    } else if (colorProfile.grayRatio > 0.42) {
      category = 'Metal';
      detectedLabel = 'Metallic Debris & Beverage Cans';
      confidence = 86;
      estimatedWeightKg = 24;
    } else {
      category = 'Others';
      detectedLabel = 'Mixed Municipal Roadside Litter';
      confidence = 84;
      estimatedWeightKg = 16;
    }
  }

  return {
    category,
    detectedLabel,
    confidence,
    status: confidence >= 85 ? 'Detected' : 'Low Confidence',
    modelEngine: 'Simulated YOLOv8 + OpenCV (Flask API Offline)',
    isMockResult: true,
    disposalGuidance: CATEGORY_GUIDANCE[category],
    estimatedWeightKg,
    boundingBoxes: [
      {
        x: 24,
        y: 44,
        width: 52,
        height: 36,
        label: `${category} Waste`,
        confidence,
      },
      {
        x: 56,
        y: 52,
        width: 24,
        height: 22,
        label: 'Secondary cluster',
        confidence: Math.max(76, confidence - 7),
      },
    ],
    analyzedAt: new Date().toISOString(),
  };
}
