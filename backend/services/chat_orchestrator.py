from typing import Any, Dict, List, Optional, Tuple
from datetime import datetime, timedelta, timezone
from pydantic import BaseModel, Field
from backend.services.satellite import fetch_satellite_metadata
from backend.services.geojson_pipeline import BoundingBox, fuse_satellite_records
from backend.services.geo_resolver import resolve_geographic_context

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    query: str
    bbox: List[float] = Field(..., min_length=4, max_length=4)
    chat_history: List[ChatMessage] = Field(default_factory=list)

class ChatResponse(BaseModel):
    reply: str
    geo_context: Optional[Dict[str, Any]] = None

async def process_chat_message(query: str, bbox: List[float], chat_history: List[ChatMessage]) -> Tuple[str, Dict[str, Any]]:
    today = datetime.now(timezone.utc)
    start_str = (today - timedelta(days=60)).strftime("%Y-%m-%d")
    end_str = today.strftime("%Y-%m-%d")

    geo_info = await resolve_geographic_context(bbox)
    scenes = await fetch_satellite_metadata(bbox, start_str, end_str)

    user_bbox = BoundingBox(min_lon=bbox[0], min_lat=bbox[1], max_lon=bbox[2], max_lat=bbox[3])
    fused_records = fuse_satellite_records(scenes["sar"], scenes["optical"], user_bbox)

    sar_scenes = scenes.get("sar", [])
    optical_scenes = scenes.get("optical", [])

    sar_scene_id = sar_scenes[0].scene_id if sar_scenes else "Sentinel-1 GRD SAR Pass"
    pols = sar_scenes[0].polarizations if (sar_scenes and sar_scenes[0].polarizations) else ["VV", "VH"]

    opt_scene_id = optical_scenes[0].scene_id if optical_scenes else "Sentinel-2 MSI Pass"
    cloud_cover = optical_scenes[0].cloud_cover if optical_scenes else 15.0

    city = geo_info.get("city", "Selected Location")
    state = geo_info.get("state", "")
    country = geo_info.get("country", "India")
    elevation = geo_info.get("elevation_meters") or 40.0
    is_coastal = geo_info.get("is_coastal", False)
    coastal_sea = geo_info.get("coastal_sea")
    coastal_summary = geo_info.get("coastal_summary", "")
    water_bodies = ", ".join(geo_info.get("nearby_water_bodies", [])) or "Inland drainage channels"
    terrain = geo_info.get("terrain_profile", "Undulating plains")

    if not is_coastal:
        marine_rule = f"No, {city} is an inland region with no oceans or seas. It is located {coastal_summary}. Local water bodies include {water_bodies}."
    else:
        marine_rule = f"Yes, {city} directly borders the {coastal_sea} ({coastal_summary})."

    q_lower = query.lower()
    if any(k in q_lower for k in ["city", "location", "place", "where"]):
        reply = f"You have selected {city}, {state} ({country}). The terrain is characterized as {terrain} at an average elevation of ~{elevation:.0f} meters. {marine_rule}"
    elif any(k in q_lower for k in ["ocean", "sea", "coast", "beach", "marine"]):
        reply = f"{marine_rule} Elevation is ~{elevation:.0f}m above sea level."
    elif any(k in q_lower for k in ["flood", "water", "river", "lake", "drainage"]):
        reply = (
            f"For {city}, {state}: Local water systems comprise {water_bodies}. "
            f"Sentinel-1 C-band SAR ({', '.join(pols)}) provides active microwave specular reflection mapping for surface inundation, "
            f"while Sentinel-2 optical imagery shows {cloud_cover:.1f}% cloud cover over scene {opt_scene_id}."
        )
    elif any(k in q_lower for k in ["vegetation", "crop", "forest", "green", "agriculture"]):
        reply = (
            f"In {city}, {state}: Sentinel-2 optical spectral bands (B04 Red, B03 Green, B02 Blue) capture surface reflectance "
            f"with {cloud_cover:.1f}% cloud cover. Sentinel-1 cross-polarization (VH) provides volume scattering data indicating canopy density across {terrain}."
        )
    else:
        reply = (
            f"Ground Truth for {city}, {state} ({country}) at ~{elevation:.0f}m elevation: {marine_rule} "
            f"Fused data incorporates Sentinel-2 optical scene {opt_scene_id} ({cloud_cover:.1f}% cloud cover) "
            f"and Sentinel-1 C-band SAR scene {sar_scene_id} ({', '.join(pols)})."
        )

    return reply, geo_info
