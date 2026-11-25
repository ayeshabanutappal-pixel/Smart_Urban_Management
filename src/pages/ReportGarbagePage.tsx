import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  Crosshair,
  Info,
  Loader2,
  MapPin,
  ScanSearch,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { InteractiveCityMap } from '../components/InteractiveCityMap';
import { SAMPLE_WASTE_PRESETS } from '../data/seedData';
import {
  fetchAiDetectStatus,
  runLiveWasteDetection,
  validateDetectImageFile,
} from '../services/flaskApi';
import {
  type GeocodingSuggestion,
  reverseGeocode,
  searchLocations,
} from '../services/geocoding';
import type {
  AiDetectStatus,
  Complaint,
  Coordinates,
  LiveAiDetectionResult,
  UserProfile,
  WasteCategory,
} from '../types/waste';
import { CATEGORY_COLORS, validateReportForm } from '../utils/wasteLogic';

const WARDS = [
  'Ward 1 - Civic Center',
  'Ward 2 - Central Market',
  'Ward 4 - Greenpark Avenue',
  'Ward 5 - Industrial Belt',
  'Ward 7 - Riverside Sector',
];

const CUSTOM_WARD_OPTION = '__custom__';

interface ReportGarbagePageProps {
  user: UserProfile;
  flaskApiBaseUrl: string;
  useLiveFlaskApi: boolean;
  onSessionExpired?: () => void;
  prefillData?: {
    imageUrl?: string;
    imageFile?: File | null;
    aiDetected?: boolean;
    category?: WasteCategory;
    confidence?: number;
    title?: string;
  } | null;
  onSubmitComplaint: (draft: {
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
  }) => Promise<{ complaint: Complaint; savedToFlask: boolean }>;
  onTrackComplaint: (id: string) => void;
}

