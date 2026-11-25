import type {
  AiDetectStatus,
  AuthResponse,
  BackendStatus,
  BoundingBox,
  Complaint,
  ComplaintDetailResponse,
  ComplaintsListResponse,
  ComplaintStatus,
  Coordinates,
  DashboardSummary,
  DetectionResult,
  LiveAiDetectionResult,
  LiveDetectResponse,
  NotificationItem,
  UserProfile,
  WasteCategory,
  Worker,
  WorkerTasksResponse,
} from '../types/waste';
import { buildSimulatedDetection, CATEGORY_GUIDANCE } from '../utils/wasteLogic';

const REQUEST_TIMEOUT_MS = 10000;
const AUTH_TOKEN_KEY = 'wastesmart_auth_token_v1';

export function resolveApiBaseUrl(baseUrl?: string): string {
  const envUrl = import.meta.env?.VITE_API_BASE_URL as string | undefined;
  const raw =
    (envUrl && envUrl.trim()) ||
    (baseUrl && baseUrl.trim()) ||
    'http://127.0.0.1:5000';
  const clean = raw.replace(/\/+$/, '');
  return clean === 'http://localhost:5000' ? 'http://127.0.0.1:5000' : clean;
}

export function getStoredAuthToken(): string | null {
  try {
    return (
      window.sessionStorage.getItem(AUTH_TOKEN_KEY) ||
      window.localStorage.getItem(AUTH_TOKEN_KEY)
    );
  } catch {
    return null;
  }
}

export function setStoredAuthToken(token: string, remember: boolean): void {
  try {
    window.sessionStorage.removeItem(AUTH_TOKEN_KEY);
    window.localStorage.removeItem(AUTH_TOKEN_KEY);
    if (remember) {
      window.localStorage.setItem(AUTH_TOKEN_KEY, token);
    } else {
      window.sessionStorage.setItem(AUTH_TOKEN_KEY, token);
    }
  } catch {
    // ignore storage quota errors
  }
}

export function clearStoredAuthToken(): void {
  try {
    window.sessionStorage.removeItem(AUTH_TOKEN_KEY);
    window.localStorage.removeItem(AUTH_TOKEN_KEY);
  } catch {
    // ignore
  }
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = REQUEST_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

async function extractErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    if (data && typeof data.message === 'string' && data.message.trim()) {
      return data.message;
    }
    if (data && typeof data.error === 'string' && data.error.trim()) {
      return data.error;
    }
  } catch {
    // response body was not JSON
  }
  return fallback;
}

export async function checkFlaskHealth(baseUrl: string): Promise<BackendStatus> {
  const cleanUrl = resolveApiBaseUrl(baseUrl);
  const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  try {
    const res = await fetchWithTimeout(`${cleanUrl}/api/health`, { method: 'GET' }, 1600);
    if (res.ok) {
      return {
        connected: true,
        mode: 'live-flask',
        lastCheckedAt: now,
        message: `Connected to Flask API at ${cleanUrl}`,
      };
    }
  } catch {
    // Expected when Flask server is offline
  }

  return {
    connected: false,
    mode: 'offline-local',
    lastCheckedAt: now,
    message: `Flask API unreachable at ${cleanUrl}`,
  };
}

