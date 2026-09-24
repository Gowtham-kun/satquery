from typing import Any, Dict, List
import io
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from backend.services.satellite import fetch_satellite_metadata
from backend.services.imagery_provider import ImagerySearchRequest, search_imagery, proxy_cog_bytes
from backend.services.geojson_pipeline import (
    BoundingBox,
    fuse_satellite_records,
    build_bhuvan_geojson_collection,
    serialize_geojson_bytes
)
from backend.services.rag_service import execute_geospatial_rag
from backend.services.geo_resolver import resolve_geographic_context
from backend.services.chat_orchestrator import ChatRequest, ChatResponse, process_chat_message

app = FastAPI(title="SatQuery AI", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class FetchRequest(BaseModel):
    bbox: List[float] = Field(..., min_length=4, max_length=4)
    start_date: str
    end_date: str

class QueryRequest(BaseModel):
    query: str
    geojson_context: Dict[str, Any]

class GeoResolveRequest(BaseModel):
    bbox: List[float] = Field(..., min_length=4, max_length=4)

@app.get("/health")
async def health_check() -> Dict[str, str]:
    return {"status": "ok", "service": "satquery-ai"}

@app.post("/api/satellite/fetch")
async def fetch_and_fuse(req: FetchRequest) -> Dict[str, Any]:
    try:
        user_bbox = BoundingBox(
            min_lon=req.bbox[0],
            min_lat=req.bbox[1],
            max_lon=req.bbox[2],
            max_lat=req.bbox[3]
        )
        scenes = await fetch_satellite_metadata(req.bbox, req.start_date, req.end_date)
        fused_records = fuse_satellite_records(scenes["sar"], scenes["optical"], user_bbox)
        geojson_data = build_bhuvan_geojson_collection(fused_records)
        return {
            "status": "success",
            "sar_count": len(scenes["sar"]),
            "optical_count": len(scenes["optical"]),
            "fused_count": len(fused_records),
            "geojson": geojson_data
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

@app.post("/api/export/geojson")
async def export_geojson(geojson_payload: Dict[str, Any]):
    if not geojson_payload or "features" not in geojson_payload:
        raise HTTPException(status_code=400, detail="Invalid GeoJSON payload")
    data_bytes = serialize_geojson_bytes(geojson_payload)
    return StreamingResponse(
        io.BytesIO(data_bytes),
        media_type="application/geo+json",
        headers={
            "Content-Disposition": "attachment; filename=satquery_export.geojson",
            "Content-Length": str(len(data_bytes))
        }
    )

@app.post("/api/query")
async def query_rag(req: QueryRequest) -> Dict[str, Any]:
    if not req.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty")
    return await execute_geospatial_rag(req.query, req.geojson_context)

@app.post("/api/geo/resolve")
async def geo_resolve(req: GeoResolveRequest) -> Dict[str, Any]:
    return await resolve_geographic_context(req.bbox)

@app.post("/api/chat")
async def chat_conversational(req: ChatRequest) -> ChatResponse:
    if not req.query.strip():
        raise HTTPException(status_code=400, detail="Chat query cannot be empty")
    reply, geo_context = await process_chat_message(req.query, req.bbox, req.chat_history)
    return ChatResponse(reply=reply, geo_context=geo_context)

@app.post("/api/imagery/search")
async def imagery_search(req: ImagerySearchRequest) -> Dict[str, Any]:
    try:
        return await search_imagery(req.bbox, req.start_date, req.end_date)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

@app.get("/api/imagery/proxy")
async def imagery_proxy(url: str, request: Request):
    try:
        range_header = request.headers.get("Range")
        data, status_code, headers = await proxy_cog_bytes(url, range_header)
        return Response(content=data, status_code=status_code, headers=headers)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=False)
