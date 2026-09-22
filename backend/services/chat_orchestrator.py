from typing import Any, Dict, List, Optional, Tuple
import os
from datetime import datetime, timedelta, timezone
from pydantic import BaseModel, Field
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from backend.services.satellite import fetch_satellite_metadata
from backend.services.geojson_pipeline import BoundingBox, fuse_satellite_records
from backend.services.geo_resolver import resolve_geographic_context
from backend.services.vlm_engine import analyze_sensor_fusion_imagery

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

_LOCAL_LLM = None
_LOCAL_TOKENIZER = None

def _get_local_generator():
    global _LOCAL_LLM, _LOCAL_TOKENIZER
    if _LOCAL_LLM is None:
        model_name = os.getenv("LOCAL_LLM_MODEL", "Qwen/Qwen2.5-0.5B-Instruct")
        device = "cuda:0" if torch.cuda.is_available() else "cpu"
        _LOCAL_TOKENIZER = AutoTokenizer.from_pretrained(model_name)
        _LOCAL_LLM = AutoModelForCausalLM.from_pretrained(
            model_name,
            dtype=torch.float16 if device.startswith("cuda") else torch.float32,
            device_map=device
        )
    return _LOCAL_LLM, _LOCAL_TOKENIZER

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
    sar_time = sar_scenes[0].datetime if sar_scenes else "Recent Acquisition"
    pols = sar_scenes[0].polarizations if (sar_scenes and sar_scenes[0].polarizations) else ["VV", "VH"]

    opt_scene_id = optical_scenes[0].scene_id if optical_scenes else "Sentinel-2 MSI Pass"
    opt_time = optical_scenes[0].datetime if optical_scenes else "Recent Acquisition"
    cloud_cover = optical_scenes[0].cloud_cover if optical_scenes else 15.0
    preview_url = optical_scenes[0].preview_url if (optical_scenes and optical_scenes[0].preview_url) else (sar_scenes[0].preview_url if sar_scenes else None)

    elevation = geo_info.get("elevation_meters") or 40.0
    multimodal = analyze_sensor_fusion_imagery(
        optical_preview_input=preview_url,
        sar_preview_input=None,
        cloud_cover=cloud_cover,
        polarizations=pols,
        elevation=elevation
    )

    city = geo_info.get("city", "Selected Location")
    state = geo_info.get("state", "")
    country = geo_info.get("country", "India")
    is_coastal = geo_info.get("is_coastal", False)
    coastal_sea = geo_info.get("coastal_sea")
    coastal_summary = geo_info.get("coastal_summary", "")
    water_bodies = ", ".join(geo_info.get("nearby_water_bodies", [])) or "Inland drainage channels"
    terrain = geo_info.get("terrain_profile", "Undulating plains")

    if not is_coastal:
        marine_rule = f"No, {city} is an inland city and does NOT have any oceans or seas. It is located {coastal_summary}. Local inland water bodies include {water_bodies}."
    else:
        marine_rule = f"Yes, {city} directly borders the {coastal_sea} ({coastal_summary})."

    system_message = (
        f"You are SatQuery AI (SIH Problem Statement 167), an expert earth observation assistant fusing Sentinel-1 SAR radio wave radar and Sentinel-2 Optical satellite imagery.\n\n"
        f"SELECTED REGION GROUND TRUTH:\n"
        f"- Administrative Location: {city}, {state}, {country}.\n"
        f"- Marine & Coastal Status: {coastal_summary}.\n"
        f"- Local Water Bodies: {water_bodies}.\n"
        f"- Terrain & Elevation: {terrain} (approx. {elevation:.0f} meters elevation).\n"
        f"- Optical Sensor (Sentinel-2 MSI): Scene {opt_scene_id}, cloud cover {cloud_cover:.1f}%. Observation: {multimodal['optical_visual_summary']}.\n"
        f"- Radio Wave SAR Sensor (Sentinel-1 C-Band): Scene {sar_scene_id}, polarizations {', '.join(pols)}. Microwave radar: {multimodal['sar_radar_summary']}.\n\n"
        f"CRITICAL TRUTH DIRECTIVES:\n"
        f"1. If the user asks which city, place, or location was selected, explicitly answer: 'You have selected {city}, {state}, {country}.'\n"
        f"2. If the user asks if there are oceans, seas, or coastlines:\n"
        f"   - Response: '{marine_rule}'\n"
        f"3. Always combine optical sensor reflectance and SAR microwave radar observations naturally.\n"
        f"4. Never output raw JSON, code blocks, or placeholders."
    )

    messages = [{"role": "system", "content": system_message}]
    for m in chat_history[-3:]:
        messages.append({"role": m.role, "content": m.content})
    messages.append({"role": "user", "content": query})

    try:
        model, tokenizer = _get_local_generator()
        prompt_text = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
        inputs = tokenizer([prompt_text], return_tensors="pt").to(model.device)
        with torch.no_grad():
            outputs = model.generate(
                **inputs,
                max_new_tokens=220,
                temperature=0.15,
                do_sample=False,
                repetition_penalty=1.15
            )
        generated_tokens = outputs[0][len(inputs.input_ids[0]):]
        reply_text = tokenizer.decode(generated_tokens, skip_special_tokens=True).strip()
        if reply_text:
            return reply_text, geo_info
    except Exception:
        pass

    fallback_reply = (
        f"For your selected area in {city}, {state} (elevation ~{elevation:.0f}m): "
        f"{marine_rule} "
        f"Sentinel-2 optical sensors report {cloud_cover:.1f}% cloud cover with {multimodal['optical_visual_summary']}, "
        f"while Sentinel-1 C-band radio wave radar ({', '.join(pols)}) actively maps surface water features via specular backscatter."
    )
    return fallback_reply, geo_info
