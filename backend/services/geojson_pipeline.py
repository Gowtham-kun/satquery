from typing import Any, Dict, List, Optional, Tuple
from datetime import datetime, timezone
import json
from pydantic import BaseModel, Field
from shapely.geometry import box, mapping, shape
from shapely.geometry.base import BaseGeometry
from backend.services.satellite import RawSatelliteScene

class BoundingBox(BaseModel):
    min_lon: float
    min_lat: float
    max_lon: float
    max_lat: float

    def to_list(self) -> List[float]:
        return [self.min_lon, self.min_lat, self.max_lon, self.max_lat]

    def to_polygon_geom(self) -> BaseGeometry:
        return box(self.min_lon, self.min_lat, self.max_lon, self.max_lat)

class SatelliteMetadata(BaseModel):
    scene_id: str
    collection: str
    sensor_type: str
    platform: str
    datetime: str
    polarizations: List[str] = Field(default_factory=list)
    orbit_direction: Optional[str] = None
    cloud_cover: float = 0.0
    preview_url: Optional[str] = None
    asset_urls: Dict[str, str] = Field(default_factory=dict)
    bbox: List[float] = Field(default_factory=list)

class FusionRecord(BaseModel):
    fusion_id: str
    sar_scene_id: Optional[str] = None
    optical_scene_id: Optional[str] = None
    sar_platform: Optional[str] = None
    optical_platform: Optional[str] = None
    sar_datetime: Optional[str] = None
    optical_datetime: Optional[str] = None
    temporal_delta_hours: float = 0.0
    spatial_overlap_ratio: float = 0.0
    optical_cloud_cover: float = 0.0
    optical_cloud_penalty: float = 0.0
    sar_all_weather_validity: bool = True
    dual_mode_coverage_status: str
    polarizations: List[str] = Field(default_factory=list)
    orbit_direction: Optional[str] = None
    geometry: Dict[str, Any]
    bbox: List[float]
    preview_sar: Optional[str] = None
    preview_optical: Optional[str] = None
    bhuvan_metadata: Dict[str, Any] = Field(default_factory=dict)

def _parse_iso(dt_str: str) -> Optional[datetime]:
    if not dt_str:
        return None
    clean = dt_str.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(clean)
    except Exception:
        return None

def _extract_shapely_geom(scene: RawSatelliteScene, fallback_box: BoundingBox) -> BaseGeometry:
    if scene.geometry and scene.geometry.get("type") and scene.geometry.get("coordinates"):
        try:
            geom = shape(scene.geometry)
            if geom.is_valid and not geom.is_empty:
                return geom
            cleaned = geom.buffer(0)
            if cleaned.is_valid and not cleaned.is_empty:
                return cleaned
        except Exception:
            pass
    if scene.bbox and len(scene.bbox) == 4:
        return box(scene.bbox[0], scene.bbox[1], scene.bbox[2], scene.bbox[3])
    return fallback_box.to_polygon_geom()

