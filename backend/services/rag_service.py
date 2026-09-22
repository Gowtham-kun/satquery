from typing import Any, Dict, List, Optional, Tuple
import os
import re
import numpy as np
import faiss
from sentence_transformers import SentenceTransformer
from huggingface_hub import InferenceClient

_EMBED_MODEL = None

def get_embed_model() -> SentenceTransformer:
    global _EMBED_MODEL
    if _EMBED_MODEL is None:
        _EMBED_MODEL = SentenceTransformer("all-MiniLM-L6-v2")
    return _EMBED_MODEL

class EphemeralGeoIndex:
    def __init__(self, documents: List[str], metadata_list: List[Dict[str, Any]]):
        self.documents = documents
        self.metadata_list = metadata_list
        self.model = get_embed_model()
        if documents:
            embeddings = self.model.encode(documents, convert_to_numpy=True, normalize_embeddings=True)
            self.dimension = embeddings.shape[1]
            self.index = faiss.IndexFlatIP(self.dimension)
            self.index.add(embeddings.astype(np.float32))
        else:
            self.dimension = 384
            self.index = faiss.IndexFlatIP(self.dimension)

    def retrieve(self, query: str, top_k: int = 4) -> List[Tuple[str, Dict[str, Any], float]]:
        if self.index.ntotal == 0:
            return []
        q_emb = self.model.encode([query], convert_to_numpy=True, normalize_embeddings=True).astype(np.float32)
        k = min(top_k, self.index.ntotal)
        scores, indices = self.index.search(q_emb, k)
        results = []
        for score, idx in zip(scores[0], indices[0]):
            if idx != -1 and idx < len(self.documents):
                results.append((self.documents[idx], self.metadata_list[idx], float(score)))
        return results

def build_corpus_from_geojson(geojson_payload: Dict[str, Any]) -> Tuple[List[str], List[Dict[str, Any]]]:
    features = geojson_payload.get("features", [])
    documents: List[str] = []
    metadata_list: List[Dict[str, Any]] = []
    for f in features:
        props = f.get("properties", {})
        fid = f.get("id") or props.get("fusion_id", "FUSION_RECORD")
        sar_id = props.get("sar_scene_id") or "NONE"
        opt_id = props.get("optical_scene_id") or "NONE"
        sar_plat = props.get("sar_platform") or "N/A"
        opt_plat = props.get("optical_platform") or "N/A"
        sar_time = props.get("sar_datetime") or "N/A"
        opt_time = props.get("optical_datetime") or "N/A"
        pols = ", ".join(props.get("polarizations", [])) or "None"
        orbit = props.get("orbit_direction") or "N/A"
        cloud = props.get("optical_cloud_cover", 0.0)
        penalty = props.get("optical_cloud_penalty", 0.0)
        delta_hrs = props.get("temporal_delta_hours", 0.0)
        overlap = props.get("spatial_overlap_ratio", 0.0)
        status = props.get("dual_mode_coverage_status", "UNKNOWN")
        bbox = f.get("bbox") or props.get("bbox") or []
        doc_text = (
            f"Fusion Record ID: {fid}\n"
            f"Sensor Configuration: SAR Platform: {sar_plat} (Scene: {sar_id}) | Optical Platform: {opt_plat} (Scene: {opt_id})\n"
            f"Acquisition Datetimes: SAR UTC: {sar_time} | Optical UTC: {opt_time}\n"
            f"SAR Polarizations: {pols} | Orbit State: {orbit} | All-Weather Penetration: True\n"
            f"Optical Cloud Cover: {cloud}% (Cloud Penalty Factor: {penalty})\n"
            f"Spatial & Temporal Alignment: Overlap Ratio: {overlap} | Temporal Delta: {delta_hrs} hours | Fusion Status: {status}\n"
            f"Bounding Box Coordinates: {bbox}\n"
            f"Radar Flood & Surface Capabilities: C-band radar backscatter enables specular reflection detection of standing floodwater and water bodies impervious to cloud occlusion.\n"
            f"Optical Multi-Spectral Capabilities: Surface reflectance allows vegetation index and urban delineation when cloud cover is low."
        )
        meta = {
            "fusion_id": fid,
            "sar_scene_id": sar_id,
            "optical_scene_id": opt_id,
            "bbox": bbox,
            "status": status,
            "cloud_cover": cloud,
            "polarizations": props.get("polarizations", []),
            "temporal_delta_hours": delta_hrs
        }
        documents.append(doc_text)
        metadata_list.append(meta)
    return documents, metadata_list

