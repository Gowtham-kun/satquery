from typing import Any, Dict, List, Optional
from datetime import datetime, timedelta, timezone
import httpx
from pydantic import BaseModel, Field
import pystac_client
import planetary_computer

STAC_ENDPOINT = "https://planetarycomputer.microsoft.com/api/stac/v1"

class ImagerySearchRequest(BaseModel):
    bbox: List[float] = Field(..., min_length=4, max_length=4)
    start_date: Optional[str] = None
    end_date: Optional[str] = None

class SceneInfo(BaseModel):
    scene_id: str
    datetime: str
    platform: str
    preview_url: Optional[str] = None
    asset_urls: Dict[str, str] = Field(default_factory=dict)
    properties: Dict[str, Any] = Field(default_factory=dict)

class ImagerySearchResult(BaseModel):
    status: str
    bbox: List[float]
    optical: Optional[SceneInfo] = None
    sar: Optional[SceneInfo] = None

def _get_stac_client() -> pystac_client.Client:
    return pystac_client.Client.open(STAC_ENDPOINT, modifier=planetary_computer.sign_inplace)

async def search_imagery(bbox: List[float], start_date: Optional[str] = None, end_date: Optional[str] = None) -> Dict[str, Any]:
    now = datetime.now(timezone.utc)
    if not end_date:
        end_date = now.strftime("%Y-%m-%d")
    if not start_date:
        start_date = (now - timedelta(days=90)).strftime("%Y-%m-%d")
    dt_str = f"{start_date.split('T')[0]}/{end_date.split('T')[0]}"

    catalog = _get_stac_client()

    opt_search = catalog.search(
        collections=["sentinel-2-l2a"],
        bbox=bbox,
        datetime=dt_str,
        query={"eo:cloud_cover": {"lt": 25}},
        max_items=5
    )
    opt_items = list(opt_search.items())
    if not opt_items:
        opt_search = catalog.search(
            collections=["sentinel-2-l2a"],
            bbox=bbox,
            datetime=dt_str,
            max_items=5
        )
        opt_items = list(opt_search.items())

    optical_info = None
    if opt_items:
        opt_items.sort(key=lambda x: x.properties.get("eo:cloud_cover", 100.0))
        best_opt = opt_items[0]
        opt_assets = {}
        for band in ["B02", "B03", "B04", "B08", "visual", "rendered_preview"]:
            if band in best_opt.assets:
                opt_assets[band] = best_opt.assets[band].href
        optical_info = {
            "scene_id": best_opt.id,
            "datetime": best_opt.datetime.isoformat() if best_opt.datetime else best_opt.properties.get("datetime", ""),
            "platform": best_opt.properties.get("platform", "Sentinel-2"),
            "cloud_cover": float(best_opt.properties.get("eo:cloud_cover", 0.0)),
            "preview_url": opt_assets.get("rendered_preview") or opt_assets.get("visual"),
            "asset_urls": opt_assets,
            "properties": best_opt.properties
        }

    sar_search = catalog.search(
        collections=["sentinel-1-grd"],
        bbox=bbox,
        datetime=dt_str,
        max_items=5
    )
    sar_items = list(sar_search.items())
    sar_info = None
    if sar_items:
        best_sar = sar_items[0]
        sar_assets = {}
        for band in ["vv", "vh", "thumbnail", "rendered_preview"]:
            if band in best_sar.assets:
                sar_assets[band] = best_sar.assets[band].href
        pols = best_sar.properties.get("sar:polarizations") or [k.upper() for k in ["vv", "vh"] if k in sar_assets]
        sar_info = {
            "scene_id": best_sar.id,
            "datetime": best_sar.datetime.isoformat() if best_sar.datetime else best_sar.properties.get("datetime", ""),
            "platform": best_sar.properties.get("platform", "Sentinel-1"),
            "polarizations": pols,
            "orbit_direction": best_sar.properties.get("sat:orbit_state", "DESCENDING"),
            "preview_url": sar_assets.get("rendered_preview") or sar_assets.get("thumbnail"),
            "asset_urls": sar_assets,
            "properties": best_sar.properties
        }

    return {
        "status": "success",
        "bbox": bbox,
        "optical": optical_info,
        "sar": sar_info
    }

ALLOWED_PROXY_HOSTS = ("blob.core.windows.net", "planetarycomputer.microsoft.com")

async def proxy_cog_bytes(url: str, range_header: Optional[str] = None) -> tuple[bytes, int, Dict[str, str]]:
    if not any(host in url for host in ALLOWED_PROXY_HOSTS):
        raise ValueError("Invalid target host for proxy")
    headers = {}
    if range_header:
        headers["Range"] = range_header
    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        resp = await client.get(url, headers=headers)
        out_headers = {
            "Content-Type": resp.headers.get("Content-Type", "application/octet-stream"),
            "Accept-Ranges": "bytes",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Expose-Headers": "Content-Range, Content-Length, Accept-Ranges"
        }
        if "Content-Range" in resp.headers:
            out_headers["Content-Range"] = resp.headers["Content-Range"]
        if "Content-Length" in resp.headers:
            out_headers["Content-Length"] = resp.headers["Content-Length"]
        return resp.content, resp.status_code, out_headers
