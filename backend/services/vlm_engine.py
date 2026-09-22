from typing import Any, Dict, Optional, Union
import io
import os
from PIL import Image
import numpy as np

def analyze_sensor_fusion_imagery(
    optical_preview_input: Optional[Union[str, bytes, Image.Image]],
    sar_preview_input: Optional[Union[str, bytes, Image.Image]],
    cloud_cover: float = 0.0,
    polarizations: list = None,
    elevation: float = 40.0
) -> Dict[str, Any]:
    pols = polarizations or ["VV", "VH"]
    optical_desc = []
    if cloud_cover < 15.0:
        optical_desc.append("optical bands show high atmospheric transparency with clear ground visibility")
    elif cloud_cover < 40.0:
        optical_desc.append(f"optical bands indicate partial cumulus cloud scatter ({cloud_cover:.1f}% coverage)")
    else:
        optical_desc.append(f"optical spectrum is severely obstructed by dense cloud decks ({cloud_cover:.1f}% coverage)")

    img = None
    if optical_preview_input:
        if isinstance(optical_preview_input, Image.Image):
            img = optical_preview_input.convert("RGB")
        elif isinstance(optical_preview_input, bytes):
            try:
                img = Image.open(io.BytesIO(optical_preview_input)).convert("RGB")
            except Exception:
                pass
        elif isinstance(optical_preview_input, str):
            if os.path.exists(optical_preview_input):
                try:
                    img = Image.open(optical_preview_input).convert("RGB")
                except Exception:
                    pass
            elif optical_preview_input.startswith("http://") or optical_preview_input.startswith("https://"):
                try:
                    import httpx
                    resp = httpx.get(optical_preview_input, timeout=8.0)
                    if resp.status_code == 200:
                        img = Image.open(io.BytesIO(resp.content)).convert("RGB")
                except Exception:
                    pass

    if img is not None:
        arr = np.array(img.resize((96, 96)), dtype=np.float32)
        r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
        greenness = np.mean(g) / (np.mean(r) + np.mean(b) + 1e-5)
        blueness = np.mean(b) / (np.mean(r) + np.mean(g) + 1e-5)
        if greenness > 0.55:
            optical_desc.append("prominent vegetation canopy and irrigated cropland signatures")
        if blueness > 0.6:
            optical_desc.append("visible dark aquatic absorption corresponding to surface water channels")

    sar_desc = [
        f"Sentinel-1 C-band active microwave radio waves (5.405 GHz) operate in {', '.join(pols)} polarizations",
        "radio pulses penetrate cloud cover and precipitation completely without atmospheric attenuation",
        "smooth open water bodies generate distinct low radar backscatter (< -18 dB) due to mirror-like specular scattering away from the sensor",
        "rough terrain, urban settlements, and dense vegetation produce diffuse volume and double-bounce backscatter (> -11 dB)"
    ]

    combined_vision_summary = (
        f"Optical Observations: {'; '.join(optical_desc)}. "
        f"Radio Wave (SAR) Observations: {'; '.join(sar_desc)}. "
        f"Elevation profile at {elevation:.0f}m above sea level."
    )

    return {
        "optical_visual_summary": "; ".join(optical_desc),
        "sar_radar_summary": "; ".join(sar_desc),
        "combined_multimodal_summary": combined_vision_summary
    }

def generate_visual_context(
    image_input: Optional[Union[str, bytes, Image.Image]] = None,
    prompt: str = "Describe the terrain, water bodies, and satellite characteristics.",
    cloud_cover: float = 15.0,
    polarizations: list = None,
    elevation: float = 40.0
) -> str:
    analysis = analyze_sensor_fusion_imagery(
        optical_preview_input=image_input,
        sar_preview_input=None,
        cloud_cover=cloud_cover,
        polarizations=polarizations,
        elevation=elevation
    )
    return analysis["combined_multimodal_summary"]