def _synthesize_grounded_answer(query: str, retrieved_chunks: List[Tuple[str, Dict[str, Any], float]]) -> str:
    lines = []
    lines.append(f"Analysis based on {len(retrieved_chunks)} retrieved multi-sensor satellite fusion passes for query: '{query}':\n")
    for idx, (doc, meta, score) in enumerate(retrieved_chunks, 1):
        fid = meta.get("fusion_id")
        sar_id = meta.get("sar_scene_id")
        opt_id = meta.get("optical_scene_id")
        cloud = meta.get("cloud_cover", 0.0)
        pols = meta.get("polarizations", [])
        status = meta.get("status")
        delta = meta.get("temporal_delta_hours", 0.0)
        lines.append(f"[{idx}] Scene Pair {fid}:")
        if sar_id != "NONE":
            lines.append(f" - SAR Sentinel-1 Scene: {sar_id} with polarizations {pols}. All-weather C-band backscatter provides direct surface water penetration.")
        if opt_id != "NONE":
            lines.append(f" - Optical Sentinel-2 Scene: {opt_id} has {cloud}% cloud cover.")
            if cloud > 25.0:
                lines.append(f"   Note: High optical occlusion ({cloud}%); SAR backscatter takes precedence for flood delineation.")
            else:
                lines.append(f"   Clear optical observation allows multi-spectral cross-validation with SAR backscatter.")
        lines.append(f" - Temporal Delta: {delta} hours | Status: {status} | Retrieval Score: {score:.3f}\n")
    q_lower = query.lower()
    if "flood" in q_lower or "water" in q_lower:
        lines.append("Operational Flood Assessment: Standing floodwaters cause specular scattering of active radar pulses, yielding distinct low backscatter signatures in VV/VH channels independent of cloud cover.")
    elif "cloud" in q_lower:
        lines.append("Cloud Penetration Summary: Sentinel-1 C-band synthetic aperture radar penetrates dense cloud decks, overcoming Sentinel-2 optical occlusion.")
    else:
        lines.append("Spatial-Temporal Summary: Paired scenes offer complementary radar backscatter and multi-spectral surface reflectance aligned for ISRO Bhuvan vector ingestion.")
    return "\n".join(lines)

async def execute_geospatial_rag(query: str, geojson_context: Dict[str, Any]) -> Dict[str, Any]:
    documents, metadata_list = build_corpus_from_geojson(geojson_context)
    if not documents:
        return {
            "answer": "No satellite scenes found in the provided geospatial context. Please adjust your bounding box or date range.",
            "referenced_scenes": [],
            "spatial_context": geojson_context.get("bbox", []),
            "confidence_score": 0.0
        }
    index = EphemeralGeoIndex(documents, metadata_list)
    retrieved = index.retrieve(query, top_k=4)
    ref_scenes = []
    for _, meta, _ in retrieved:
        if meta.get("sar_scene_id") and meta.get("sar_scene_id") != "NONE":
            ref_scenes.append(meta["sar_scene_id"])
        if meta.get("optical_scene_id") and meta.get("optical_scene_id") != "NONE":
            ref_scenes.append(meta["optical_scene_id"])
    ref_scenes = list(dict.fromkeys(ref_scenes))
    hf_token = os.getenv("HF_TOKEN") or os.getenv("HUGGINGFACEHUB_API_TOKEN")
    answer_text = ""
    confidence = float(np.mean([s for _, _, s in retrieved])) if retrieved else 0.5
    if hf_token:
        try:
            client = InferenceClient(api_key=hf_token)
            context_block = "\n---\n".join([d for d, _, _ in retrieved])
            prompt = (
                f"You are SatQuery AI, an expert earth observation vision-language system. "
                f"Answer the query using ONLY the provided satellite metadata.\n\n"
                f"Satellite Metadata Context:\n{context_block}\n\n"
                f"User Query: {query}\n\n"
                f"Strict Grounded Answer (incorporate SAR polarizations, cloud cover, scene IDs, temporal deltas):"
            )
            response = client.text_generation(
                prompt,
                model="mistralai/Mistral-7B-Instruct-v0.3",
                max_new_tokens=400,
                temperature=0.2
            )
            answer_text = response.strip()
        except Exception:
            answer_text = _synthesize_grounded_answer(query, retrieved)
    else:
        answer_text = _synthesize_grounded_answer(query, retrieved)
    return {
        "answer": answer_text,
        "referenced_scenes": ref_scenes,
        "spatial_context": {
            "bbox": geojson_context.get("bbox", []),
            "retrieved_count": len(retrieved),
            "top_match_fusion_id": retrieved[0][1]["fusion_id"] if retrieved else None
        },
        "confidence_score": round(confidence, 3)
    }
