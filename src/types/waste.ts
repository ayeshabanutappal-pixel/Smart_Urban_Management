export type UserRole = 'citizen' | 'admin' | 'worker';

export type WasteCategory = 'Organic' | 'Plastic' | 'Metal' | 'Others';

export type ComplaintStatus =
  | 'Pending'
  | 'Assigned'
  | 'In Progress'
  | 'Pending Verification'
  | 'Resolved';

export type AnalyticsRange = '7d' | '30d' | '6m';

export type PageRoute =
  | 'dashboard'
  | 'report-garbage'
  | 'detect-waste'
  | 'my-complaints'
  | 'all-complaints'
  | 'track-complaints'
  | 'assign-workers'
  | 'manage-workers'
  | 'analytics'
  | 'reports'
  | 'notifications'
  | 'profile'
  | 'settings';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  phone: string;
  ward: string;
  preferredLanguage?: string;
  workerId?: string;
  joinedAt: string;
}

export interface AuthResponse {
  token: string;
  user: UserProfile;
}

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface BoundingBox {
  x: number; // percentage 0-100
  y: number; // percentage 0-100
  width: number; // percentage 0-100
  height: number; // percentage 0-100
  label: string;
  confidence: number;
}

export interface DetectionResult {
  category: WasteCategory;
  detectedLabel: string;
  confidence: number; // 0-100
  status: 'Detected' | 'Low Confidence' | 'Review Required';
  modelEngine: string;
  isMockResult: boolean;
  disposalGuidance: string;
  estimatedWeightKg: number;
  boundingBoxes: BoundingBox[];
  analyzedAt: string;
}

export interface Complaint {
  id: string;
  citizenId: string;
  citizenName: string;
  title: string;
  description: string;
  category: WasteCategory;
  aiDetected: boolean;
  aiConfidence: number;
  status: ComplaintStatus;
  severity: 'Low' | 'Medium' | 'High';
  locationName: string;
  ward: string;
  coordinates: Coordinates;
  imageUrl: string;
  afterImageUrl?: string | null;
  reportedAt: string;
  updatedAt: string;
  completedAt?: string | null;
  verifiedAt?: string | null;
  assignedWorkerId: string | null;
  assignedWorkerName: string | null;
  estimatedWeightKg: number;
  completionNotes?: string | null;
  rejectionReason?: string | null;
  resolutionNotes?: string;
}

export interface Worker {
  id: string;
  name: string;
  roleTitle: string;
  ward: string;
  phone: string;
  availability: 'Available' | 'On Duty' | 'Off Shift';
  activeTasks: number;
  completedCount: number;
  vehicleCode: string;
  isActive: boolean;
  userId?: string | null;
  email?: string | null;
}

export interface WorkerTasksResponse {
  worker: Worker;
  tasks: Complaint[];
  counts: {
    assigned: number;
    inProgress: number;
    pendingVerification: number;
    completed: number;
    total: number;
  };
}

export interface RawCocoDetection {
  class_name: string;
  confidence: number; // 0.0 - 1.0
  bbox: [number, number, number, number]; // [x1, y1, x2, y2] pixels
}

export interface LiveDetectResponse {
  success: boolean;
  detected: boolean;
  detections: RawCocoDetection[];
  totalDetections: number;
  imageDimensions: [number, number] | null; // [width, height]
  annotatedImageUrl: string | null;
  modelEngine: string;
  isMockResult: boolean;
  error: string | null;
}

export interface LiveAiDetectionResult {
  detected: boolean;
  detections: RawCocoDetection[];
  totalDetections: number;
  topLabel: string | null;
  topConfidencePct: number; // 0 - 100
  imageDimensions: [number, number] | null;
  boundingBoxes: BoundingBox[]; // percentage boxes derived from pixel bbox + imageDimensions
  annotatedImageUrl: string | null;
  modelEngine: string;
  analyzedAt: string;
}

export interface AiDetectStatus {
  yoloInstalled?: boolean;
  modelConfigured: boolean;
  modelLoaded?: boolean;
  available: boolean;
  mode: string;
  engine: string;
  autoResolveSupported: boolean;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  type: 'complaint' | 'assignment' | 'resolved' | 'ai';
  complaintId?: string;
  audience: 'all' | UserRole;
}

export interface AppSettings {
  flaskApiBaseUrl: string;
  useLiveFlaskApi: boolean;
  emailAlerts: boolean;
  statusPushAlerts: boolean;
  weeklyDigest: boolean;
  compactTables: boolean;
}

export interface BackendStatus {
  connected: boolean;
  mode: 'live-flask' | 'offline-local';
  lastCheckedAt: string;
  message: string;
}

export interface DashboardMetrics {
  totalComplaints: number;
  wasteDetectedCount: number;
  resolvedIssues: number;
  pendingComplaints: number;
  inProgressCount: number;
  resolutionRate: number;
  totalEstimatedKg: number;
}

export interface CategoryDistributionItem {
  category: WasteCategory;
  count: number;
  percentage: number;
  color: string;
}

export interface AnalyticsSnapshot {
  range: AnalyticsRange;
  rangeLabel: string;
  wasteCollectedKg: number;
  growthPercentage: number;
  trendLabels: string[];
  trendValuesKg: number[];
  monthlyLabels: string[];
  monthlyReported: number[];
  monthlyResolved: number[];
  areaStats: Array<{
    ward: string;
    total: number;
    resolved: number;
    collectedKg: number;
    resolutionRate: number;
  }>;
  totalComplaints: number;
  resolvedComplaints: number;
  resolutionRate: number;
}

export interface ActivityLogItem {
  id: string;
  complaintId: string | null;
  status: ComplaintStatus;
  note: string | null;
  changedAt: string;
}

export interface DashboardSummary {
  metrics: DashboardMetrics;
  categoryDistribution: Array<{ category: WasteCategory; count: number }>;
  recentActivity: ActivityLogItem[];
  recentComplaints: Complaint[];
}

export interface ComplaintStatusLogItem {
  id: string;
  complaintId: string;
  changedByUserId: string;
  status: ComplaintStatus;
  note: string | null;
  createdAt: string;
}

export interface ComplaintDetailResponse {
  complaint: Complaint;
  statusLogs: ComplaintStatusLogItem[];
}

export interface ComplaintsListResponse {
  complaints: Complaint[];
  total: number;
}
