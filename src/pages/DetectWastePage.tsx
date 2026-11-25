import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Camera,
  CheckCircle2,
  Eye,
  Loader2,
  RefreshCw,
  ScanSearch,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  fetchAiDetectStatus,
  runLiveWasteDetection,
  validateDetectImageFile,
} from '../services/flaskApi';
import type { AiDetectStatus, LiveAiDetectionResult } from '../types/waste';

interface DetectWastePageProps {
  flaskApiBaseUrl: string;
  onSessionExpired: () => void;
  onReportWithDetection: (payload: {
    imageUrl: string;
    imageFile?: File | null;
    aiDetected: boolean;
    confidence: number;
    title: string;
  }) => void;
}

export function DetectWastePage({
  flaskApiBaseUrl,
  onSessionExpired,
  onReportWithDetection,
}: DetectWastePageProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  const [inputMode, setInputMode] = useState<'upload' | 'camera'>('upload');
  const [imageUrl, setImageUrl] = useState<string>('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [filenameHint, setFilenameHint] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);

  const [analyzing, setAnalyzing] = useState(false);
  const [detectError, setDetectError] = useState<string | null>(null);
  const [showAnnotated, setShowAnnotated] = useState(true);
  const [showBoxes, setShowBoxes] = useState(true);
  const [result, setResult] = useState<LiveAiDetectionResult | null>(null);

  // AI Sidecar Service Status
  const [aiStatus, setAiStatus] = useState<AiDetectStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState(false);

  const refreshAiStatus = useCallback(async () => {
    setStatusLoading(true);
    setStatusError(false);
    try {
      const status = await fetchAiDetectStatus(flaskApiBaseUrl);
      if (status === null) {
        setAiStatus(null);
        setStatusError(true);
      } else {
        setAiStatus(status);
      }
    } catch {
      setAiStatus(null);
      setStatusError(true);
    } finally {
      setStatusLoading(false);
    }
  }, [flaskApiBaseUrl]);

  useEffect(() => {
    void refreshAiStatus();
  }, [refreshAiStatus]);

  const runDetection = async (src: string, file: File | null) => {
    if (analyzing) return;
    setDetectError(null);
    setResult(null);
    setAnalyzing(true);
    try {
      const detection = await runLiveWasteDetection(
        flaskApiBaseUrl,
        { file, imageUrl: src },
        onSessionExpired
      );
      setResult(detection);
      setShowAnnotated(Boolean(detection.annotatedImageUrl));
    } catch (err) {
      setDetectError(
        err instanceof Error ? err.message : 'Unable to complete AI detection. Please retry.'
      );
    } finally {
      setAnalyzing(false);
    }
  };

  const handleFileSelected = (file: File | undefined) => {
    if (!file || analyzing) return;
    setDetectError(null);

    const validationError = validateDetectImageFile(file);
    if (validationError) {
      setDetectError(validationError);
      return;
    }

    setImageFile(file);
    setFilenameHint(file.name);
    setResult(null);

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setImageUrl(reader.result);
        void runDetection(reader.result, file);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleClear = () => {
    if (analyzing) return;
    setImageUrl('');
    setImageFile(null);
    setFilenameHint('');
    setResult(null);
    setDetectError(null);
  };

  const displayImageSrc =
    showAnnotated && result?.annotatedImageUrl ? result.annotatedImageUrl : imageUrl;

  return (
    <div className="space-y-6">
      {/* Page Heading + Compact AI Status Indicator */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-start gap-3.5">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#064E3B] text-[#A7F3D0]">
            <ScanSearch className="h-6 w-6" aria-hidden="true" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="font-display text-2xl font-extrabold text-[#022C22]">
                Detect Waste
              </h2>
              <button
                type="button"
                onClick={() => void refreshAiStatus()}
                title="Refresh AI service status"
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition-colors ${
                  statusLoading
                    ? 'border-[#DCE6E0] bg-[#F5F8F6] text-[#4B5563]'
                    : aiStatus?.available
                    ? 'border-[#A7F3D0] bg-[#ECFDF5] text-[#064E3B]'
                    : 'border-amber-200 bg-amber-50 text-amber-800'
                }`}
              >
                {statusLoading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <span
                    className={`h-2 w-2 rounded-full ${
                      aiStatus?.available ? 'bg-[#059669]' : 'bg-amber-500'
                    }`}
                  />
                )}
                <span>
                  {statusLoading
                    ? 'Checking AI Service...'
                    : aiStatus?.available
                    ? 'AI Service Online'
                    : statusError
                    ? 'AI Status Unavailable'
                    : 'AI Service Offline'}
                </span>
              </button>
            </div>
            <p className="mt-0.5 text-sm text-[#4B5563]">
              Upload or capture a JPG, PNG, or WEBP photograph for live YOLO object detection.
            </p>
          </div>
        </div>

        {/* Upload Image / Use Camera Segmented Mode */}
        <div className="inline-flex rounded-xl border border-[#DCE6E0] bg-white p-1 self-start">
          <button
            type="button"
            disabled={analyzing}
            onClick={() => setInputMode('upload')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap disabled:opacity-60 ${
              inputMode === 'upload'
                ? 'bg-[#064E3B] text-white'
                : 'text-[#4B5563] hover:text-[#022C22]'
            }`}
          >
            <Upload className="h-3.5 w-3.5" />
            <span>Upload Image</span>
          </button>
          <button
            type="button"
            disabled={analyzing}
            onClick={() => {
              setInputMode('camera');
              cameraInputRef.current?.click();
            }}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap disabled:opacity-60 ${
              inputMode === 'camera'
                ? 'bg-[#064E3B] text-white'
                : 'text-[#4B5563] hover:text-[#022C22]'
            }`}
          >
            <Camera className="h-3.5 w-3.5" />
            <span>Use Camera</span>
          </button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          handleFileSelected(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          handleFileSelected(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      {detectError && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-700"
        >
          <span className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{detectError}</span>
          </span>
          {imageUrl && (
            <button
              type="button"
              disabled={analyzing}
              onClick={() => void runDetection(imageUrl, imageFile)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Retry</span>
            </button>
          )}
        </div>
      )}

      {/* Main Workspace Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* LEFT: Upload & Preview Area */}
        <section className="rounded-2xl border border-[#E2EAE5] bg-white p-6 lg:col-span-7">
          {!imageUrl ? (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                handleFileSelected(e.dataTransfer.files?.[0]);
              }}
              className={`flex min-h-[340px] flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
                isDragging
                  ? 'border-[#059669] bg-[#ECFDF5]'
                  : 'border-[#C7DBD0] bg-[#F8FBF9]'
              }`}
            >
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#ECFDF5] text-[#059669]">
                <Upload className="h-8 w-8" />
              </div>
              <h3 className="mt-4 font-display text-lg font-bold text-[#022C22]">
                Drag &amp; drop a waste photo here
              </h3>
              <p className="mt-1.5 max-w-sm text-xs text-[#6B7280]">
                Supports JPG, JPEG, PNG, and WEBP raster photographs up to 10 MB.
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  disabled={analyzing}
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#064E3B] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#022C22] disabled:opacity-60"
                >
                  <Upload className="h-4 w-4" />
                  <span>Choose File</span>
                </button>
                <button
                  type="button"
                  disabled={analyzing}
                  onClick={() => cameraInputRef.current?.click()}
                  className="inline-flex items-center gap-2 rounded-xl border border-[#DCE6E0] bg-white px-5 py-2.5 text-sm font-semibold text-[#064E3B] transition-colors hover:bg-[#F5F8F6] disabled:opacity-60"
                >
                  <Camera className="h-4 w-4" />
                  <span>Capture Camera</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold text-[#374151] truncate">
                  Image: <span className="font-mono text-[#064E3B]">{filenameHint}</span>
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {result?.annotatedImageUrl && (
                    <button
                      type="button"
                      onClick={() => setShowAnnotated((s) => !s)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#DCE6E0] px-3 py-1.5 text-xs font-semibold text-[#374151] hover:bg-[#F5F8F6]"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span>{showAnnotated ? 'View Original' : 'View Annotated'}</span>
                    </button>
                  )}
                  {!showAnnotated && result && result.boundingBoxes.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowBoxes((b) => !b)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#DCE6E0] px-3 py-1.5 text-xs font-semibold text-[#374151] hover:bg-[#F5F8F6]"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span>{showBoxes ? 'Hide Boxes' : 'Show Boxes'}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={analyzing}
                    onClick={() => void runDetection(imageUrl, imageFile)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#DCE6E0] px-3 py-1.5 text-xs font-semibold text-[#064E3B] hover:bg-[#F5F8F6] disabled:opacity-60"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${analyzing ? 'animate-spin' : ''}`} />
                    <span>Re-run</span>
                  </button>
                  <button
                    type="button"
                    disabled={analyzing}
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#DCE6E0] px-3 py-1.5 text-xs font-semibold text-[#064E3B] hover:bg-[#F5F8F6] disabled:opacity-60"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    <span>Replace</span>
                  </button>
                  <button
                    type="button"
                    disabled={analyzing}
                    onClick={handleClear}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Remove</span>
                  </button>
                </div>
              </div>

              {/* Image Preview + YOLO Output */}
              <div className="relative overflow-hidden rounded-xl border border-[#DCE6E0] bg-[#0F172A]">
                <img
                  src={displayImageSrc}
                  alt="Waste sample under AI analysis"
                  referrerPolicy="no-referrer"
                  className="max-h-[380px] w-full object-contain bg-[#F5F8F6]"
                />
                {!showAnnotated &&
                  showBoxes &&
                  result &&
                  result.boundingBoxes.map((box, index) => (
                    <div
                      key={index}
                      style={{
                        left: `${box.x}%`,
                        top: `${box.y}%`,
                        width: `${box.width}%`,
                        height: `${box.height}%`,
                      }}
                      className="pointer-events-none absolute rounded-md border-2 border-[#059669] bg-white/5"
                    >
                      <span className="absolute -top-6 left-0 rounded bg-[#059669] px-2 py-0.5 font-mono text-[10px] font-bold text-white whitespace-nowrap shadow-xs">
                        {box.label} {box.confidence}%
                      </span>
                    </div>
                  ))}
                {analyzing && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#022C22]/70 text-white backdrop-blur-xs">
                    <Loader2 className="h-9 w-9 animate-spin text-[#A7F3D0]" />
                    <p className="mt-3 font-display text-sm font-bold">
                      Running YOLO Object Detection...
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        {/* RIGHT: AI Detection Result Panel */}
        <section className="rounded-2xl border border-[#E2EAE5] bg-white p-6 lg:col-span-5">
          <h3 className="font-display text-base font-bold text-[#022C22]">
            AI Detection Result
          </h3>
          <p className="mt-0.5 text-xs text-[#6B7280]">
            Authenticated detection via Flask <code className="font-mono text-[#064E3B]">POST /api/detect</code>
          </p>

          {!result && !analyzing && (
            <div className="mt-8 flex flex-col items-center justify-center rounded-xl border border-dashed border-[#DCE6E0] bg-[#F8FBF9] px-6 py-14 text-center">
              <ScanSearch className="h-10 w-10 text-[#9CA3AF]" />
              <p className="mt-3 text-sm font-semibold text-[#374151]">
                {detectError ? 'Detection did not complete' : 'No image analyzed yet'}
              </p>
              <p className="mt-1 text-xs text-[#6B7280]">
                {detectError
                  ? 'Fix the error above or click Retry to run YOLO detection again.'
                  : 'Upload a JPG, PNG, or WEBP image on the left to view raw COCO object detections, confidence scores, and bounding boxes.'}
              </p>
            </div>
          )}

          {result && !result.detected && (
            <div className="mt-6 space-y-4">
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
                <p className="font-bold text-sm">No objects detected</p>
                <p className="mt-1 text-amber-800">
                  The YOLO model processed the image and returned <strong>0 detections</strong>.
                  No waste or recognizable objects were identified.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={analyzing}
                  onClick={() => void runDetection(imageUrl, imageFile)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[#DCE6E0] px-4 py-2.5 text-xs font-semibold text-[#064E3B] hover:bg-[#F5F8F6]"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Retry Detection</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onReportWithDetection({
                      imageUrl,
                      imageFile,
                      aiDetected: false,
                      confidence: 0,
                      title: '',
                    })
                  }
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#064E3B] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#022C22]"
                >
                  <span>File Complaint Manually</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}

          {result && result.detected && (
            <div className="mt-5 space-y-4">
              <div className="flex items-center justify-between rounded-xl border border-[#A7F3D0] bg-[#ECFDF5] px-3.5 py-2.5 text-xs font-semibold text-[#064E3B]">
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-[#059669]" />
                  <span>{result.totalDetections} object(s) detected</span>
                </span>
                <span className="font-mono text-[11px] text-[#059669]">
                  Top: {result.topConfidencePct}%
                </span>
              </div>

              {/* Raw COCO Detections List */}
              <div className="max-h-60 divide-y divide-[#EEF3F0] overflow-y-auto rounded-xl border border-[#E2EAE5]">
                {result.detections.map((det, idx) => (
                  <div
                    key={`${det.class_name}-${idx}`}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="font-bold text-[#022C22]">{det.class_name}</p>
                      <p className="font-mono text-[11px] text-[#6B7280] tabular-nums">
                        bbox: [{det.bbox.join(', ')}]
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-mono font-bold text-[#059669] tabular-nums">
                        {Math.round(det.confidence * 100)}%
                      </p>
                      <p className="font-mono text-[10px] text-[#9CA3AF] tabular-nums">
                        raw {det.confidence.toFixed(2)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Metadata */}
              <dl className="divide-y divide-[#EEF3F0] rounded-xl border border-[#E2EAE5] text-xs">
                <div className="flex items-center justify-between px-4 py-2">
                  <dt className="text-[#6B7280]">Engine</dt>
                  <dd className="font-medium text-[#1F2937]">{result.modelEngine}</dd>
                </div>
                {result.imageDimensions && (
                  <div className="flex items-center justify-between px-4 py-2">
                    <dt className="text-[#6B7280]">Image Dimensions</dt>
                    <dd className="font-mono font-semibold text-[#022C22] tabular-nums">
                      {result.imageDimensions[0]} × {result.imageDimensions[1]} px
                    </dd>
                  </div>
                )}
              </dl>

              <div className="rounded-xl bg-[#F5F8F6] p-3.5 text-[11px] leading-relaxed text-[#4B5563]">
                YOLOv8n returns general COCO object labels. Choose the appropriate municipal waste
                category (Organic, Plastic, Metal, or Others) manually when submitting a complaint.
              </div>

              <button
                type="button"
                onClick={() =>
                  onReportWithDetection({
                    imageUrl,
                    imageFile,
                    aiDetected: true,
                    confidence: result.topConfidencePct,
                    title: result.topLabel
                      ? `${result.topLabel} waste reported via AI scan`
                      : '',
                  })
                }
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#064E3B] px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-[#022C22]"
              >
                <span>File Complaint with This Photo</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