export async function authenticateWithFlask(
  baseUrl: string,
  payload: {
    mode: 'login' | 'register';
    name?: string;
    email: string;
    password: string;
    phone?: string;
    ward?: string;
  }
): Promise<AuthResponse> {
  const cleanUrl = resolveApiBaseUrl(baseUrl);
  const endpoint = payload.mode === 'login' ? '/api/auth/login' : '/api/auth/register';
  const body =
    payload.mode === 'register'
      ? {
          name: payload.name?.trim(),
          email: payload.email.trim(),
          password: payload.password,
          phone: payload.phone?.trim() ?? '',
          ward: payload.ward?.trim() ?? '',
        }
      : {
          email: payload.email.trim(),
          password: payload.password,
        };

  let res: Response;
  try {
    res = await fetchWithTimeout(`${cleanUrl}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(
      `Unable to reach the WasteSmart backend at ${cleanUrl}. Please ensure the Flask server is running.`
    );
  }

  if (!res.ok) {
    const fallback =
      payload.mode === 'login'
        ? 'Authentication failed. Please check your email and password.'
        : 'Registration failed. Please verify your details and try again.';
    throw new Error(await extractErrorMessage(res, fallback));
  }

  const data = (await res.json()) as Partial<AuthResponse>;
  if (!data || !data.token || !data.user) {
    throw new Error('Unexpected authentication response from server.');
  }

  return {
    token: data.token,
    user: data.user,
  };
}

export async function fetchCurrentUser(baseUrl: string, token: string): Promise<UserProfile> {
  const cleanUrl = resolveApiBaseUrl(baseUrl);
  let res: Response;
  try {
    res = await fetchWithTimeout(`${cleanUrl}/api/auth/me`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  } catch {
    throw new Error(`Unable to verify session with ${cleanUrl}.`);
  }

  if (!res.ok) {
    throw new Error(await extractErrorMessage(res, 'Session expired or invalid.'));
  }

  const data = (await res.json()) as { user?: UserProfile };
  if (!data || !data.user) {
    throw new Error('Invalid user profile response from server.');
  }
  return data.user;
}

export async function logoutFromFlask(baseUrl: string, token: string | null): Promise<void> {
  if (!token) return;
  const cleanUrl = resolveApiBaseUrl(baseUrl);
  try {
    await fetchWithTimeout(`${cleanUrl}/api/auth/logout`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
  } catch {
    // Always allow client logout even if server is temporarily unreachable
  }
}

export function resolveMediaUrl(url: string, baseUrl: string): string {
  if (!url) return url;
  if (url.startsWith('/api/')) {
    return `${resolveApiBaseUrl(baseUrl)}${url}`;
  }
  return url;
}

function normalizeComplaint(complaint: Complaint, baseUrl: string): Complaint {
  return {
    ...complaint,
    imageUrl: resolveMediaUrl(complaint.imageUrl, baseUrl),
    afterImageUrl: complaint.afterImageUrl
      ? resolveMediaUrl(complaint.afterImageUrl, baseUrl)
      : complaint.afterImageUrl ?? null,
  };
}

async function sampleCanvasColorProfile(
  imageSrc: string
): Promise<{ greenRatio: number; blueRatio: number; grayRatio: number } | undefined> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 48;
        canvas.height = 48;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(undefined);
        ctx.drawImage(img, 0, 0, 48, 48);
        const { data } = ctx.getImageData(0, 0, 48, 48);
        let greenHits = 0;
        let blueHits = 0;
        let grayHits = 0;
        const total = data.length / 4;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          if (g > r + 15 && g > b + 10) greenHits++;
          else if (b > r + 15 && b > g + 5) blueHits++;
          else if (Math.abs(r - g) < 16 && Math.abs(g - b) < 16) grayHits++;
        }
        resolve({
          greenRatio: greenHits / total,
          blueRatio: blueHits / total,
          grayRatio: grayHits / total,
        });
      } catch {
        resolve(undefined);
      }
    };
    img.onerror = () => resolve(undefined);
    img.src = imageSrc;
  });
}

export async function detectWasteWithFlask(
  baseUrl: string,
  input: { file?: File | null; imageUrl: string; filenameHint: string },
  enabled = false
): Promise<DetectionResult> {
  if (enabled) {
    const cleanUrl = resolveApiBaseUrl(baseUrl);
    try {
      let res: Response;
      if (input.file) {
        const formData = new FormData();
        formData.append('image', input.file);
        res = await fetchWithTimeout(
          `${cleanUrl}/api/detect`,
          { method: 'POST', body: formData },
          3500
        );
      } else {
        res = await fetchWithTimeout(
          `${cleanUrl}/api/detect`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageUrl: input.imageUrl, filename: input.filenameHint }),
          },
          2500
        );
      }

      if (res.ok) {
        const data = await res.json();
        const category = (['Organic', 'Plastic', 'Metal', 'Others'].includes(data.category)
          ? data.category
          : 'Others') as WasteCategory;
        const confidence = Math.min(100, Math.max(1, Math.round(Number(data.confidence ?? 90))));
        return {
          category,
          detectedLabel: data.detectedLabel || `${category} Waste Detected`,
          confidence,
          status: confidence >= 85 ? 'Detected' : 'Low Confidence',
          modelEngine: data.modelEngine || 'Flask YOLOv8 + OpenCV Live API',
          isMockResult: false,
          disposalGuidance: data.disposalGuidance || CATEGORY_GUIDANCE[category],
          estimatedWeightKg: Number(data.estimatedWeightKg ?? 18),
          boundingBoxes: Array.isArray(data.boundingBoxes) ? data.boundingBoxes : [],
          analyzedAt: new Date().toISOString(),
        };
      }
    } catch {
      // Expected fallback when Flask AI server is offline
    }
  }

  // Clearly labelled simulated detection using actual image color heuristics
  const colorProfile = await sampleCanvasColorProfile(input.imageUrl);
  return buildSimulatedDetection(input.filenameHint, colorProfile);
}

const MAX_DETECT_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_DETECT_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp']);
const ALLOWED_DETECT_MIMES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

/**
 * Validate a local File before uploading to POST /api/detect.
 * Returns null if valid, or a clear user-facing error message.
 */
export function validateDetectImageFile(file: File): string | null {
  if (!file || file.size <= 0) {
    return 'Selected image file is empty.';
  }
  if (file.size > MAX_DETECT_IMAGE_BYTES) {
    return 'Image exceeds the 10 MB maximum upload size.';
  }
  const parsedExt = file.name.includes('.')
    ? file.name.split('.').pop()?.toLowerCase() ?? ''
    : '';
  const mime = (file.type || '').toLowerCase();
  if (!ALLOWED_DETECT_EXTS.has(parsedExt) && !ALLOWED_DETECT_MIMES.has(mime)) {
    return 'Unsupported file format. Please select a JPG, JPEG, PNG, or WEBP image.';
  }
  return null;
}

/**
 * Run real YOLO object detection through authenticated Flask POST /api/detect.
 * Never returns mock or fabricated detection results.
 */
export async function runLiveWasteDetection(
  baseUrl: string,
  input: { file?: File | null; imageUrl?: string },
  onSessionExpired?: () => void
): Promise<LiveAiDetectionResult> {
  const token = getStoredAuthToken();
  if (!token) {
    onSessionExpired?.();
    throw new Error('Authentication required. Please sign in again.');
  }

  const cleanUrl = resolveApiBaseUrl(baseUrl);
  const endpoint = `${cleanUrl}/api/detect`;
  let res: Response;

  try {
    if (input.file) {
      const validationErr = validateDetectImageFile(input.file);
      if (validationErr) {
        throw new Error(validationErr);
      }
      const formData = new FormData();
      // Browser sets multipart/form-data Content-Type + boundary automatically
      formData.append('image', input.file);
      res = await fetchWithTimeout(
        endpoint,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        },
        35000
      );
    } else if (input.imageUrl && input.imageUrl.startsWith('data:')) {
      if (input.imageUrl.startsWith('data:image/svg')) {
        throw new Error('SVG images are not supported by YOLO. Upload JPG, JPEG, PNG, or WEBP.');
      }
      res = await fetchWithTimeout(
        endpoint,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ imageUrl: input.imageUrl }),
        },
        35000
      );
    } else {
      throw new Error('Please upload a JPG, JPEG, PNG, or WEBP photograph first.');
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('AI detection request timed out. Please try again.');
    }
    if (err instanceof Error && !err.message.startsWith('Failed to fetch')) {
      throw err;
    }
    throw new Error('Unable to reach the WasteSmart backend for AI detection.');
  }

  if (res.status === 401) {
    clearStoredAuthToken();
    onSessionExpired?.();
    throw new Error('Session expired. Please sign in again.');
  }

  if (!res.ok) {
    if (res.status === 413) {
      throw new Error(await extractErrorMessage(res, 'Image exceeds the 10 MB maximum upload size.'));
    }
    if (res.status === 503) {
      throw new Error(
        await extractErrorMessage(
          res,
          'AI detection service is currently unavailable. Start the AI sidecar and retry.'
        )
      );
    }
    if (res.status === 504) {
      throw new Error(
        await extractErrorMessage(res, 'AI detection timed out. Please retry.')
      );
    }
    throw new Error(
      await extractErrorMessage(res, `AI detection failed (status ${res.status}).`)
    );
  }

  const data = (await res.json()) as LiveDetectResponse;
  if (!data || !data.success) {
    throw new Error(data?.error || 'AI detection failed.');
  }

  const detections = Array.isArray(data.detections) ? data.detections : [];
  const totalDetections = Number(data.totalDetections ?? detections.length);
  const detected = Boolean(data.detected) && totalDetections > 0;
  const dims =
    Array.isArray(data.imageDimensions) &&
    data.imageDimensions.length === 2 &&
    data.imageDimensions[0] > 0 &&
    data.imageDimensions[1] > 0
      ? (data.imageDimensions as [number, number])
      : null;

  const boundingBoxes: BoundingBox[] = detections.map((det) => {
    const [x1, y1, x2, y2] = det.bbox;
    const confPct = Math.round(det.confidence * 100);
    if (!dims) {
      return { x: 0, y: 0, width: 0, height: 0, label: det.class_name, confidence: confPct };
    }
    const [imgW, imgH] = dims;
    return {
      x: Number(((x1 / imgW) * 100).toFixed(2)),
      y: Number(((y1 / imgH) * 100).toFixed(2)),
      width: Number((((x2 - x1) / imgW) * 100).toFixed(2)),
      height: Number((((y2 - y1) / imgH) * 100).toFixed(2)),
      label: det.class_name,
      confidence: confPct,
    };
  });

  const sorted = [...detections].sort((a, b) => b.confidence - a.confidence);
  const top = sorted[0] ?? null;

  return {
    detected,
    detections,
    totalDetections,
    topLabel: top ? top.class_name : null,
    topConfidencePct: top ? Math.round(top.confidence * 100) : 0,
    imageDimensions: dims,
    boundingBoxes,
    annotatedImageUrl: data.annotatedImageUrl
      ? resolveMediaUrl(data.annotatedImageUrl, cleanUrl)
      : null,
    modelEngine: data.modelEngine || 'YOLOv8n Sidecar (ai/detector.py)',
    analyzedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Authenticated fetch helper
// ---------------------------------------------------------------------------

/**
 * Perform an authenticated JSON fetch against the Flask API.
 *
 * - Attaches the stored JWT as an Authorization header.
 * - On HTTP 401 calls onSessionExpired() so the caller can clear auth state.
 * - Throws a typed Error on non-2xx responses with the backend message included.
 * - Never logs or exposes the token value.
 */
export async function authFetch<T = unknown>(
  url: string,
  options: RequestInit = {},
  onSessionExpired?: () => void
): Promise<T> {
  const token = getStoredAuthToken();
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;

  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers as Record<string, string> | undefined),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetchWithTimeout(url, { ...options, headers }, REQUEST_TIMEOUT_MS);
  } catch {
    throw new Error(`Unable to reach the WasteSmart backend at ${url}.`);
  }

  if (res.status === 401) {
    clearStoredAuthToken();
    onSessionExpired?.();
    throw new Error('Session expired. Please sign in again.');
  }

  if (!res.ok) {
    const msg = await extractErrorMessage(res, `Request failed with status ${res.status}.`);
    throw new Error(msg);
  }

  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Dashboard API
// ---------------------------------------------------------------------------

/**
 * Fetch the role-scoped dashboard summary from GET /api/dashboard/summary.
 * Citizen gets their own data; admin gets global aggregates.
 */
export async function fetchDashboardSummary(
  baseUrl: string,
  onSessionExpired?: () => void
): Promise<DashboardSummary> {
  const cleanUrl = resolveApiBaseUrl(baseUrl);
  const summary = await authFetch<DashboardSummary>(
    `${cleanUrl}/api/dashboard/summary`,
    { method: 'GET' },
    onSessionExpired
  );
  return {
    ...summary,
    recentComplaints: (summary.recentComplaints ?? []).map((c) =>
      normalizeComplaint(c, cleanUrl)
    ),
  };
}

// ---------------------------------------------------------------------------
// Complaints & Workers APIs
// ---------------------------------------------------------------------------

/**
 * Fetch role-scoped complaints from GET /api/complaints.
 */
export async function fetchComplaints(
  baseUrl: string,
  filters?: {
    status?: ComplaintStatus | 'All';
    category?: WasteCategory | 'All';
    ward?: string;
    search?: string;
  },
  onSessionExpired?: () => void
): Promise<Complaint[]> {
  const cleanUrl = resolveApiBaseUrl(baseUrl);
  const params = new URLSearchParams();
  if (filters?.status && filters.status !== 'All') params.set('status', filters.status);
  if (filters?.category && filters.category !== 'All') params.set('category', filters.category);
  if (filters?.ward && filters.ward !== 'All') params.set('ward', filters.ward);
  if (filters?.search?.trim()) params.set('search', filters.search.trim());

  const query = params.toString();
  const data = await authFetch<ComplaintsListResponse>(
    `${cleanUrl}/api/complaints${query ? `?${query}` : ''}`,
    { method: 'GET' },
    onSessionExpired
  );
  return (data.complaints ?? []).map((c) => normalizeComplaint(c, cleanUrl));
}

/**
 * Fetch a single complaint and its audit status logs from GET /api/complaints/<id>.
 */
export async function fetchComplaintDetail(
  baseUrl: string,
  complaintId: string,
  onSessionExpired?: () => void
): Promise<ComplaintDetailResponse> {
  const cleanUrl = resolveApiBaseUrl(baseUrl);
  const data = await authFetch<ComplaintDetailResponse>(
    `${cleanUrl}/api/complaints/${encodeURIComponent(complaintId)}`,
    { method: 'GET' },
    onSessionExpired
  );
  return {
    complaint: normalizeComplaint(data.complaint, cleanUrl),
    statusLogs: data.statusLogs ?? [],
  };
}

export interface CreateComplaintDraft {
  title: string;
  description: string;
  category: WasteCategory;
  severity: 'Low' | 'Medium' | 'High';
  locationName: string;
  ward: string;
  coordinates: Coordinates;
  imageUrl: string;
  imageFile?: File | null;
  aiDetected: boolean;
  aiConfidence: number;
  estimatedWeightKg: number;
}

/**
 * Submit a new garbage complaint to POST /api/complaints and persist in MySQL.
 */
export async function submitComplaintToFlask(
  baseUrl: string,
  draft: CreateComplaintDraft,
  onSessionExpired?: () => void
): Promise<{ savedToFlask: boolean; complaint: Complaint }> {
  const cleanUrl = resolveApiBaseUrl(baseUrl);

  let body: FormData | string;
  if (draft.imageFile) {
    const formData = new FormData();
    formData.append('title', draft.title);
    formData.append('description', draft.description);
    formData.append('category', draft.category);
    formData.append('severity', draft.severity);
    formData.append('locationName', draft.locationName);
    formData.append('ward', draft.ward);
    formData.append('latitude', String(draft.coordinates.lat));
    formData.append('longitude', String(draft.coordinates.lng));
    formData.append('aiDetected', String(draft.aiDetected));
    formData.append('aiConfidence', String(draft.aiConfidence));
    formData.append('estimatedWeightKg', String(draft.estimatedWeightKg));
    formData.append('image', draft.imageFile);
    body = formData;
  } else {
    body = JSON.stringify({
      title: draft.title,
      description: draft.description,
      category: draft.category,
      severity: draft.severity,
      locationName: draft.locationName,
      ward: draft.ward,
      coordinates: draft.coordinates,
      imageUrl: draft.imageUrl,
      aiDetected: draft.aiDetected,
      aiConfidence: draft.aiConfidence,
      estimatedWeightKg: draft.estimatedWeightKg,
    });
  }

  const data = await authFetch<{ complaint: Complaint }>(
    `${cleanUrl}/api/complaints`,
    {
      method: 'POST',
      body,
    },
    onSessionExpired
  );

  if (!data?.complaint) {
    throw new Error('Unexpected response when saving complaint.');
  }

  return {
    savedToFlask: true,
    complaint: normalizeComplaint(data.complaint, cleanUrl),
  };
}

/**
 * Update complaint status, assigned worker, or resolution notes (admin only).
 */
export async function updateComplaintOnFlask(
  baseUrl: string,
  complaintId: string,
  patch: {
    status?: ComplaintStatus;
    assignedWorkerId?: string | null;
    assignedWorkerName?: string | null;
    resolutionNotes?: string;
  },
  onSessionExpired?: () => void
): Promise<Complaint> {
  const cleanUrl = resolveApiBaseUrl(baseUrl);
  const payload: Record<string, unknown> = {};
  if (patch.status !== undefined) payload.status = patch.status;
  if (patch.assignedWorkerId !== undefined) payload.assignedWorkerId = patch.assignedWorkerId;
  if (patch.resolutionNotes !== undefined) payload.resolutionNotes = patch.resolutionNotes;

  const data = await authFetch<{ complaint: Complaint }>(
    `${cleanUrl}/api/complaints/${encodeURIComponent(complaintId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
    onSessionExpired
  );

  if (!data?.complaint) {
    throw new Error('Unexpected response when updating complaint.');
  }

  return normalizeComplaint(data.complaint, cleanUrl);
}

/**
 * Fetch workers from GET /api/workers (admin only).
 * @param activeOnly - when true, appends ?active=true so only active workers are returned
 *   (used by Assign Workers dropdown). When false/undefined, all workers are returned
 *   (used by Manage Workers page).
 */
export async function fetchWorkersFromFlask(
  baseUrl: string,
  onSessionExpired?: () => void,
  activeOnly?: boolean
): Promise<Worker[]> {
  const cleanUrl = resolveApiBaseUrl(baseUrl);
  const qs = activeOnly ? '?active=true' : '';
  const data = await authFetch<{ workers: Worker[] }>(
    `${cleanUrl}/api/workers${qs}`,
    { method: 'GET' },
    onSessionExpired
  );
  return data.workers ?? [];
}

export interface CreateWorkerDraft {
  name: string;
  phone: string;
  roleTitle: string;
  ward: string;
  vehicleCode?: string;
  availability: 'Available' | 'On Duty' | 'Off Shift';
  email?: string;
  password?: string;
}

/**
 * Create a new sanitation worker via POST /api/workers (admin only).
 */
export async function createWorkerOnFlask(
  baseUrl: string,
  draft: CreateWorkerDraft,
  onSessionExpired?: () => void
): Promise<Worker> {
  const cleanUrl = resolveApiBaseUrl(baseUrl);
  const data = await authFetch<{ worker: Worker }>(
    `${cleanUrl}/api/workers`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    },
    onSessionExpired
  );
  return data.worker;
}

/**
 * Edit an existing worker via PATCH /api/workers/<id> (admin only).
 */
export async function updateWorkerOnFlask(
  baseUrl: string,
  workerId: string,
  patch: Partial<CreateWorkerDraft>,
  onSessionExpired?: () => void
): Promise<Worker> {
  const cleanUrl = resolveApiBaseUrl(baseUrl);
  const data = await authFetch<{ worker: Worker }>(
    `${cleanUrl}/api/workers/${workerId}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    },
    onSessionExpired
  );
  return data.worker;
}

/**
 * Update availability of a worker via PATCH /api/workers/<id>/availability (admin only).
 */
export async function updateWorkerAvailabilityOnFlask(
  baseUrl: string,
  workerId: string,
  availability: 'Available' | 'On Duty' | 'Off Shift',
  onSessionExpired?: () => void
): Promise<Worker> {
  const cleanUrl = resolveApiBaseUrl(baseUrl);
  const data = await authFetch<{ worker: Worker }>(
    `${cleanUrl}/api/workers/${workerId}/availability`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ availability }),
    },
    onSessionExpired
  );
  return data.worker;
}

/**
 * Toggle the active status of a worker via PATCH /api/workers/<id>/toggle-active (admin only).
 */
export async function toggleWorkerActiveOnFlask(
  baseUrl: string,
  workerId: string,
  isActive: boolean,
  onSessionExpired?: () => void
): Promise<Worker> {
  const cleanUrl = resolveApiBaseUrl(baseUrl);
  const data = await authFetch<{ worker: Worker }>(
    `${cleanUrl}/api/workers/${workerId}/toggle-active`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive }),
    },
    onSessionExpired
  );
  return data.worker;
}


// ---------------------------------------------------------------------------
// Notifications API
// ---------------------------------------------------------------------------

interface NotificationsResponse {
  notifications: NotificationItem[];
  unreadCount: number;
}

/**
 * Fetch all notifications for the authenticated user, ordered newest-first.
 * Returns the notification array and total unread count.
 */
export async function fetchNotifications(
  baseUrl: string,
  onSessionExpired?: () => void
): Promise<NotificationsResponse> {
  const cleanUrl = resolveApiBaseUrl(baseUrl);
  return authFetch<NotificationsResponse>(
    `${cleanUrl}/api/notifications`,
    { method: 'GET' },
    onSessionExpired
  );
}

/**
 * Mark a single notification as read.
 * Returns 403 / 404 as thrown Errors if the notification is inaccessible.
 */
export async function markNotificationRead(
  baseUrl: string,
  notificationId: string,
  onSessionExpired?: () => void
): Promise<NotificationItem> {
  const cleanUrl = resolveApiBaseUrl(baseUrl);
  const data = await authFetch<{ notification: NotificationItem }>(
    `${cleanUrl}/api/notifications/${notificationId}/read`,
    { method: 'PATCH' },
    onSessionExpired
  );
  return data.notification;
}

/**
 * Mark all notifications for the authenticated user as read.
 * Returns the count of records updated.
 */
export async function markAllNotificationsRead(
  baseUrl: string,
  onSessionExpired?: () => void
): Promise<{ updatedCount: number }> {
  const cleanUrl = resolveApiBaseUrl(baseUrl);
  return authFetch<{ updatedCount: number }>(
    `${cleanUrl}/api/notifications/mark-all-read`,
    { method: 'POST' },
    onSessionExpired
  );
}

// ---------------------------------------------------------------------------
// Account Preferences API
// ---------------------------------------------------------------------------

export async function saveLanguagePreferenceOnFlask(
  baseUrl: string,
  preferredLanguage: string,
  onSessionExpired?: () => void
): Promise<UserProfile> {
  const cleanUrl = resolveApiBaseUrl(baseUrl);
  const data = await authFetch<{ user: UserProfile }>(
    `${cleanUrl}/api/auth/preferences`,
    {
      method: 'PATCH',
      body: JSON.stringify({ preferredLanguage }),
    },
    onSessionExpired
  );
  return data.user;
}

// ---------------------------------------------------------------------------
// Worker Portal API (role='worker')
// ---------------------------------------------------------------------------

export async function fetchWorkerTasks(
  baseUrl: string,
  onSessionExpired?: () => void
): Promise<WorkerTasksResponse> {
  const cleanUrl = resolveApiBaseUrl(baseUrl);
  const data = await authFetch<WorkerTasksResponse>(
    `${cleanUrl}/api/worker/tasks`,
    { method: 'GET' },
    onSessionExpired
  );
  return {
    ...data,
    tasks: (data.tasks ?? []).map((t) => normalizeComplaint(t, cleanUrl)),
  };
}

export async function startWorkerTask(
  baseUrl: string,
  complaintId: string,
  onSessionExpired?: () => void
): Promise<Complaint> {
  const cleanUrl = resolveApiBaseUrl(baseUrl);
  const data = await authFetch<{ task: Complaint }>(
    `${cleanUrl}/api/worker/tasks/${encodeURIComponent(complaintId)}/start`,
    { method: 'PATCH', body: JSON.stringify({}) },
    onSessionExpired
  );
  return normalizeComplaint(data.task, cleanUrl);
}

export async function completeWorkerTask(
  baseUrl: string,
  complaintId: string,
  payload: {
    afterImageFile?: File | null;
    afterImageUrl?: string;
    completionNotes?: string;
  },
  onSessionExpired?: () => void
): Promise<Complaint> {
  const cleanUrl = resolveApiBaseUrl(baseUrl);
  const endpoint = `${cleanUrl}/api/worker/tasks/${encodeURIComponent(complaintId)}/complete`;

  let data: { task: Complaint };
  if (payload.afterImageFile) {
    const formData = new FormData();
    formData.append('afterImage', payload.afterImageFile);
    if (payload.completionNotes?.trim()) {
      formData.append('completionNotes', payload.completionNotes.trim());
    }
    data = await authFetch<{ task: Complaint }>(
      endpoint,
      { method: 'POST', body: formData },
      onSessionExpired
    );
  } else {
    data = await authFetch<{ task: Complaint }>(
      endpoint,
      {
        method: 'POST',
        body: JSON.stringify({
          afterImageUrl: payload.afterImageUrl,
          completionNotes: payload.completionNotes?.trim() || '',
        }),
      },
      onSessionExpired
    );
  }

  return normalizeComplaint(data.task, cleanUrl);
}

// ---------------------------------------------------------------------------
// Admin Verification & AI Status API
// ---------------------------------------------------------------------------

export async function verifyComplaintOnFlask(
  baseUrl: string,
  complaintId: string,
  payload: {
    decision: 'approve' | 'reject';
    note?: string;
    rejectionReason?: string;
  },
  onSessionExpired?: () => void
): Promise<Complaint> {
  const cleanUrl = resolveApiBaseUrl(baseUrl);
  const data = await authFetch<{ complaint: Complaint }>(
    `${cleanUrl}/api/complaints/${encodeURIComponent(complaintId)}/verify`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    onSessionExpired
  );
  return normalizeComplaint(data.complaint, cleanUrl);
}

export async function fetchAiDetectStatus(baseUrl: string): Promise<AiDetectStatus | null> {
  const cleanUrl = resolveApiBaseUrl(baseUrl);
  try {
    const res = await fetchWithTimeout(`${cleanUrl}/api/detect/status`, { method: 'GET' }, 2500);
    if (!res.ok) return null;
    return (await res.json()) as AiDetectStatus;
  } catch {
    return null;
  }
}

export async function checkCleanupWithAi(
  baseUrl: string,
  complaintId: string,
  onSessionExpired?: () => void
): Promise<{
  yoloAvailable: boolean;
  advisoryOnly: boolean;
  autoResolved: boolean;
  wasteStillDetected: boolean | null;
  confidence?: number;
  message: string;
}> {
  const cleanUrl = resolveApiBaseUrl(baseUrl);
  return authFetch(
    `${cleanUrl}/api/detect/verify-cleanup`,
    {
      method: 'POST',
      body: JSON.stringify({ complaintId }),
    },
    onSessionExpired
  );
}


