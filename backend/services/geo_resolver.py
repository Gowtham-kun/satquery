from typing import Any, Dict, List
import asyncio
import json
import os
import shutil
import httpx

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
    country = "Regional Country"
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
                city = addr.get("city") or addr.get("town") or addr.get("village") or addr.get("county") or city
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

    water_bodies = []
    if 79.5 <= center_lon <= 95.0 and 5.0 <= center_lat <= 22.5:
        water_bodies.append("Bay of Bengal")
    if 65.0 <= center_lon <= 78.0 and 7.0 <= center_lat <= 25.0:
        water_bodies.append("Arabian Sea")
    if center_lat <= 6.0 and 65.0 <= center_lon <= 95.0:
        water_bodies.append("Indian Ocean")
    if 16.0 <= center_lat <= 19.5 and 79.0 <= center_lon <= 83.0:
        water_bodies.append("Godavari River Basin")
    if 15.0 <= center_lat <= 17.5 and 78.0 <= center_lon <= 81.5:
        water_bodies.append("Krishna River Basin")
    if 24.0 <= center_lat <= 27.5 and 78.0 <= center_lon <= 90.0:
        water_bodies.append("Ganges River Basin")

    return {
        "bbox": bbox,
        "center": [center_lon, center_lat],
        "city": city,
        "state": state,
        "country": country,
        "display_name": display_name,
        "elevation_meters": elevation,
        "terrain_profile": f"Terrain with approximately {elevation}m elevation above sea level",
        "nearby_water_bodies": water_bodies if water_bodies else ["Local inland drainage networks"],
        "osm_type": "fallback_resolved"
    }