def fuse_satellite_records(sar_scenes: List[RawSatelliteScene], optical_scenes: List[RawSatelliteScene], user_bbox: BoundingBox) -> List[FusionRecord]:
    fused_records: List[FusionRecord] = []
    user_poly = user_bbox.to_polygon_geom()
    paired_optical_ids = set()
    for s_idx, sar in enumerate(sar_scenes):
        sar_geom = _extract_shapely_geom(sar, user_bbox)
        sar_dt = _parse_iso(sar.datetime)
        best_optical: Optional[RawSatelliteScene] = None
        best_delta: float = float("inf")
        best_overlap: float = 0.0
        best_intersect_geom: Optional[BaseGeometry] = None
        for opt in optical_scenes:
            opt_geom = _extract_shapely_geom(opt, user_bbox)
            if not sar_geom.intersects(opt_geom):
                continue
            intersection = sar_geom.intersection(opt_geom)
            if intersection.is_empty:
                continue
            overlap_ratio = (intersection.area / min(sar_geom.area, opt_geom.area)) if min(sar_geom.area, opt_geom.area) > 0 else 0.0
            opt_dt = _parse_iso(opt.datetime)
            delta_hrs = abs((opt_dt - sar_dt).total_seconds()) / 3600.0 if (opt_dt and sar_dt) else 0.0
            if delta_hrs < best_delta:
                best_delta = delta_hrs
                best_optical = opt
                best_overlap = overlap_ratio
                best_intersect_geom = intersection
        fusion_id = f"FUSION_{sar.scene_id[:18]}_{best_optical.scene_id[:18] if best_optical else 'SAR_SOLO'}_{s_idx}"
        if best_optical and best_intersect_geom and not best_intersect_geom.is_empty:
            paired_optical_ids.add(best_optical.scene_id)
            c_cover = best_optical.cloud_cover
            penalty = round(c_cover / 100.0, 4)
            if c_cover < 20.0 and best_delta <= 48.0:
                status = "OPTIMAL_DUAL_PASS"
            elif c_cover >= 50.0:
                status = "SAR_PRIMARY_OPTICAL_CLOUDY"
            elif best_delta > 72.0:
                status = "SAR_OPTICAL_TEMPORAL_LAG"
            else:
                status = "BALANCED_MULTI_SPECTRAL_FUSED"
            final_geom = best_intersect_geom.intersection(user_poly) if best_intersect_geom.intersects(user_poly) else best_intersect_geom
            if final_geom.is_empty:
                final_geom = best_intersect_geom
            fused_records.append(FusionRecord(
                fusion_id=fusion_id,
                sar_scene_id=sar.scene_id,
                optical_scene_id=best_optical.scene_id,
                sar_platform=sar.platform,
                optical_platform=best_optical.platform,
                sar_datetime=sar.datetime,
                optical_datetime=best_optical.datetime,
                temporal_delta_hours=round(best_delta, 2),
                spatial_overlap_ratio=round(best_overlap, 4),
                optical_cloud_cover=c_cover,
                optical_cloud_penalty=penalty,
                sar_all_weather_validity=True,
                dual_mode_coverage_status=status,
                polarizations=sar.polarizations,
                orbit_direction=sar.orbit_direction,
                geometry=mapping(final_geom),
                bbox=list(final_geom.bounds),
                preview_sar=sar.preview_url,
                preview_optical=best_optical.preview_url,
                bhuvan_metadata={
                    "bhuvan_layer_id": "SATQUERY_SAR_OPTICAL_FUSION",
                    "organization": "ISRO/NRSC Bhuvan Compatible",
                    "crs": "EPSG:4326",
                    "vector_type": "MultiPolygon/Polygon",
                    "sensor_mode": "C-band Synthetic Aperture Radar & MSI Optical",
                    "spatial_resolution_meters": 10.0,
                    "all_weather_penetration": True,
                    "cloud_occlusion_mitigated": bool(c_cover >= 20.0)
                }
            ))
        else:
            final_sar_geom = sar_geom.intersection(user_poly) if sar_geom.intersects(user_poly) else sar_geom
            fused_records.append(FusionRecord(
                fusion_id=fusion_id,
                sar_scene_id=sar.scene_id,
                optical_scene_id=None,
                sar_platform=sar.platform,
                optical_platform=None,
                sar_datetime=sar.datetime,
                optical_datetime=None,
                temporal_delta_hours=0.0,
                spatial_overlap_ratio=1.0,
                optical_cloud_cover=0.0,
                optical_cloud_penalty=0.0,
                sar_all_weather_validity=True,
                dual_mode_coverage_status="SAR_ALL_WEATHER_SOLO",
                polarizations=sar.polarizations,
                orbit_direction=sar.orbit_direction,
                geometry=mapping(final_sar_geom),
                bbox=list(final_sar_geom.bounds),
                preview_sar=sar.preview_url,
                preview_optical=None,
                bhuvan_metadata={
                    "bhuvan_layer_id": "SATQUERY_SAR_SOLO",
                    "organization": "ISRO/NRSC Bhuvan Compatible",
                    "crs": "EPSG:4326",
                    "sensor_mode": "Sentinel-1 SAR C-Band",
                    "spatial_resolution_meters": 10.0,
                    "all_weather_penetration": True
                }
            ))
    for o_idx, opt in enumerate(optical_scenes):
        if opt.scene_id in paired_optical_ids:
            continue
        opt_geom = _extract_shapely_geom(opt, user_bbox)
        final_opt_geom = opt_geom.intersection(user_poly) if opt_geom.intersects(user_poly) else opt_geom
        fused_records.append(FusionRecord(
            fusion_id=f"OPTICAL_SOLO_{opt.scene_id[:18]}_{o_idx}",
            sar_scene_id=None,
            optical_scene_id=opt.scene_id,
            sar_platform=None,
            optical_platform=opt.platform,
            sar_datetime=None,
            optical_datetime=opt.datetime,
            temporal_delta_hours=0.0,
            spatial_overlap_ratio=1.0,
            optical_cloud_cover=opt.cloud_cover,
            optical_cloud_penalty=round(opt.cloud_cover / 100.0, 4),
            sar_all_weather_validity=False,
            dual_mode_coverage_status="OPTICAL_SOLO_CLEAR" if opt.cloud_cover < 25.0 else "OPTICAL_SOLO_CLOUDY",
            polarizations=[],
            orbit_direction=opt.orbit_direction,
            geometry=mapping(final_opt_geom),
            bbox=list(final_opt_geom.bounds),
            preview_sar=None,
            preview_optical=opt.preview_url,
            bhuvan_metadata={
                "bhuvan_layer_id": "SATQUERY_OPTICAL_SOLO",
                "organization": "ISRO/NRSC Bhuvan Compatible",
                "crs": "EPSG:4326",
                "sensor_mode": "Sentinel-2 MSI Optical",
                "spatial_resolution_meters": 10.0,
                "all_weather_penetration": False
            }
        ))
    return fused_records

def build_bhuvan_geojson_collection(records: List[FusionRecord], user_bbox: Optional[BoundingBox] = None) -> Dict[str, Any]:
    features: List[Dict[str, Any]] = []
    for rec in records:
        props = rec.model_dump(exclude={"geometry"})
        features.append({
            "type": "Feature",
            "id": rec.fusion_id,
            "geometry": rec.geometry,
            "bbox": rec.bbox,
            "properties": props
        })
    fc_bbox = user_bbox.to_list() if user_bbox else ([min([f["bbox"][0] for f in features]), min([f["bbox"][1] for f in features]), max([f["bbox"][2] for f in features]), max([f["bbox"][3] for f in features])] if features else [0.0, 0.0, 0.0, 0.0])
    return {
        "type": "FeatureCollection",
        "crs": {
            "type": "name",
            "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"}
        },
        "bbox": fc_bbox,
        "features": features,
        "bhuvan_metadata": {
            "standard": "OGC GeoJSON RFC 7946 / ISRO Bhuvan Vector Layer Spec",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "feature_count": len(features),
            "crs_name": "WGS84 EPSG:4326"
        }
    }

def serialize_geojson_bytes(geojson_data: Dict[str, Any]) -> bytes:
    return json.dumps(geojson_data, separators=(",", ":")).encode("utf-8")

def serialize_geojson_str(geojson_data: Dict[str, Any]) -> str:
    return json.dumps(geojson_data, separators=(",", ":"))