export function ReportGarbagePage({
  flaskApiBaseUrl,
  onSessionExpired,
  prefillData,
  onSubmitComplaint,
  onTrackComplaint,
}: ReportGarbagePageProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const searchContainerRef = useRef<HTMLDivElement | null>(null);
  const suppressSearchRef = useRef(false);
  const reverseAbortRef = useRef<AbortController | null>(null);

  const [imageUrl, setImageUrl] = useState(prefillData?.imageUrl ?? '');
  const [imageFile, setImageFile] = useState<File | null>(prefillData?.imageFile ?? null);
  const [title, setTitle] = useState(prefillData?.title ?? '');
  const [category, setCategory] = useState<WasteCategory>(prefillData?.category ?? 'Plastic');
  const [severity, setSeverity] = useState<'Low' | 'Medium' | 'High'>('Medium');
  const [locationName, setLocationName] = useState('');
  const [ward, setWard] = useState('');
  const [customWardMode, setCustomWardMode] = useState(false);
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [description, setDescription] = useState('');

  // Location search & reverse geocoding state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAddress, setSelectedAddress] = useState('');
  const [suggestions, setSuggestions] = useState<GeocodingSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [reverseLoading, setReverseLoading] = useState(false);

  // Device GPS state
  const [gpsStatus, setGpsStatus] = useState<string | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);

  const [detecting, setDetecting] = useState(false);
  const [aiStatus, setAiStatus] = useState<AiDetectStatus | null>(null);
  const [aiDetectError, setAiDetectError] = useState<string | null>(null);
  const [liveDetection, setLiveDetection] = useState<LiveAiDetectionResult | null>(null);
  const [prefillAiMeta, setPrefillAiMeta] = useState<{
    aiDetected: boolean;
    confidence: number;
  } | null>(
    prefillData?.aiDetected && prefillData.confidence
      ? { aiDetected: true, confidence: prefillData.confidence }
      : null
  );

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedRecord, setSubmittedRecord] = useState<{
    complaint: Complaint;
    savedToFlask: boolean;
  } | null>(null);

  // Close autocomplete dropdown on outside click
  useEffect(() => {
    const onOutsideClick = (e: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', onOutsideClick);
    return () => document.removeEventListener('mousedown', onOutsideClick);
  }, []);

  // Cleanup any in-flight reverse geocoding request on unmount
  useEffect(() => {
    return () => {
      reverseAbortRef.current?.abort();
    };
  }, []);

  // Debounced live location autocomplete via OpenStreetMap Nominatim
  useEffect(() => {
    if (suppressSearchRef.current) {
      suppressSearchRef.current = false;
      return;
    }

    const trimmed = searchQuery.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setSearchLoading(false);
      setSearchError(null);
      setHighlightedIndex(-1);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearchLoading(true);
      setSearchError(null);
      void searchLocations(flaskApiBaseUrl, trimmed, controller.signal)
        .then((items) => {
          setSuggestions(items);
          setShowSuggestions(true);
          setHighlightedIndex(items.length > 0 ? 0 : -1);
          if (items.length === 0) {
            setSearchError(
              'No matching places found. Try including area or city, or click the map below.'
            );
          }
        })
        .catch((err) => {
          if (err instanceof DOMException && err.name === 'AbortError') return;
          setSuggestions([]);
          setSearchError(
            err instanceof Error
              ? err.message
              : 'Location search failed. You can still pin directly on the map.'
          );
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setSearchLoading(false);
          }
        });
    }, 360);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [searchQuery, flaskApiBaseUrl]);

  const handleSelectSuggestion = (item: GeocodingSuggestion) => {
    reverseAbortRef.current?.abort();
    setReverseLoading(false);
    setError(null);
    setGpsError(null);
    setGpsStatus(null);
    setSearchError(null);

    suppressSearchRef.current = true;
    setSearchQuery(item.shortLabel);
    setSelectedAddress(item.displayName);
    setLocationName(item.shortLabel);
    setCoordinates({ lat: item.lat, lng: item.lng });
    setShowSuggestions(false);
    setHighlightedIndex(-1);
  };

  const handleExplicitSearch = async () => {
    const trimmed = searchQuery.trim();
    if (trimmed.length < 2) {
      setSearchError('Enter at least 2 characters (street, area, landmark, or address).');
      return;
    }
    if (suggestions.length > 0) {
      const target =
        highlightedIndex >= 0 && suggestions[highlightedIndex]
          ? suggestions[highlightedIndex]
          : suggestions[0];
      handleSelectSuggestion(target);
      return;
    }

    setSearchLoading(true);
    setSearchError(null);
    try {
      const items = await searchLocations(flaskApiBaseUrl, trimmed);
      setSuggestions(items);
      if (items.length > 0) {
        handleSelectSuggestion(items[0]);
      } else {
        setShowSuggestions(false);
        setSearchError(
          'No matching locations found. Try refining your query or click directly on the map.'
        );
      }
    } catch (err) {
      setSearchError(
        err instanceof Error ? err.message : 'Unable to search location right now.'
      );
    } finally {
      setSearchLoading(false);
    }
  };

  const resolveAddressForCoordinates = async (
    lat: number,
    lng: number,
    options?: { gpsAccuracyMeters?: number }
  ) => {
    reverseAbortRef.current?.abort();
    const controller = new AbortController();
    reverseAbortRef.current = controller;
    setReverseLoading(true);

    try {
      const resolved = await reverseGeocode(flaskApiBaseUrl, lat, lng, controller.signal);
      if (controller.signal.aborted) return;

      if (resolved) {
        suppressSearchRef.current = true;
        setSearchQuery(resolved.shortLabel);
        setSelectedAddress(resolved.displayName);
        setLocationName(resolved.shortLabel);
        if (options?.gpsAccuracyMeters !== undefined) {
          setGpsStatus(
            `Current location detected (±${Math.round(options.gpsAccuracyMeters)}m accuracy).`
          );
        }
      } else {
        setSelectedAddress(`Pinned coordinates (${lat.toFixed(5)}, ${lng.toFixed(5)})`);
        if (options?.gpsAccuracyMeters !== undefined) {
          setGpsStatus(
            `Current GPS coordinates captured (±${Math.round(options.gpsAccuracyMeters)}m), but no street address was returned. Enter the street/landmark below.`
          );
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      const msg =
        err instanceof Error
          ? err.message
          : 'Address lookup unavailable; coordinates were captured accurately.';
      setSelectedAddress(`Pinned coordinates (${lat.toFixed(5)}, ${lng.toFixed(5)})`);
      if (options?.gpsAccuracyMeters !== undefined) {
        setGpsStatus(
          `Current GPS captured (±${Math.round(options.gpsAccuracyMeters)}m). ${msg}`
        );
      } else {
        setSearchError(msg);
      }
    } finally {
      if (!controller.signal.aborted) {
        setReverseLoading(false);
      }
    }
  };

  const handleMapCoordinatesPicked = (coords: Coordinates) => {
    setError(null);
    setGpsError(null);
    setSearchError(null);
    setGpsStatus(null);
    setShowSuggestions(false);
    setCoordinates(coords);
    void resolveAddressForCoordinates(coords.lat, coords.lng);
  };

  const handleFilePicked = (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setAiDetectError(null);
    const validationErr = validateDetectImageFile(file);
    if (validationErr) {
      setError(validationErr);
      return;
    }
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setImageUrl(reader.result);
        setLiveDetection(null);
        setPrefillAiMeta(null);
      }
    };
    reader.readAsDataURL(file);
  };

  const handlePresetSelect = (preset: (typeof SAMPLE_WASTE_PRESETS)[number]) => {
    setError(null);
    setAiDetectError(null);
    setImageFile(null);
    setImageUrl(preset.imageUrl);
    setCategory(preset.category);
    if (!title) setTitle(`Roadside ${preset.label.toLowerCase()} reported`);
    setLiveDetection(null);
    setPrefillAiMeta(null);
  };

  useEffect(() => {
    let active = true;
    void fetchAiDetectStatus(flaskApiBaseUrl).then((st) => {
      if (active) setAiStatus(st);
    });
    return () => {
      active = false;
    };
  }, [flaskApiBaseUrl]);

  const handleCaptureGps = () => {
    setError(null);
    setGpsError(null);
    setSearchError(null);

    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setGpsStatus(null);
      setGpsError(
        'Geolocation is not supported by your browser. Please search for a location or click directly on the map.'
      );
      return;
    }

    if (
      typeof window !== 'undefined' &&
      !window.isSecureContext &&
      window.location.hostname !== 'localhost' &&
      window.location.hostname !== '127.0.0.1'
    ) {
      setGpsStatus(null);
      setGpsError(
        'Automatic location detection requires HTTPS or localhost. Use location search or the map pin instead.'
      );
      return;
    }

    setGpsLoading(true);
    setGpsStatus('Requesting location permission from your browser...');

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        const accuracy = pos.coords.accuracy;

        setCoordinates({ lat, lng });
        setShowSuggestions(false);
        setGpsLoading(false);
        setGpsStatus(
          `GPS location captured (±${Math.round(accuracy)}m). Resolving street address...`
        );

        void resolveAddressForCoordinates(lat, lng, { gpsAccuracyMeters: accuracy });
      },
      (err) => {
        setGpsLoading(false);
        setGpsStatus(null);
        switch (err.code) {
          case 1:
            setGpsError(
              'Location permission denied. You can use the location search field or click anywhere on the map to pin the location.'
            );
            break;
          case 2:
            setGpsError(
              'Your device location is currently unavailable. Please search for an address or click on the map.'
            );
            break;
          case 3:
            setGpsError(
              'GPS detection timed out. Please try again, or select the location manually on the map.'
            );
            break;
          default:
            setGpsError(
              'Unable to detect current location. Please search for a place or click on the map.'
            );
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleRunAiDetect = async () => {
    if (detecting) return;
    if (!imageUrl) {
      setAiDetectError('Upload a JPG, PNG, or WEBP photograph first to run AI detection.');
      return;
    }
    setError(null);
    setAiDetectError(null);
    setDetecting(true);
    try {
      const res = await runLiveWasteDetection(
        flaskApiBaseUrl,
        {
          file: imageFile,
          imageUrl,
        },
        onSessionExpired
      );
      setLiveDetection(res);
      setPrefillAiMeta(null);
      if (res.detected && res.topLabel && !title.trim()) {
        setTitle(`${res.topLabel} waste reported beside road`);
      }
    } catch (err) {
      setAiDetectError(
        err instanceof Error ? err.message : 'Unable to run AI detection right now.'
      );
    } finally {
      setDetecting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!coordinates) {
      setError(
        'Please select the waste location by searching, clicking the map, or using your current location.'
      );
      return;
    }

    if (!ward.trim() || ward.trim().length < 2) {
      setError('Please select or enter the municipal ward / zone manually.');
      return;
    }

    const validationError = validateReportForm({
      title,
      locationName,
      imageUrl,
      description,
    });
    if (validationError) {
      setError(validationError);
      return;
    }

    const aiDetected = Boolean(liveDetection?.detected || prefillAiMeta?.aiDetected);
    const aiConfidence = liveDetection?.detected
      ? liveDetection.topConfidencePct
      : prefillAiMeta?.aiDetected
      ? prefillAiMeta.confidence
      : 0;

    setSubmitting(true);
    try {
      const result = await onSubmitComplaint({
        title: title.trim(),
        description: description.trim(),
        category,
        severity,
        locationName: locationName.trim(),
        ward: ward.trim(),
        coordinates,
        imageUrl,
        imageFile,
        aiDetected,
        aiConfidence,
        estimatedWeightKg: 18,
      });
      setSubmittedRecord(result);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to submit complaint. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    reverseAbortRef.current?.abort();
    setSubmittedRecord(null);
    setImageUrl('');
    setImageFile(null);
    setTitle('');
    setLocationName('');
    setWard('');
    setCustomWardMode(false);
    setCoordinates(null);
    setSearchQuery('');
    setSelectedAddress('');
    setSuggestions([]);
    setShowSuggestions(false);
    setSearchError(null);
    setGpsStatus(null);
    setGpsError(null);
    setDescription('');
    setLiveDetection(null);
    setPrefillAiMeta(null);
    setAiDetectError(null);
    setError(null);
  };

  if (submittedRecord) {
    return (
      <div className="mx-auto max-w-2xl rounded-2xl border border-[#CDE7DA] bg-white p-8 text-center shadow-xs">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#ECFDF5] text-[#059669]">
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <h2 className="mt-4 font-display text-2xl font-extrabold text-[#022C22]">
          Complaint Submitted Successfully
        </h2>
        <p className="mt-2 text-sm text-[#4B5563]">
          Your garbage report{' '}
          <span className="font-mono font-bold text-[#064E3B]">
            {submittedRecord.complaint.id}
          </span>{' '}
          has been logged and queued for municipal dispatch.
        </p>
        <p className="mt-2 text-xs text-[#6B7280]">
          {submittedRecord.savedToFlask
            ? 'Synced directly to Flask & MySQL backend.'
            : 'Saved locally (Flask API offline — will sync when connected).'}
        </p>

        <div className="mt-6 grid grid-cols-2 gap-3 rounded-xl bg-[#F5F8F6] p-4 text-left text-xs sm:grid-cols-4">
          <div>
            <p className="text-[#6B7280]">Category</p>
            <p className="mt-0.5 font-semibold text-[#022C22]">
              {submittedRecord.complaint.category}
            </p>
          </div>
          <div>
            <p className="text-[#6B7280]">Status</p>
            <p className="mt-0.5 font-semibold text-[#D97706]">
              {submittedRecord.complaint.status}
            </p>
          </div>
          <div>
            <p className="text-[#6B7280]">Ward</p>
            <p className="mt-0.5 font-semibold text-[#022C22] truncate">
              {submittedRecord.complaint.ward}
            </p>
          </div>
          <div>
            <p className="text-[#6B7280]">GPS</p>
            <p className="mt-0.5 font-mono text-[#022C22] tabular-nums">
              {submittedRecord.complaint.coordinates.lat.toFixed(4)},{' '}
              {submittedRecord.complaint.coordinates.lng.toFixed(4)}
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => onTrackComplaint(submittedRecord.complaint.id)}
            className="rounded-xl bg-[#064E3B] px-5 py-3 text-sm font-semibold text-white hover:bg-[#022C22]"
          >
            Track Complaint Progress
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="rounded-xl border border-[#DCE6E0] px-5 py-3 text-sm font-semibold text-[#374151] hover:bg-[#F5F8F6]"
          >
            Submit Another Report
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-extrabold text-[#022C22]">
          Report Roadside Garbage
        </h2>
        <p className="mt-1 text-sm text-[#4B5563]">
          Upload a photograph, tag the GPS location, run optional AI waste classification, and
          dispatch a municipal sanitation ticket.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-6 lg:grid-cols-12" noValidate>
        {/* LEFT COLUMN: Photo Upload + AI Scan + Map Preview */}
        <div className="space-y-6 lg:col-span-6">
          {/* Step 1: Photograph Upload */}
          <section className="rounded-2xl border border-[#E2EAE5] bg-white p-6">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-[#022C22]">
                1. Waste Photograph
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#DCE6E0] px-3 py-1.5 text-xs font-semibold text-[#064E3B] hover:bg-[#F5F8F6]"
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span>Upload</span>
                </button>
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#DCE6E0] px-3 py-1.5 text-xs font-semibold text-[#064E3B] hover:bg-[#F5F8F6]"
                >
                  <Camera className="h-3.5 w-3.5" />
                  <span>Camera</span>
                </button>
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                handleFilePicked(e.target.files?.[0]);
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
                handleFilePicked(e.target.files?.[0]);
                e.target.value = '';
              }}
            />

            {imageUrl ? (
              <div className="mt-4 space-y-3">
                <div className="relative overflow-hidden rounded-xl border border-[#DCE6E0] bg-[#F5F8F6]">
                  <img
                    src={liveDetection?.annotatedImageUrl || imageUrl}
                    alt="Uploaded roadside garbage preview"
                    referrerPolicy="no-referrer"
                    className="h-56 w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setImageUrl('');
                      setImageFile(null);
                      setLiveDetection(null);
                      setPrefillAiMeta(null);
                      setAiDetectError(null);
                    }}
                    aria-label="Remove uploaded photograph"
                    className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-lg bg-[#022C22]/85 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[#022C22]"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Remove</span>
                  </button>
                </div>

                {/* Optional Inline AI Object Detection */}
                <div className="space-y-2.5 rounded-xl bg-[#F5F8F6] px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-xs font-semibold text-[#022C22]">
                          {liveDetection
                            ? liveDetection.detected
                              ? `Detected ${liveDetection.totalDetections} object(s): ${liveDetection.topLabel} (${liveDetection.topConfidencePct}%)`
                              : 'No objects detected (0 detections)'
                            : prefillAiMeta?.aiDetected
                            ? `AI Scan Attached (${prefillAiMeta.confidence}% top confidence)`
                            : 'Optional YOLO Object Detection'}
                        </p>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            aiStatus?.available
                              ? 'bg-[#ECFDF5] text-[#064E3B]'
                              : 'bg-amber-50 text-amber-800'
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              aiStatus?.available ? 'bg-[#059669]' : 'bg-amber-500'
                            }`}
                          />
                          {aiStatus?.available ? 'AI Online' : 'AI Offline'}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-[#6B7280]">
                        {liveDetection
                          ? 'Select the municipal waste category below manually.'
                          : 'Detects visible COCO objects; choose waste category manually below.'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleRunAiDetect}
                      disabled={detecting}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#059669] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#064E3B] disabled:opacity-60 whitespace-nowrap"
                    >
                      {detecting ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <ScanSearch className="h-3.5 w-3.5" />
                      )}
                      <span>{detecting ? 'Analyzing...' : 'Run AI Detect'}</span>
                    </button>
                  </div>

                  {aiDetectError && (
                    <p
                      role="alert"
                      className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-medium text-red-700"
                    >
                      {aiDetectError}
                    </p>
                  )}

                  {liveDetection && liveDetection.detected && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {liveDetection.detections.slice(0, 6).map((det, idx) => (
                        <span
                          key={`${det.class_name}-${idx}`}
                          className="rounded-md border border-[#DCE6E0] bg-white px-2 py-0.5 text-[11px] font-medium text-[#022C22]"
                        >
                          {det.class_name} ({Math.round(det.confidence * 100)}%)
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  handleFilePicked(e.dataTransfer.files?.[0]);
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
                }}
                className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-[#C7DBD0] bg-[#F8FBF9] px-6 py-9 text-center transition-colors hover:border-[#059669] hover:bg-[#ECFDF5]/40"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#ECFDF5] text-[#059669]">
                  <Upload className="h-6 w-6" />
                </div>
                <p className="mt-3 text-sm font-semibold text-[#022C22]">
                  Drop a roadside garbage photo here, or click to browse
                </p>
                <p className="mt-1 text-xs text-[#6B7280]">
                  JPG, PNG, or WEBP up to 10 MB
                </p>
              </div>
            )}

            {/* Quick Sample Photos for Instant Testing */}
            <div className="mt-4">
              <p className="text-[11px] font-semibold text-[#6B7280]">
                Or load a sample inspection photo:
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {SAMPLE_WASTE_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handlePresetSelect(preset)}
                    className="group overflow-hidden rounded-lg border border-[#DCE6E0] bg-white text-left transition-colors hover:border-[#059669]"
                  >
                    <img
                      src={preset.imageUrl}
                      alt={preset.label}
                      referrerPolicy="no-referrer"
                      className="h-14 w-full object-cover"
                    />
                    <span className="block truncate px-2 py-1 text-[11px] font-medium text-[#1F2937] group-hover:text-[#064E3B]">
                      {preset.category}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* Step 2: Location Search, GPS & Interactive Map */}
          <section className="rounded-2xl border border-[#E2EAE5] bg-white p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-display text-base font-bold text-[#022C22]">
                  2. Location Search &amp; GPS Map
                </h3>
                <p className="mt-0.5 text-xs text-[#6B7280]">
                  Search an address, detect your device GPS, or drag the pin on the map
                </p>
              </div>
              <button
                type="button"
                onClick={handleCaptureGps}
                disabled={gpsLoading}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#064E3B] px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-[#022C22] disabled:opacity-60 whitespace-nowrap"
              >
                {gpsLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[#A7F3D0]" />
                ) : (
                  <Crosshair className="h-3.5 w-3.5 text-[#A7F3D0]" />
                )}
                <span>{gpsLoading ? 'Detecting Location...' : 'Use My Current Location'}</span>
              </button>
            </div>

            {/* Prominent Location Search + Autocomplete */}
            <div ref={searchContainerRef} className="relative">
              <label htmlFor="map-location-search" className="sr-only">
                Search location by street name, area, landmark, or address
              </label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#059669]" />
                  <input
                    id="map-location-search"
                    type="text"
                    value={searchQuery}
                    onFocus={() => {
                      if (suggestions.length > 0) setShowSuggestions(true);
                    }}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setSuggestions([]);
                      setHighlightedIndex(-1);
                      setShowSuggestions(true);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowDown' && suggestions.length > 0) {
                        e.preventDefault();
                        setShowSuggestions(true);
                        setHighlightedIndex((idx) => (idx + 1) % suggestions.length);
                      } else if (e.key === 'ArrowUp' && suggestions.length > 0) {
                        e.preventDefault();
                        setHighlightedIndex((idx) =>
                          idx <= 0 ? suggestions.length - 1 : idx - 1
                        );
                      } else if (e.key === 'Escape') {
                        setShowSuggestions(false);
                      } else if (e.key === 'Enter') {
                        e.preventDefault();
                        void handleExplicitSearch();
                      }
                    }}
                    placeholder="Search street, area, landmark, or address..."
                    aria-autocomplete="list"
                    aria-expanded={showSuggestions && suggestions.length > 0}
                    className="w-full rounded-xl border border-[#DCE6E0] bg-[#F9FBFA] py-2.5 pl-10 pr-9 text-sm text-[#1F2937] placeholder:text-[#6B7280] focus:border-[#059669] focus:bg-white"
                  />
                  {searchLoading ? (
                    <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[#059669]" />
                  ) : (
                    searchQuery && (
                      <button
                        type="button"
                        onClick={() => {
                          setSearchQuery('');
                          setSuggestions([]);
                          setShowSuggestions(false);
                          setSearchError(null);
                        }}
                        aria-label="Clear location search"
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-[#6B7280] hover:bg-[#EEF3F0] hover:text-[#022C22]"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void handleExplicitSearch()}
                  disabled={searchLoading}
                  className="shrink-0 rounded-xl border border-[#DCE6E0] bg-[#ECFDF5] px-4 py-2.5 text-xs font-semibold text-[#064E3B] transition-colors hover:bg-[#D1FAE5] disabled:opacity-60"
                >
                  Search
                </button>
              </div>

              {/* Autocomplete Suggestions List */}
              {showSuggestions && suggestions.length > 0 && (
                <ul
                  role="listbox"
                  aria-label="Location suggestions"
                  className="absolute left-0 right-0 z-[500] mt-1.5 max-h-60 overflow-y-auto rounded-xl border border-[#DCE6E0] bg-white py-1.5 shadow-xl"
                >
                  {suggestions.map((item, idx) => {
                    const active = idx === highlightedIndex;
                    return (
                      <li key={item.id} role="option" aria-selected={active}>
                        <button
                          type="button"
                          onMouseEnter={() => setHighlightedIndex(idx)}
                          onClick={() => handleSelectSuggestion(item)}
                          className={`flex w-full items-start gap-2.5 px-3.5 py-2.5 text-left transition-colors ${
                            active ? 'bg-[#ECFDF5] text-[#022C22]' : 'hover:bg-[#F5F8F6]'
                          }`}
                        >
                          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#059669]" />
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold text-[#022C22]">
                              {item.shortLabel}
                            </p>
                            <p className="truncate text-[11px] text-[#6B7280]">
                              {item.displayName}
                            </p>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              {/* Selected Address & Live Coordinates Readout */}
              {(selectedAddress || reverseLoading || coordinates) && (
                <div className="mt-2.5 rounded-xl border border-[#DCE6E0] bg-[#F5F8F6] px-3.5 py-2.5 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 min-w-0">
                      {reverseLoading ? (
                        <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-[#059669]" />
                      ) : (
                        <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#059669]" />
                      )}
                      <div className="min-w-0">
                        <p className="font-semibold text-[#022C22]">
                          {reverseLoading
                            ? 'Resolving street address...'
                            : selectedAddress || 'Selected Map Coordinates'}
                        </p>
                        {coordinates && (
                          <p className="mt-0.5 font-mono text-[11px] text-[#4B5563] tabular-nums">
                            Lat: {coordinates.lat.toFixed(6)} · Lng: {coordinates.lng.toFixed(6)}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {gpsStatus && (
              <p className="rounded-lg border border-[#A7F3D0] bg-[#ECFDF5] px-3 py-2 text-xs font-medium text-[#064E3B]">
                {gpsStatus}
              </p>
            )}

            {(gpsError || searchError) && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700"
              >
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{gpsError || searchError}</span>
              </div>
            )}

            <div>
              <InteractiveCityMap
                pickerMode
                pickedCoordinates={coordinates}
                onPickCoordinates={handleMapCoordinatesPicked}
                heightClass="h-[340px] sm:h-[380px]"
              />
            </div>
          </section>
        </div>

        {/* RIGHT COLUMN: Report Details Form */}
        <div className="lg:col-span-6">
          <section className="rounded-2xl border border-[#E2EAE5] bg-white p-6 space-y-5">
            <h3 className="font-display text-base font-bold text-[#022C22]">
              3. Complaint Details
            </h3>

            <div>
              <label
                htmlFor="report-title"
                className="block text-xs font-semibold text-[#374151]"
              >
                Report Title
              </label>
              <input
                id="report-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Overflowing plastic bags beside Main Avenue curb"
                className="mt-1.5 w-full rounded-xl border border-[#DCE6E0] bg-[#F9FBFA] px-4 py-2.5 text-sm text-[#1F2937] focus:border-[#059669] focus:bg-white"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="report-location"
                  className="block text-xs font-semibold text-[#374151]"
                >
                  Roadside Location / Landmark
                </label>
                <div className="relative mt-1.5">
                  <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7280]" />
                  <input
                    id="report-location"
                    type="text"
                    value={locationName}
                    onChange={(e) => setLocationName(e.target.value)}
                    placeholder="Street name or nearby landmark"
                    className="w-full rounded-xl border border-[#DCE6E0] bg-[#F9FBFA] py-2.5 pl-9 pr-3 text-sm text-[#1F2937] focus:border-[#059669] focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="report-ward"
                  className="block text-xs font-semibold text-[#374151]"
                >
                  Municipal Ward / Zone
                </label>
                <select
                  id="report-ward"
                  value={customWardMode ? CUSTOM_WARD_OPTION : ward}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === CUSTOM_WARD_OPTION) {
                      setCustomWardMode(true);
                      setWard('');
                    } else {
                      setCustomWardMode(false);
                      setWard(val);
                    }
                  }}
                  className="mt-1.5 w-full rounded-xl border border-[#DCE6E0] bg-[#F9FBFA] px-3.5 py-2.5 text-sm text-[#1F2937] focus:border-[#059669] focus:bg-white"
                >
                  <option value="">Select municipal ward / zone...</option>
                  {WARDS.map((w) => (
                    <option key={w} value={w}>
                      {w}
                    </option>
                  ))}
                  <option value={CUSTOM_WARD_OPTION}>Other / Enter manually...</option>
                </select>
                {customWardMode && (
                  <input
                    type="text"
                    aria-label="Enter custom municipal ward or zone"
                    value={ward}
                    onChange={(e) => setWard(e.target.value)}
                    placeholder="Enter ward or municipal zone name"
                    className="mt-2 w-full rounded-xl border border-[#DCE6E0] bg-[#F9FBFA] px-3.5 py-2 text-sm text-[#1F2937] focus:border-[#059669] focus:bg-white"
                  />
                )}
                <p className="mt-1.5 flex items-start gap-1 text-[11px] text-[#6B7280]">
                  <Info className="mt-0.5 h-3 w-3 shrink-0 text-[#059669]" />
                  <span>
                    Automatic ward detection unavailable (no ward boundary dataset loaded). Please
                    select manually.
                  </span>
                </p>
              </div>
            </div>

            {/* Category Selector Buttons */}
            <div>
              <span className="block text-xs font-semibold text-[#374151]">
                Waste Category
              </span>
              <div className="mt-2 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {(['Organic', 'Plastic', 'Metal', 'Others'] as WasteCategory[]).map((cat) => {
                  const selected = category === cat;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCategory(cat)}
                      className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold transition-all ${
                        selected
                          ? 'border-[#064E3B] bg-[#064E3B] text-white'
                          : 'border-[#DCE6E0] bg-white text-[#374151] hover:border-[#059669]'
                      }`}
                    >
                      <span
                        className="h-2 w-2 rounded-xs shrink-0"
                        style={{
                          backgroundColor: selected ? '#A7F3D0' : CATEGORY_COLORS[cat],
                        }}
                      />
                      <span>{cat}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Severity */}
            <div>
              <span className="block text-xs font-semibold text-[#374151]">
                Priority / Accumulation Severity
              </span>
              <div className="mt-2 grid grid-cols-3 gap-2.5">
                {(['Low', 'Medium', 'High'] as const).map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => setSeverity(lvl)}
                    className={`rounded-xl border py-2 text-xs font-semibold transition-colors ${
                      severity === lvl
                        ? 'border-[#059669] bg-[#ECFDF5] text-[#064E3B]'
                        : 'border-[#DCE6E0] bg-white text-[#4B5563] hover:bg-[#F5F8F6]'
                    }`}
                  >
                    {lvl}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label
                htmlFor="report-description"
                className="block text-xs font-semibold text-[#374151]"
              >
                Description &amp; Accessibility Notes
              </label>
              <textarea
                id="report-description"
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe approximate pile size, odor or drainage obstruction, and easiest access road for sanitation vehicles..."
                className="mt-1.5 w-full rounded-xl border border-[#DCE6E0] bg-[#F9FBFA] px-4 py-3 text-sm text-[#1F2937] focus:border-[#059669] focus:bg-white"
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-xl bg-[#064E3B] py-3.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[#022C22] disabled:opacity-60"
              >
                {submitting ? 'Submitting Complaint...' : 'Submit Garbage Complaint'}
              </button>
            </div>
          </section>
        </div>
      </form>
    </div>
  );
}
