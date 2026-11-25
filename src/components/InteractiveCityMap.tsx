import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import { ExternalLink, MapPin, Minus, Plus } from 'lucide-react';
import { MapContainer, Marker, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import type { Complaint, Coordinates } from '../types/waste';
import { CATEGORY_COLORS } from '../utils/wasteLogic';

interface InteractiveCityMapProps {
  complaints?: Complaint[];
  selectedComplaintId?: string | null;
  onSelectComplaint?: (complaint: Complaint) => void;
  pickerMode?: boolean;
  pickedCoordinates?: Coordinates | null;
  onPickCoordinates?: (coords: Coordinates) => void;
  heightClass?: string;
}

const DEFAULT_OVERVIEW_CENTER: [number, number] = [20, 0];
const DEFAULT_OVERVIEW_ZOOM = 2;

function createPickerDivIcon(): L.DivIcon {
  return L.divIcon({
    className: 'wastesmart-picker-pin',
    html: `
      <div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-100%);">
        <div style="display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:9999px;background:#064E3B;border:3px solid #A7F3D0;box-shadow:0 6px 16px rgba(2,44,34,0.35);color:#FFFFFF;">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/></svg>
        </div>
        <div style="width:8px;height:8px;background:#064E3B;transform:rotate(45deg);margin-top:-5px;"></div>
      </div>
    `,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

function createComplaintDivIcon(label: string, color: string, isSelected: boolean): L.DivIcon {
  const bg = isSelected ? '#022C22' : color;
  const ring = isSelected ? 'box-shadow:0 0 0 3px #A7F3D0, 0 6px 14px rgba(2,44,34,0.35);' : 'box-shadow:0 4px 10px rgba(0,0,0,0.22);';
  return L.divIcon({
    className: 'wastesmart-complaint-pin',
    html: `
      <div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-100%);cursor:pointer;">
        <div style="display:flex;align-items:center;gap:4px;padding:3px 8px;border-radius:8px;background:${bg};color:#FFFFFF;font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:700;white-space:nowrap;${ring}">
          <span>${label}</span>
        </div>
        <div style="width:7px;height:7px;background:${bg};transform:rotate(45deg);margin-top:-4px;"></div>
      </div>
    `,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

function MapInstanceBridge({
  onReady,
}: {
  onReady: (map: L.Map) => void;
}) {
  const map = useMap();
  useEffect(() => {
    onReady(map);
  }, [map, onReady]);
  return null;
}

function PickerMapEvents({
  pickerMode,
  onPickCoordinates,
}: {
  pickerMode: boolean;
  onPickCoordinates?: (coords: Coordinates) => void;
}) {
  useMapEvents({
    click(e) {
      if (!pickerMode || !onPickCoordinates) return;
      onPickCoordinates({
        lat: Number(e.latlng.lat.toFixed(6)),
        lng: Number(e.latlng.lng.toFixed(6)),
      });
    },
  });
  return null;
}

function ViewportController({
  pickerMode,
  pickedCoordinates,
  complaints,
  selectedComplaintId,
}: {
  pickerMode: boolean;
  pickedCoordinates?: Coordinates | null;
  complaints: Complaint[];
  selectedComplaintId?: string | null;
}) {
  const map = useMap();
  const lastCoordsKeyRef = useRef<string | null>(null);
  const lastSelectedIdRef = useRef<string | null>(null);
  const fittedCountRef = useRef<number>(0);

  useEffect(() => {
    if (!pickerMode) return;
    if (!pickedCoordinates) {
      lastCoordsKeyRef.current = null;
      return;
    }

    const key = `${pickedCoordinates.lat.toFixed(6)},${pickedCoordinates.lng.toFixed(6)}`;
    if (lastCoordsKeyRef.current === key) return;
    lastCoordsKeyRef.current = key;

    const currentZoom = map.getZoom();
    if (currentZoom >= 15) {
      map.panTo([pickedCoordinates.lat, pickedCoordinates.lng], { animate: true });
    } else {
      map.flyTo([pickedCoordinates.lat, pickedCoordinates.lng], 16, { duration: 0.75 });
    }
  }, [map, pickerMode, pickedCoordinates]);

  useEffect(() => {
    if (pickerMode) return;

    if (selectedComplaintId) {
      const selected = complaints.find((c) => c.id === selectedComplaintId);
      if (selected && lastSelectedIdRef.current !== selected.id) {
        lastSelectedIdRef.current = selected.id;
        map.flyTo([selected.coordinates.lat, selected.coordinates.lng], Math.max(map.getZoom(), 15), {
          duration: 0.65,
        });
        return;
      }
    }

    if (complaints.length > 0 && fittedCountRef.current !== complaints.length) {
      fittedCountRef.current = complaints.length;
      if (complaints.length === 1) {
        const only = complaints[0];
        map.setView([only.coordinates.lat, only.coordinates.lng], 15);
      } else {
        const bounds = L.latLngBounds(
          complaints.map((c) => [c.coordinates.lat, c.coordinates.lng] as [number, number])
        );
        map.fitBounds(bounds, { padding: [44, 44], maxZoom: 15 });
      }
    }
  }, [map, pickerMode, complaints, selectedComplaintId]);

  return null;
}

export function InteractiveCityMap({
  complaints = [],
  selectedComplaintId,
  onSelectComplaint,
  pickerMode = false,
  pickedCoordinates = null,
  onPickCoordinates,
  heightClass = 'h-80',
}: InteractiveCityMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const pickerIcon = useMemo(() => createPickerDivIcon(), []);

  const selectedComplaint = useMemo(
    () => complaints.find((c) => c.id === selectedComplaintId) ?? null,
    [complaints, selectedComplaintId]
  );

  const activeCoords: Coordinates | null = pickerMode
    ? pickedCoordinates
    : selectedComplaint?.coordinates ?? complaints[0]?.coordinates ?? null;

  const initialCenter: [number, number] = activeCoords
    ? [activeCoords.lat, activeCoords.lng]
    : DEFAULT_OVERVIEW_CENTER;
  const initialZoom = activeCoords ? (pickerMode ? 16 : 14) : DEFAULT_OVERVIEW_ZOOM;

  const osmUrl = activeCoords
    ? `https://www.openstreetmap.org/?mlat=${activeCoords.lat}&mlon=${activeCoords.lng}#map=16/${activeCoords.lat}/${activeCoords.lng}`
    : 'https://www.openstreetmap.org/';

  return (
    <div className="relative isolate overflow-hidden rounded-xl border border-[#DCE6E0] bg-[#EDF3EF]">
      <div
        className={`relative w-full ${heightClass}`}
        data-testid="interactive-city-map"
      >
        <MapContainer
          center={initialCenter}
          zoom={initialZoom}
          zoomControl={false}
          scrollWheelZoom={true}
          className={`h-full w-full z-0 ${pickerMode ? 'cursor-crosshair' : ''}`}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <MapInstanceBridge onReady={(map) => { mapRef.current = map; }} />
          <PickerMapEvents pickerMode={pickerMode} onPickCoordinates={onPickCoordinates} />
          <ViewportController
            pickerMode={pickerMode}
            pickedCoordinates={pickedCoordinates}
            complaints={complaints}
            selectedComplaintId={selectedComplaintId}
          />

          {pickerMode && pickedCoordinates && (
            <Marker
              position={[pickedCoordinates.lat, pickedCoordinates.lng]}
              icon={pickerIcon}
              draggable={true}
              eventHandlers={{
                dragend(e) {
                  if (!onPickCoordinates) return;
                  const pos = (e.target as L.Marker).getLatLng();
                  onPickCoordinates({
                    lat: Number(pos.lat.toFixed(6)),
                    lng: Number(pos.lng.toFixed(6)),
                  });
                },
              }}
            >
              <Tooltip direction="top" offset={[0, -40]} opacity={0.95}>
                Selected waste location (drag to fine-tune)
              </Tooltip>
            </Marker>
          )}

          {!pickerMode &&
            complaints.map((c) => {
              const isSelected = c.id === selectedComplaintId;
              const color = CATEGORY_COLORS[c.category];
              const icon = createComplaintDivIcon(c.id.slice(-4), color, isSelected);
              return (
                <Marker
                  key={c.id}
                  position={[c.coordinates.lat, c.coordinates.lng]}
                  icon={icon}
                  eventHandlers={{
                    click() {
                      onSelectComplaint?.(c);
                    },
                  }}
                >
                  <Tooltip direction="top" offset={[0, -32]} opacity={0.95}>
                    {c.id}: {c.locationName}
                  </Tooltip>
                </Marker>
              );
            })}
        </MapContainer>

        {/* Custom Zoom Controls */}
        <div className="absolute right-3 top-3 z-[450] flex flex-col overflow-hidden rounded-lg border border-[#D4E2DA] bg-white/95 shadow-sm backdrop-blur-xs">
          <button
            type="button"
            onClick={() => mapRef.current?.zoomIn()}
            aria-label="Zoom in map"
            className="flex h-8 w-8 items-center justify-center text-[#064E3B] hover:bg-[#F5F8F6] transition-colors"
          >
            <Plus className="h-4 w-4" />
          </button>
          <div className="h-px bg-[#E5ECE8]" />
          <button
            type="button"
            onClick={() => mapRef.current?.zoomOut()}
            aria-label="Zoom out map"
            className="flex h-8 w-8 items-center justify-center text-[#064E3B] hover:bg-[#F5F8F6] transition-colors"
          >
            <Minus className="h-4 w-4" />
          </button>
        </div>

        {/* Coordinate Footer Bar */}
        <div className="absolute bottom-3 left-3 right-3 z-[450] flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#D4E2DA] bg-white/95 px-3 py-2 text-xs text-[#1F2937] shadow-xs backdrop-blur-xs">
          <div className="flex items-center gap-2 font-mono tabular-nums text-[11px] text-[#374151]">
            <MapPin className="h-3.5 w-3.5 text-[#059669] shrink-0" aria-hidden="true" />
            {activeCoords ? (
              <span>
                Lat {activeCoords.lat.toFixed(5)}, Lng {activeCoords.lng.toFixed(5)}
                {pickerMode && (
                  <span className="font-sans text-[#064E3B] font-medium">
                    {' '}
                    · Click map or drag pin to adjust
                  </span>
                )}
              </span>
            ) : (
              <span className="font-sans text-[#4B5563]">
                {pickerMode
                  ? 'No location selected · Search, click the map, or use current location'
                  : 'No complaint coordinates to display'}
              </span>
            )}
          </div>
          <a
            href={osmUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium text-[#064E3B] hover:text-[#059669] whitespace-nowrap"
          >
            <span>OpenStreetMap</span>
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        </div>
      </div>
    </div>
  );
}
