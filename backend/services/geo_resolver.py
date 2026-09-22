from typing import Any, Dict, List
import asyncio
import json
import math
import os
import shutil
import httpx

WEST_COAST = [
    (23.0, 68.5), (22.5, 69.5), (21.5, 69.5), (20.8, 70.4), (20.7, 72.0),
    (19.0, 72.8), (18.5, 73.0), (16.0, 73.5), (15.5, 73.8), (14.5, 74.3),
    (13.0, 74.8), (11.5, 75.8), (10.0, 76.2), (8.5, 76.9), (8.08, 77.55)
]
EAST_COAST = [
    (8.08, 77.55), (8.8, 78.1), (9.3, 79.1), (10.3, 79.8), (10.8, 79.85),
    (11.9, 79.8), (13.1, 80.3), (14.5, 80.1), (15.8, 80.3), (16.2, 81.2),
    (16.95, 82.25), (17.7, 83.3), (18.3, 84.0), (19.3, 85.0), (19.8, 85.8),
    (20.3, 86.7), (21.5, 87.0), (21.8, 88.2), (22.0, 89.0)
]

def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2.0) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2.0) ** 2
    return 2.0 * r * math.asin(math.sqrt(a))

def _analyze_marine(lat: float, lon: float, elev: float):
    min_w = min(_haversine_km(lat, lon, clat, clon) for clat, clon in WEST_COAST)
    min_e = min(_haversine_km(lat, lon, clat, clon) for clat, clon in EAST_COAST)
    if min_w <= 45.0 and elev <= 60.0:
        return True, "Arabian Sea", f"Coastal region directly bordering the Arabian Sea ({min_w:.0f} km from coastline)"
    if min_e <= 45.0 and elev <= 60.0:
        return True, "Bay of Bengal", f"Coastal region directly bordering the Bay of Bengal ({min_e:.0f} km from coastline)"
    nearest_sea = "Bay of Bengal" if min_e < min_w else "Arabian Sea"
    dist = min(min_e, min_w)
    return False, None, f"Inland landlocked region with NO oceans or seas ({dist:.0f} km from the nearest ocean, {nearest_sea}; Bay of Bengal is ~{min_e:.0f} km away, Arabian Sea is ~{min_w:.0f} km away)"

async def resolve_geographic_context(bbox: List[float]) -> Dict[str, Any]:
    min_lon, min_lat, max_lon, max_lat = bbox[0], bbox[1], bbox[2], bbox[3]
    node_path = shutil.which("node")
    script_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../scraper/geo_scraper.js"))

    if node_path and os.path.exists(script_path):
        try:
            proc = await asyncio.create_subprocess_exec(
                node_path,
                script_path,
                str(min_lon),
                str(min_lat),
                str(max_lon),
                str(max_lat),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=18.0)
            if proc.returncode == 0 and stdout:
                return json.loads(stdout.decode("utf-8"))
        except Exception:
            pass

    center_lat = (min_lat + max_lat) / 2.0
    center_lon = (min_lon + max_lon) / 2.0
    city = "Regional District"
    state = "Regional State"
    country = "India"
    display_name = f"Region centered at {center_lat:.2f}N, {center_lon:.2f}E"
    elevation = 45.0

    async with httpx.AsyncClient(timeout=10.0, headers={"User-Agent": "SatQueryAI/1.0"}) as client:
        try:
            geo_res = await client.get(
                "https://nominatim.openstreetmap.org/reverse",
                params={"format": "json", "lat": center_lat, "lon": center_lon, "zoom": 10, "addressdetails": 1}
            )
            if geo_res.status_code == 200:
                geo_data = geo_res.json()
                display_name = geo_data.get("display_name", display_name)
                addr = geo_data.get("address", {})
                city = addr.get("city") or addr.get("town") or addr.get("village") or addr.get("county") or addr.get("state_district") or city
                state = addr.get("state") or addr.get("region") or state
                country = addr.get("country") or country
        except Exception:
            pass

        try:
            elev_res = await client.get(
                "https://api.open-meteo.com/v1/elevation",
                params={"latitude": center_lat, "longitude": center_lon}
            )
            if elev_res.status_code == 200:
                elev_data = elev_res.json()
                if "elevation" in elev_data and elev_data["elevation"]:
                    elevation = elev_data["elevation"][0]
        except Exception:
            pass

    is_coastal, sea, marine_summary = _analyze_marine(center_lat, center_lon, elevation)
    water_bodies = []
    if is_coastal:
        water_bodies.append(sea)
    else:
        water_bodies.append("Inland drainage networks (No oceans or seas in this inland location)")
        if 17.0 <= center_lat <= 17.6 and 78.2 <= center_lon <= 78.7:
            water_bodies.append("Musi River, Hussain Sagar Lake, Osman Sagar, Himayat Sagar")
        elif 15.5 <= center_lat <= 17.5 and 78.0 <= center_lon <= 81.0:
            water_bodies.append("Krishna River Basin inland drainage")
        elif 18.0 <= center_lat <= 20.0 and 79.0 <= center_lon <= 81.0:
            water_bodies.append("Godavari River Basin inland tributaries")

    terrain = "Elevated plateau tableland (200m - 700m elevation)" if elevation >= 200 else ("Coastal plain (<20m elevation)" if is_coastal else "Lowland plain")

    return {
        "bbox": bbox,
        "center": [center_lon, center_lat],
        "city": city,
        "state": state,
        "country": country,
        "display_name": display_name,
        "elevation_meters": elevation,
        "is_coastal": is_coastal,
        "coastal_sea": sea,
        "coastal_summary": marine_summary,
        "terrain_profile": terrain,
        "nearby_water_bodies": water_bodies,
        "osm_type": "fallback_resolved"
    }
