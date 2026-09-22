from typing import Any, Dict, List, Optional
import asyncio
import httpx
from pydantic import BaseModel, Field

class RawSatelliteScene(BaseModel):
    scene_id: str
    collection: str
    sensor_type: str
    platform: str
    datetime: str
    bbox: List[float]
    geometry: Dict[str, Any]
    polarizations: List[str] = Field(default_factory=list)
    orbit_direction: Optional[str] = None
    cloud_cover: float = 0.0
    preview_url: Optional[str] = None
    asset_urls: Dict[str, str] = Field(default_factory=dict)
    raw_properties: Dict[str, Any] = Field(default_factory=dict)

PLANETARY_STAC_URL = "https://planetarycomputer.microsoft.com/api/stac/v1/search"
COPERNICUS_STAC_URL = "https://catalogue.dataspace.copernicus.eu/stac/search"

async def _query_stac_collection(client: httpx.AsyncClient, base_url: str, collection: str, bbox: List[float], datetime_range: str, limit: int = 10) -> List[Dict[str, Any]]:
    payload = {"collections": [collection], "bbox": bbox, "datetime": datetime_range, "limit": limit}
    headers = {"Content-Type": "application/json", "Accept": "application/geo+json, application/json"}
    try:
        response = await client.post(base_url, json=payload, headers=headers, timeout=25.0)
        if response.status_code == 200:
            return response.json().get("features", [])
    except (httpx.HTTPError, httpx.TimeoutException):
        pass
    return []

def _normalize_scene(feature: Dict[str, Any], collection_name: str) -> RawSatelliteScene:
    props = feature.get("properties", {})
    assets = feature.get("assets", {})
    is_sar = "sentinel-1" in collection_name.lower() or "sar" in collection_name.lower()
    sensor_type = "SAR" if is_sar else "OPTICAL"
    polarizations = props.get("sar:polarizations") or []
    if not polarizations and is_sar:
        polarizations = [k.upper() for k in ["vv", "vh", "hh", "hv"] if k in assets]
        if not polarizations:
            polarizations = ["VV", "VH"]
    cloud_cover = float(props.get("eo:cloud_cover", 0.0) if not is_sar else 0.0)
    orbit_dir = props.get("sat:orbit_state") or props.get("s1:orbit_source") or props.get("orbit_direction") or "DESCENDING"
    preview_url = None
    for k in ["rendered_preview", "preview", "thumbnail", "visual"]:
        if k in assets and "href" in assets[k]:
            preview_url = assets[k]["href"]
            break
    asset_urls = {k: v["href"] for k, v in assets.items() if isinstance(v, dict) and "href" in v}
    geom = feature.get("geometry", {})
    bbox = feature.get("bbox") or []
    if not bbox and geom.get("type") == "Polygon" and geom.get("coordinates"):
        coords = geom["coordinates"][0]
        lons = [c[0] for c in coords]
        lats = [c[1] for c in coords]
        bbox = [min(lons), min(lats), max(lons), max(lats)]
    return RawSatelliteScene(
        scene_id=feature.get("id", "UNKNOWN"),
        collection=collection_name,
        sensor_type=sensor_type,
        platform=props.get("platform", "Sentinel" if is_sar else "Sentinel-2"),
        datetime=props.get("datetime", ""),
        bbox=bbox,
        geometry=geom,
        polarizations=polarizations,
        orbit_direction=str(orbit_dir),
        cloud_cover=cloud_cover,
        preview_url=preview_url,
        asset_urls=asset_urls,
        raw_properties=props
    )

async def fetch_satellite_metadata(bbox: List[float], start_date: str, end_date: str) -> Dict[str, List[RawSatelliteScene]]:
    dt_clean = f"{start_date.split('T')[0]}T00:00:00Z/{end_date.split('T')[0]}T23:59:59Z"
    limits = {"sentinel-1-grd": 6, "sentinel-2-l2a": 6}
    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        tasks = [
            _query_stac_collection(client, PLANETARY_STAC_URL, "sentinel-1-grd", bbox, dt_clean, limits["sentinel-1-grd"]),
            _query_stac_collection(client, PLANETARY_STAC_URL, "sentinel-2-l2a", bbox, dt_clean, limits["sentinel-2-l2a"])
        ]
        s1_features, s2_features = await asyncio.gather(*tasks)
        if not s1_features:
            s1_features = await _query_stac_collection(client, COPERNICUS_STAC_URL, "sentinel-1-grd", bbox, dt_clean, limits["sentinel-1-grd"])
        if not s2_features:
            s2_features = await _query_stac_collection(client, COPERNICUS_STAC_URL, "sentinel-2-l2a", bbox, dt_clean, limits["sentinel-2-l2a"])
    sar_scenes = [_normalize_scene(f, "sentinel-1-grd") for f in s1_features]
    optical_scenes = [_normalize_scene(f, "sentinel-2-l2a") for f in s2_features]
    return {"sar": sar_scenes, "optical": optical_scenes}
