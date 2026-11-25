import { getStoredAuthToken, resolveApiBaseUrl } from './flaskApi';

export interface GeocodingSuggestion {
  id: string;
  displayName: string;
  shortLabel: string;
  lat: number;
  lng: number;
}

const GEOCODE_TIMEOUT_MS = 7000;

async function fetchGeocodeJson<T>(url: string, externalSignal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;

  const timer = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, GEOCODE_TIMEOUT_MS);

  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) {
      window.clearTimeout(timer);
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  const token = getStoredAuthToken();
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });
  } catch (err) {
    if (timedOut) {
      throw new Error('Location service timed out. Please click on the map to pin manually.');
    }
    if (externalSignal?.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
      throw new DOMException('Aborted', 'AbortError');
    }
    throw new Error('Unable to reach location lookup service. You can click directly on the map.');
  } finally {
    window.clearTimeout(timer);
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onExternalAbort);
    }
  }

  if (!res.ok) {
    let msg = `Location lookup failed (status ${res.status}).`;
    try {
      const errBody = (await res.json()) as { message?: string };
      if (errBody?.message) msg = errBody.message;
    } catch {
      // ignore non-JSON body
    }
    throw new Error(msg);
  }

  return res.json() as Promise<T>;
}

/**
 * Search real geographic locations, streets, landmarks, and addresses
 * via the authenticated Flask /api/geocode/search endpoint (backed by OpenStreetMap Nominatim).
 */
export async function searchLocations(
  baseUrl: string,
  query: string,
  signal?: AbortSignal
): Promise<GeocodingSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const cleanBase = resolveApiBaseUrl(baseUrl);
  const params = new URLSearchParams({ q: trimmed });

  const data = await fetchGeocodeJson<{ results?: GeocodingSuggestion[] }>(
    `${cleanBase}/api/geocode/search?${params.toString()}`,
    signal
  );

  if (!Array.isArray(data.results)) return [];
  return data.results.filter(
    (item) => Number.isFinite(item.lat) && Number.isFinite(item.lng)
  );
}

/**
 * Reverse-geocode real coordinates into a readable street/area address
 * via the authenticated Flask /api/geocode/reverse endpoint.
 */
export async function reverseGeocode(
  baseUrl: string,
  lat: number,
  lng: number,
  signal?: AbortSignal
): Promise<{ displayName: string; shortLabel: string } | null> {
  const cleanBase = resolveApiBaseUrl(baseUrl);
  const params = new URLSearchParams({
    lat: String(lat),
    lng: String(lng),
  });

  const data = await fetchGeocodeJson<{
    address?: { displayName: string; shortLabel: string } | null;
  }>(`${cleanBase}/api/geocode/reverse?${params.toString()}`, signal);

  return data.address ?? null;
}
