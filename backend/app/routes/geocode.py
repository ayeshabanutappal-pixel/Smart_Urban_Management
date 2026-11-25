"""
Geocoding & reverse-geocoding proxy routes for WasteSmart.

Uses OpenStreetMap Nominatim with an application-identifying User-Agent server-side,
avoiding browser User-Agent / CORS limitations while keeping all location data authentic.

Endpoints:
  GET /api/geocode/search?q=<query>      — Forward search / autocomplete suggestions
  GET /api/geocode/reverse?lat=..&lng=.. — Reverse geocode coordinates to street address
"""
import json
import math
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from flask import Blueprint, jsonify, request

from app.utils.auth_decorators import roles_required

geocode_bp = Blueprint("geocode", __name__, url_prefix="/api/geocode")

NOMINATIM_BASE = "https://nominatim.openstreetmap.org"
USER_AGENT = "WasteSmart-UrbanWasteApp/1.0"
UPSTREAM_TIMEOUT_SECONDS = 6


def _error_response(message: str, status_code: int, error_label: str):
    return (
        jsonify(
            {
                "error": error_label,
                "message": message,
                "status": status_code,
            }
        ),
        status_code,
    )


def _format_address(result: dict) -> dict[str, str]:
    addr = result.get("address") if isinstance(result.get("address"), dict) else {}
    street = " ".join(
        part
        for part in [
            addr.get("house_number"),
            addr.get("road") or addr.get("pedestrian") or result.get("name"),
        ]
        if part
    ).strip()
    area = addr.get("neighbourhood") or addr.get("suburb") or addr.get("city_district") or ""
    city = addr.get("city") or addr.get("town") or addr.get("village") or ""
    state = addr.get("state") or ""
    postcode = addr.get("postcode") or ""

    concise_parts = []
    for part in [street, area, city]:
        if part and part not in concise_parts:
            concise_parts.append(part)

    raw_display = str(result.get("display_name") or "").strip()
    short_label = ", ".join(concise_parts) or (
        ", ".join(p.strip() for p in raw_display.split(",")[:3] if p.strip())
    )

    full_parts = []
    for part in [street, area, city, state, postcode]:
        if part and part not in full_parts:
            full_parts.append(part)

    display_name = raw_display or ", ".join(full_parts) or short_label
    return {
        "displayName": display_name,
        "shortLabel": short_label or display_name,
    }


def _fetch_nominatim_json(path: str, params: dict[str, str]):
    url = f"{NOMINATIM_BASE}{path}?{urlencode(params)}"
    req = Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "application/json",
        },
        method="GET",
    )
    with urlopen(req, timeout=UPSTREAM_TIMEOUT_SECONDS) as resp:
        raw = resp.read().decode("utf-8")
    return json.loads(raw)


@geocode_bp.get("/search")
@roles_required("citizen", "admin")
def search_locations():
    """Search real OpenStreetMap places, streets, areas, and landmarks."""
    query = (request.args.get("q") or "").strip()
    if len(query) < 2 or len(query) > 200:
        return _error_response(
            "Search query must be between 2 and 200 characters.",
            400,
            "Validation Error",
        )

    try:
        rows = _fetch_nominatim_json(
            "/search",
            {
                "format": "jsonv2",
                "addressdetails": "1",
                "limit": "6",
                "accept-language": "en",
                "q": query,
            },
        )
    except HTTPError as exc:
        if exc.code == 429:
            return _error_response(
                "Location search is temporarily rate-limited. Please wait a moment.",
                429,
                "Rate Limited",
            )
        return _error_response(
            "Location search service is unavailable right now.",
            502,
            "Upstream Error",
        )
    except (URLError, TimeoutError, json.JSONDecodeError, OSError):
        return _error_response(
            "Unable to reach location search service.",
            502,
            "Upstream Error",
        )

    if not isinstance(rows, list):
        return jsonify({"results": []}), 200

    results = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        try:
            lat = float(row.get("lat"))
            lng = float(row.get("lon"))
        except (TypeError, ValueError):
            continue
        if not (math.isfinite(lat) and math.isfinite(lng)):
            continue
        formatted = _format_address(row)
        results.append(
            {
                "id": str(row.get("place_id") or f"{lat},{lng}"),
                "displayName": formatted["displayName"],
                "shortLabel": formatted["shortLabel"],
                "lat": round(lat, 6),
                "lng": round(lng, 6),
            }
        )

    return jsonify({"results": results}), 200


@geocode_bp.get("/reverse")
@roles_required("citizen", "admin")
def reverse_geocode():
    """Resolve latitude & longitude into an authentic street/area address."""
    raw_lat = request.args.get("lat")
    raw_lng = request.args.get("lng") if request.args.get("lng") is not None else request.args.get("lon")

    try:
        lat = float(raw_lat)
        lng = float(raw_lng)
    except (TypeError, ValueError):
        return _error_response(
            "Valid numeric lat and lng query parameters are required.",
            400,
            "Validation Error",
        )

    if not (math.isfinite(lat) and math.isfinite(lng) and -90.0 <= lat <= 90.0 and -180.0 <= lng <= 180.0):
        return _error_response(
            "Coordinates must be within valid latitude (-90..90) and longitude (-180..180) bounds.",
            400,
            "Validation Error",
        )

    try:
        data = _fetch_nominatim_json(
            "/reverse",
            {
                "format": "jsonv2",
                "addressdetails": "1",
                "accept-language": "en",
                "lat": str(lat),
                "lon": str(lng),
            },
        )
    except HTTPError as exc:
        if exc.code == 429:
            return _error_response(
                "Address lookup is temporarily rate-limited.",
                429,
                "Rate Limited",
            )
        return _error_response(
            "Address lookup service is unavailable right now.",
            502,
            "Upstream Error",
        )
    except (URLError, TimeoutError, json.JSONDecodeError, OSError):
        return _error_response(
            "Unable to reach reverse-geocoding service.",
            502,
            "Upstream Error",
        )

    if not isinstance(data, dict) or data.get("error") or not data.get("display_name"):
        return jsonify({"address": None}), 200

    return jsonify({"address": _format_address(data)}), 200
